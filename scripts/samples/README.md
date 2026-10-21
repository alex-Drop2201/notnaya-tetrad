# Violin samples

`public/samples/violin/*.mp3` are the FluidR3 GM violin (Frank Wen, CC BY 3.0, rendered by
MIDI.js Soundfonts), processed by `devibrato.py`:

- vibrato removed (the pitch wobble of ±15–30 cents at 5–6 Hz and the loudness wobble that
  comes with it), by re-reading each recording at a varying speed, so the timbre is kept;
- tuned to A = 440 Hz (some originals were up to a quarter tone off);
- lengthened from 3 to 6 seconds with crossfades, so long notes need no loop;
- Bb6, which was silent in the original set, made from G6.

To rebuild them, take the original MP3s (commit 66a58e2 on the `source` branch) and run:

```sh
mkdir -p wav out
for f in original/*.mp3; do ffmpeg -loglevel error -i "$f" -ac 1 -ar 44100 "wav/$(basename "$f" .mp3).wav"; done
python3 -m venv venv && ./venv/bin/pip install numpy
./venv/bin/python devibrato.py wav out
for f in out/*.wav; do ffmpeg -loglevel error -i "$f" -codec:a libmp3lame -q:a 3 -ac 1 "../../public/samples/violin/$(basename "$f" .wav).mp3"; done
```
