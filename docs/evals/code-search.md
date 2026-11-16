## Code search (Code Navigator) · harshsinha-12/kaam-ki-baat @ 652c30b

Can it name the right function from a plain-language question? Metrics follow repository-level localization benchmarks: accuracy and recall at k for functions and files, MRR and nDCG@10. Intervals are bootstrap 95% over questions.

### Development set (28 questions)

| Method | Fn Acc@1 | Fn Acc@5 (95% CI) | Fn Rec@10 | MRR@10 | nDCG@10 | File Acc@1 | File Acc@5 | Latency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| grep | n/a | n/a | n/a | n/a | n/a | 7% | 39% | 3.4 ms |
| bm25 | 21% | 46% (29%–64%) | 61% | 0.33 | 0.38 | 32% | 82% | 3.4 ms |
| graph-v1 | 32% | 32% (18%–50%) | 23% | 0.32 | 0.25 | 32% | 32% | 14.1 ms |
| semantic | 46% | 100% (100%–100%) | 95% | 0.68 | 0.72 | 54% | 100% | 7.4 ms |

### Held-out set, written after tuning (12 questions)

| Method | Fn Acc@1 | Fn Acc@5 (95% CI) | Fn Rec@10 | MRR@10 | nDCG@10 | File Acc@1 | File Acc@5 | Latency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| grep | n/a | n/a | n/a | n/a | n/a | 25% | 58% | 3.3 ms |
| bm25 | 0% | 17% (0%–42%) | 21% | 0.07 | 0.11 | 0% | 42% | 3.0 ms |
| graph-v1 | 0% | 0% (0%–0%) | 0% | 0.00 | 0.00 | 0% | 0% | 14.8 ms |
| semantic | 8% | 42% (17%–67%) | 46% | 0.20 | 0.25 | 33% | 67% | 7.4 ms |

### Stress set: Hinglish and colloquial paraphrases (14 questions)

| Method | Fn Acc@1 | Fn Acc@5 (95% CI) | Fn Rec@10 | MRR@10 | nDCG@10 | File Acc@1 | File Acc@5 | Latency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| grep | n/a | n/a | n/a | n/a | n/a | 0% | 36% | 3.4 ms |
| bm25 | 7% | 36% (14%–64%) | 32% | 0.15 | 0.17 | 14% | 36% | 3.2 ms |
| graph-v1 | 21% | 21% (0%–43%) | 14% | 0.21 | 0.16 | 29% | 29% | 13.2 ms |
| semantic | 21% | 71% (50%–93%) | 67% | 0.40 | 0.44 | 29% | 79% | 7.4 ms |

### Fresh test set (2026-11-16), written before tuning and never used to tune (22 questions)

| Method | Fn Acc@1 | Fn Acc@5 (95% CI) | Fn Rec@10 | MRR@10 | nDCG@10 | File Acc@1 | File Acc@5 | Latency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| grep | n/a | n/a | n/a | n/a | n/a | 9% | 36% | 4.0 ms |
| bm25 | 14% | 50% (32%–73%) | 55% | 0.26 | 0.33 | 18% | 73% | 3.2 ms |
| graph-v1 | 9% | 9% (0%–23%) | 9% | 0.09 | 0.09 | 14% | 14% | 15.0 ms |
| semantic | 23% | 77% (59%–95%) | 86% | 0.45 | 0.55 | 32% | 95% | 7.7 ms |

grep ranks files only; graph-v1 returns one seed, so its Acc@5 equals Acc@1.
