"""Removes vibrato from the FluidR3 violin samples, tunes them to A440 and makes them longer.

For each note:
1. the instantaneous frequency of the strongest low harmonic is tracked by heterodyning
   (multiply by a complex tone at the note's frequency, low-pass, take the phase slope);
2. the sound is re-read at a varying speed that cancels that wobble ("varispeed"), so the
   waveform itself is untouched and the timbre stays the same; this also tunes to A440;
3. the loudness wobble that comes with vibrato is evened out with a slow gain curve;
4. the steady part is extended to LENGTH seconds with phase-aligned crossfades,
   so long notes play without looping.
"""
import sys
import wave
import numpy as np

SR = 44100
LENGTH = 6.0
NOTES = {"G3": 55, "Bb3": 58, "Db4": 61, "E4": 64, "G4": 67, "Bb4": 70, "Db5": 73, "E5": 76,
         "G5": 79, "Bb5": 82, "Db6": 85, "E6": 88, "G6": 91, "Bb6": 94, "Db7": 97, "E7": 100}


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def read(path):
    with wave.open(path) as w:
        assert w.getframerate() == SR and w.getsampwidth() == 2
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768
        return x.reshape(-1, w.getnchannels()).mean(axis=1)


def write(path, y):
    pcm = (np.clip(y, -1, 1) * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def box(x, n, times=4):
    """Cascade of moving averages: a cheap low-pass with nulls at multiples of SR/n."""
    n = max(1, int(n))
    k = np.ones(n) / n
    for _ in range(times):
        x = np.convolve(x, k, mode="same")
    return x


def track(x, f_nom):
    """Instantaneous f0 (Hz) per sample, and the harmonic used."""
    t = np.arange(len(x)) / SR
    seg = x[int(0.4 * SR): int(min(len(x), 2.6 * SR))]
    spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg))))
    freqs = np.fft.rfftfreq(len(seg), 1 / SR)
    best_k, best_e, centre = 1, -1, f_nom
    for k in (1, 2, 3):
        band = (freqs > k * f_nom * 0.95) & (freqs < k * f_nom * 1.05)
        if not band.any() or k * f_nom > SR / 2 - 2000:
            continue
        e = spec[band].max()
        if e > best_e * 1.6:  # prefer the fundamental unless a harmonic is much stronger
            best_k, best_e = k, e
            centre = freqs[band][np.argmax(spec[band])] / k
    fc = centre * best_k
    z = x * np.exp(-2j * np.pi * fc * t)
    cutoff = min(60.0, centre / 3)
    z = box(z.real, SR / cutoff) + 1j * box(z.imag, SR / cutoff)
    phase = np.unwrap(np.angle(z))
    dev = np.gradient(phase) * SR / (2 * np.pi)
    f0 = (fc + box(dev, SR / 40, 2)) / best_k
    # The attack and the very end are too short for a reliable estimate: hold the edges.
    a, b = int(0.15 * SR), int(len(x) - 0.12 * SR)
    f0[:a] = f0[a]
    f0[b:] = f0[b - 1]
    return f0, best_k


def sinc_resample(x, pos, taps=16):
    """x read at fractional positions pos (windowed-sinc interpolation)."""
    i0 = np.floor(pos).astype(np.int64)
    frac = pos - i0
    out = np.zeros(len(pos))
    half = taps // 2
    for j in range(-half + 1, half + 1):
        idx = np.clip(i0 + j, 0, len(x) - 1)
        d = j - frac
        w = np.sinc(d) * (0.5 + 0.5 * np.cos(np.pi * d / half))
        out += x[idx] * w
    return out


def flatten(x, f_nom):
    f0, k = track(x, f_nom)
    ratio = f0 / f_nom  # >1 where the note is sharp: read the input more slowly there
    t_out = np.concatenate([[0], np.cumsum(ratio[:-1])])  # output time (samples) for each input sample
    n_out = int(t_out[-1])
    pos = np.interp(np.arange(n_out), t_out, np.arange(len(x)))
    return sinc_resample(x, pos), f0, k


