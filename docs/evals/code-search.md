## Code search (Code Navigator) · harshsinha-12/kaam-ki-baat @ d814ee0

Can it name the right function from a plain-language question? Metrics follow repository-level localization benchmarks: accuracy and recall at k for functions and files, MRR and nDCG@10. Intervals are bootstrap 95% over questions.

### Development set (28 questions)

| Method | Fn Acc@1 | Fn Acc@5 (95% CI) | Fn Rec@10 | MRR@10 | nDCG@10 | File Acc@1 | File Acc@5 | Latency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| grep | n/a | n/a | n/a | n/a | n/a | 7% | 36% | 3.7 ms |
| bm25 | 21% | 57% (39%–75%) | 63% | 0.35 | 0.39 | 32% | 86% | 3.4 ms |
| graph-v1 | 36% | 36% (18%–54%) | 27% | 0.36 | 0.29 | 36% | 36% | 15.1 ms |
| semantic | 61% | 100% (100%–100%) | 95% | 0.76 | 0.79 | 68% | 100% | 9.8 ms |

### Held-out set, written after tuning (12 questions)

| Method | Fn Acc@1 | Fn Acc@5 (95% CI) | Fn Rec@10 | MRR@10 | nDCG@10 | File Acc@1 | File Acc@5 | Latency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| grep | n/a | n/a | n/a | n/a | n/a | 17% | 50% | 3.1 ms |
| bm25 | 0% | 17% (0%–42%) | 21% | 0.06 | 0.10 | 0% | 42% | 3.1 ms |
| graph-v1 | 0% | 0% (0%–0%) | 0% | 0.00 | 0.00 | 0% | 0% | 13.4 ms |
| semantic | 8% | 42% (17%–67%) | 54% | 0.21 | 0.28 | 33% | 75% | 7.0 ms |

### Stress set: Hinglish and colloquial paraphrases (14 questions)

| Method | Fn Acc@1 | Fn Acc@5 (95% CI) | Fn Rec@10 | MRR@10 | nDCG@10 | File Acc@1 | File Acc@5 | Latency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| grep | n/a | n/a | n/a | n/a | n/a | 0% | 29% | 3.3 ms |
| bm25 | 7% | 36% (14%–64%) | 39% | 0.20 | 0.21 | 21% | 43% | 3.0 ms |
| graph-v1 | 14% | 14% (0%–36%) | 7% | 0.14 | 0.09 | 21% | 21% | 13.4 ms |
| semantic | 36% | 71% (50%–93%) | 67% | 0.51 | 0.53 | 50% | 79% | 7.5 ms |

### Fresh test set (2026-11-16), written before tuning and never used to tune (22 questions)

| Method | Fn Acc@1 | Fn Acc@5 (95% CI) | Fn Rec@10 | MRR@10 | nDCG@10 | File Acc@1 | File Acc@5 | Latency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| grep | n/a | n/a | n/a | n/a | n/a | 5% | 32% | 4.5 ms |
| bm25 | 14% | 50% (32%–73%) | 57% | 0.26 | 0.34 | 18% | 73% | 4.1 ms |
| graph-v1 | 9% | 9% (0%–23%) | 9% | 0.09 | 0.09 | 14% | 14% | 14.2 ms |
| semantic | 27% | 86% (73%–100%) | 84% | 0.49 | 0.58 | 41% | 91% | 8.9 ms |

grep ranks files only; graph-v1 returns one seed, so its Acc@5 equals Acc@1.

### Highlight quality (29 questions where the top answer is the right function, all sets)

| Highlight | Shows a line with the question's own words | Lines to read | Highlighted lines that are evidence |
| --- | --- | --- | --- |
| declaration + 2 lines (before) | 48% | 3.0 | 66% |
| signature + matching body lines (now) | 97% | 3.4 | 95% |
