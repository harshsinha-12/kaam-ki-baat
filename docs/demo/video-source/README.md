# Demo film source

`../kaam-ki-baat-demo-75s.mp4` (1:15, 1080p30, −14 LUFS) and its `.srt` are built here.

- `timeline2.py`: the voice segments from the two recordings, where each lands on the clock, and the subtitle cues. Raw recordings are not committed.
- `build_voice2.py`: denoises, lowers pitch about 1.2 semitones (formants kept), adds EQ, compression and −16 LUFS loudness.
- `music2.py`: a synthesized A-minor score at 120 BPM with impacts at 0 s, 16.75 s, 45.6 s, 57.05 s and 71.5 s, ducked under the voices.
- `film2.html` + engine from `film.src.js` + `film2.tail.js`: a deterministic `render(t)` motion engine. Build `film2.js` by joining the engine, helpers and tail with the cues inserted (see `make_js.py`), then render with `render2.cjs` and mux with ffmpeg.
- Branding comes from the Build Out Loud event poster (`assets/`). Problem stats come from Microsoft WTI 2023, DX × Atlassian 2024 and Stack Overflow 2024. Eval numbers come from `docs/codegraph/EVAL.md` and `docs/evals/demo-sprint.md`.
