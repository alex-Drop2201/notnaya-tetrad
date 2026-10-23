# Violin samples

`public/samples/violin-plain/*.mp3` are the FluidR3 GM violin (Frank Wen, CC BY 3.0, rendered by
MIDI.js Soundfonts), processed by `devibrato.py` so they sound like a plain, non-vibrato bow stroke:

- pitch wobble removed (±15–30 cents at 5–6 Hz), by re-reading each recording at a varying speed,
  so the timbre is kept;
- timbre wobble removed: with vibrato every overtone swells and fades 5–6 times a second as it moves
  across the body resonances, and that still sounds like vibrato once the pitch is steady. Each
  overtone's level and the bow noise are smoothed below ~1.6 Hz; the attack stays original;
- the loudness wobble that is left is evened out;
- tuned to A = 440 Hz (some originals were up to a quarter tone off);
- lengthened from 3 to 6 seconds with crossfades, so long notes need no loop;
- Bb6, which was silent in the original set, made from G6.

Measured on the steady part (3.5–9 Hz modulation, mean of the 16 notes): pitch 22 → 0.4 cents
peak to peak; level of the sound in third-octave bands 3.7 → 0.5 dB. The previous set
(`violin-nonvib`, pitch only) still had 2.7 dB there.

To rebuild them, take the original MP3s (`public/samples/violin/` in commit 66a58e2 on the `source` branch) and run:

```sh
mkdir -p wav out
for f in original/*.mp3; do ffmpeg -loglevel error -i "$f" -ac 1 -ar 44100 "wav/$(basename "$f" .mp3).wav"; done
python3 -m venv venv && ./venv/bin/pip install numpy
./venv/bin/python devibrato.py wav out
for f in out/*.wav; do ffmpeg -loglevel error -i "$f" -codec:a libmp3lame -q:a 3 -ac 1 "../../public/samples/violin-plain/$(basename "$f" .wav).mp3"; done
```