def moving(x, n):
    n = max(1, int(n))
    pad = np.pad(x, (n, n), mode="edge")
    return np.convolve(pad, np.ones(n) / n, mode="same")[n:-n]


def even_loudness(y, attack=0.2):
    hop, win = 220, 1764  # 5 ms hop, 40 ms window
    frames = np.arange(0, len(y) - win, hop)
    rms = np.array([np.sqrt(np.mean(y[i:i + win] ** 2)) + 1e-9 for i in frames])
    slow = moving(rms, int(0.6 * SR / hop))  # keeps the bow's slow shape, drops the 5-6 Hz wobble
    gain = moving(np.clip(slow / rms, 0.6, 1.7), int(0.05 * SR / hop))
    g = np.interp(np.arange(len(y)) / SR, (frames + win / 2) / SR, gain)
    ramp = np.clip((np.arange(len(y)) / SR - attack) / 0.15, 0, 1)
    return y * (1 + ramp * (g - 1))


def extend(y, f0, start=0.7, end_margin=0.3, fade=0.15):
    """Repeats the steady part with crossfades until LENGTH seconds."""
    s, e = int(start * SR), int(len(y) - end_margin * SR)
    steady = y[s:e]
    xf = int(fade * SR)
    period = SR / f0
    out = y[:e].copy()
    while len(out) < LENGTH * SR + xf:
        # The tone is now exactly periodic, so start the copy at the same phase as the tail.
        n = len(out) - xf
        phase = ((n - s) % period)
        off = int(round(phase))
        best, score = off, -2
        for cand in range(max(0, off - 8), off + 9):
            a, b = out[n:n + 512], steady[cand:cand + 512]
            if len(b) < 512:
                continue
            c = np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12)
            if c > score:
                best, score = cand, c
        nxt = steady[best:]
        if len(nxt) < 2 * xf:
            nxt = steady
        w = np.linspace(0, np.pi / 2, xf)
        mixed = out[n:] * np.cos(w) + nxt[:xf] * np.sin(w)
        out = np.concatenate([out[:n], mixed, nxt[xf:]])
    out = out[: int(LENGTH * SR)]
    tail = int(0.3 * SR)
    out[-tail:] *= np.linspace(1, 0, tail) ** 2
    return out


# The original Bb6 sample is silent; it is made from G6 three semitones up.
DERIVED = {"Bb6": ("G6", 3)}


def main(src, dst):
    results = {}
    originals = {}
    for name, midi in NOTES.items():
        if name in DERIVED:
            base, semis = DERIVED[name]
            x0 = read(f"{src}/{base}.wav")
            x = sinc_resample(x0, np.arange(0, len(x0) - 1, 2 ** (semis / 12)))
        else:
            x = read(f"{src}/{name}.wav")
            originals[name] = np.sqrt(np.mean(x[int(0.5 * SR): int(2.5 * SR)] ** 2))
        f_nom = hz(midi)
        y, f0, k = flatten(x, f_nom)
        y, _, _ = flatten(y, f_nom)  # second pass takes out what the smoothed tracker missed
        mid = f0[int(0.4 * SR): int(min(len(f0), 2.6 * SR))]
        cents = 1200 * np.log2(mid / f_nom)
        y = even_loudness(y)
        y = extend(y, f_nom)
        results[name] = y
        print(f"{name}: harmonic {k}, was {np.median(cents):+.0f} cents, vibrato {np.percentile(cents, 95) - np.percentile(cents, 5):.0f} cents p2p", file=sys.stderr)
    # One gain for all notes: overall loudness as in the original set, relative levels kept.
    level = np.mean([np.sqrt(np.mean(results[n][int(0.5 * SR): int(2.5 * SR)] ** 2)) for n in originals])
    gain = np.mean(list(originals.values())) / level
    peak = max(np.max(np.abs(y)) for y in results.values()) * gain
    if peak > 0.95:
        gain *= 0.95 / peak
    print(f"gain {gain:.3f}, peak {max(np.max(np.abs(y)) for y in results.values()) * gain:.3f}", file=sys.stderr)
    for name, y in results.items():
        write(f"{dst}/{name}.wav", y * gain)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
