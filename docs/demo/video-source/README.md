# Demo film source

`../kaam-ki-baat-demo.mp4` (2:34, 1080p30, −14 LUFS) and `../kaam-ki-baat-demo.srt` are built from these files.

- `timeline.py`: where each voice segment comes from in the two recordings and where it lands in the film, plus the cleaned subtitle cues.
- `build_voice.py`: cuts the segments, then removes noise, lowers the pitch about 1.2 semitones with formants kept, adds EQ, compression and −16 LUFS loudness, and places them on the clock. The raw recordings are not committed. Set the `C`/`H` paths in `timeline.py`.
- `music.py`: a synthesized A-minor score at 120 BPM that follows the film's sections, with risers and impacts on scene changes. It ducks about 11 dB under the voices.
- `film.html` + `film.src.js` (run `make_js.py` to produce `film.js`): a deterministic motion engine where `render(t)` sets each element from the clock alone. Problem stats come from Microsoft Work Trend Index 2023, DX × Atlassian State of DevEx 2024 and the Stack Overflow Developer Survey 2024. The PR timeline is read from `data/demo/repo-story.json`.
- `render.cjs`: renders frames with Playwright. Then run `ffmpeg -framerate 30 -i frames/f%05d.jpg -i audio/mix.wav -c:v libx264 -crf 19 -pix_fmt yuv420p -c:a aac out.mp4`.

The meeting, question and approval shown in the walkthrough are the demo scenario from the script. The proof figures (48-second Bolna call, PR #19 fix, code-search 46% → 93% dev / 17% → 33% held-out, 30 PRs / 146 commits) come from `docs/plan.md`, `docs/codegraph/EVAL.md` and git history.
