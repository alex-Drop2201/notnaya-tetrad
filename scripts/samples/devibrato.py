"""Removes vibrato from the FluidR3 violin samples, tunes them to A440 and makes them longer.

For each note:
1. the instantaneous frequency of the strongest low harmonic is tracked by heterodyning
   (multiply by a complex tone at the note's frequency, low-pass, take the phase slope);
2. the sound is re-read at a varying speed that cancels that wobble ("varispeed"), so the
   waveform itself is untouched and the timbre stays the same; this also tunes to A440;
3. the timbre wobble is evened out: with vibrato every overtone swells and fades 5-6 times
   a second as it moves across the body resonances, and that is what still sounds like
   vibrato once the pitch is steady. Each overtone's level and the bow noise are smoothed
   (the pitch is left alone); the attack and the slow changes of the bow are kept;
4. the loudness wobble that is left is evened out with a slow gain curve;
5. the steady part is extended to LENGTH seconds with phase-aligned crossfades,
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


def mavg(x, n):
    """Centred moving average, O(len) via cumulative sums, edges held."""
    n = max(1, int(n)) | 1
    pad = np.pad(x, (n // 2 + 1, n // 2), mode="edge")
    c = np.cumsum(pad)
    return (c[n:] - c[:-n]) / n


def lowpass(x, cutoff, times=3):
    """Cascade of moving averages; the first null is at `cutoff` Hz."""
    for _ in range(times):
        x = mavg(x, SR / cutoff)
    return x


def steady_timbre(y, f0, attack=0.25, fade=0.2, track=30.0, smooth=1.6):
    """Smooths the level of each overtone (keeps its phase), so the timbre stops wobbling.

    For overtone h, its complex envelope is found by heterodyning at h*f0 and low-passing at
    `track` Hz. The envelope's magnitude is then low-passed at `smooth` Hz, which removes the
    5-6 Hz swell of vibrato but keeps the slower shape of the bow. What is not an overtone
    (bow noise) gets the same smoothing per frequency bin. The attack stays original and
    fades into the result.
    """
    t = np.arange(len(y)) / SR
    harmonic = np.zeros(len(y))
    smoothed = np.zeros(len(y))
    h = 1
    while h * f0 < min(16000, SR / 2 - 1000):
        carrier = np.exp(2j * np.pi * h * f0 * t)
        z = y * np.conj(carrier)
        z = lowpass(z.real, track) + 1j * lowpass(z.imag, track)
        mag = np.abs(z)
        level = np.exp(lowpass(np.log(mag + 1e-7), smooth, times=4))
        zs = level * np.exp(1j * np.angle(z))
        harmonic += 2 * np.real(z * carrier)
        smoothed += 2 * np.real(zs * carrier)
        h += 1
    out = steady_noise(y - harmonic, smooth) + smoothed
    w = np.clip((t - attack) / fade, 0, 1)
    return y * (1 - w) + out * w


def steady_noise(r, smooth, win=2048, hop=256):
    """The same for the bow noise: each frequency bin's level is low-passed in time."""
    window = np.hanning(win)
    n = 1 + (len(r) - win) // hop
    pad = np.pad(r, (0, win + hop))
    frames = np.stack([pad[i * hop: i * hop + win] * window for i in range(n + 1)])
    spec = np.fft.rfft(frames, axis=1)
    mag = np.abs(spec) + 1e-9
    frames_per_s = SR / hop
    logm = np.log(mag)
    k = max(1, int(frames_per_s / smooth)) | 1
    for _ in range(4):
        p = np.pad(logm, ((k // 2 + 1, k // 2), (0, 0)), mode="edge")
        c = np.cumsum(p, axis=0)
        logm = (c[k:] - c[:-k]) / k
    spec = np.exp(logm) * np.exp(1j * np.angle(spec))
    out = np.zeros(len(pad))
    norm = np.zeros(len(pad))
    back = np.fft.irfft(spec, win, axis=1)
    for i in range(n + 1):
        out[i * hop: i * hop + win] += back[i] * window
        norm[i * hop: i * hop + win] += window ** 2
    return (out / np.maximum(norm, 1e-6))[: len(r)]


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


def extend(y, f0, start=0.7, end_margin=0.3, fade=0.3):
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
            a, b = out[n:n + 4096], steady[cand:cand + 4096]
            if len(b) < 4096:
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
        y = steady_timbre(y, f_nom)
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
