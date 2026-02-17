# MoltMind Pro — ANN Benchmark Results

> Tested on darwin x64, Intel(R) Core(TM) i9-9880H CPU @ 2.30GHz, 32GB RAM, Node v22.20.0
> Date: 2026-02-17T12:21:31.554Z | Dimensions: 384

## Headline Numbers

- **0x faster search** at 5,000 vectors vs 100-vector baseline
- **98.0% Recall@10** at 1,000 vectors — near-exact results
- **377 queries/sec** sustained throughput
- **Zero data loss** — deleted vectors never appear in results

## Recall@K — The Industry Standard

### Recall@1

| Vectors | Min | Mean | Median | P95 |
| --- | --- | --- | --- | --- |
| 100 | 100.0% | 100.0% | 100.0% | 100.0% |
| 500 | 0.0% | 99.5% | 100.0% | 100.0% |
| 1,000 | 0.0% | 97.0% | 100.0% | 100.0% |
| 5,000 | 0.0% | 96.0% | 100.0% | 100.0% |
| 10,000 | 0.0% | 81.0% | 100.0% | 100.0% |

### Recall@5

| Vectors | Min | Mean | Median | P95 |
| --- | --- | --- | --- | --- |
| 100 | 100.0% | 100.0% | 100.0% | 100.0% |
| 500 | 80.0% | 98.5% | 100.0% | 100.0% |
| 1,000 | 60.0% | 97.3% | 100.0% | 100.0% |
| 5,000 | 60.0% | 94.1% | 100.0% | 100.0% |
| 10,000 | 20.0% | 79.3% | 80.0% | 100.0% |

### Recall@10

| Vectors | Min | Mean | Median | P95 |
| --- | --- | --- | --- | --- |
| 100 | 100.0% | 100.0% | 100.0% | 100.0% |
| 500 | 80.0% | 98.5% | 100.0% | 100.0% |
| 1,000 | 80.0% | 98.0% | 100.0% | 100.0% |
| 5,000 | 60.0% | 92.7% | 90.0% | 100.0% |
| 10,000 | 40.0% | 79.9% | 80.0% | 100.0% |

### Recall@25

| Vectors | Min | Mean | Median | P95 |
| --- | --- | --- | --- | --- |
| 100 | 100.0% | 100.0% | 100.0% | 100.0% |
| 500 | 92.0% | 98.3% | 100.0% | 100.0% |
| 1,000 | 88.0% | 98.0% | 100.0% | 100.0% |
| 5,000 | 80.0% | 94.4% | 96.0% | 100.0% |
| 10,000 | 56.0% | 83.7% | 84.0% | 96.0% |

### Recall@50

| Vectors | Min | Mean | Median | P95 |
| --- | --- | --- | --- | --- |
| 100 | 100.0% | 100.0% | 100.0% | 100.0% |
| 500 | 92.0% | 98.2% | 98.0% | 100.0% |
| 1,000 | 94.0% | 98.6% | 98.0% | 100.0% |
| 5,000 | 90.0% | 97.4% | 98.0% | 100.0% |
| 10,000 | 82.0% | 93.5% | 94.0% | 98.0% |

## Search Latency

| Vectors | Cold p50 | Warm p50 | Warm p95 | Warm p99 |
| --- | --- | --- | --- | --- |
| 500 | 636µs | 432µs | 473µs | 521µs |
| 1,000 | 937µs | 659µs | 958µs | 1.07ms |
| 5,000 | 3.19ms | 2.67ms | 3.24ms | 3.37ms |
| 10,000 | 4.41ms | 3.95ms | 4.28ms | 4.60ms |

## Data Distribution Robustness

| Distribution | Recall@10 Mean | Recall@10 Median |
| --- | --- | --- |
| uniform | 98.9% | 100.0% |
| clustered | 99.2% | 100.0% |
| adversarial | 97.7% | 100.0% |

## Scalability

| Vectors | Insert Throughput | Build Time | Search p50 | Recall@10 |
| --- | --- | --- | --- | --- |
| 100 | 6,926 v/s | 784µs | 129µs | 100.0% |
| 250 | 3,298 v/s | 1.28ms | 317µs | 100.0% |
| 500 | 2,061 v/s | 3.37ms | 391µs | 99.4% |
| 1,000 | 1,224 v/s | 4.89ms | 756µs | 97.8% |
| 2,500 | 693 v/s | 9.22ms | 1.82ms | 97.6% |
| 5,000 | 503 v/s | 29.78ms | 2.67ms | 91.4% |
| 7,500 | 392 v/s | 48.63ms | 3.46ms | 84.2% |
| 10,000 | 341 v/s | 68.46ms | 3.68ms | 76.6% |

## Sustained Throughput

- **377** queries/sec
- p50: 2.58ms, p95: 3.37ms, p99: 3.60ms
- Max: 4.23ms, Spikes (>10x p50): 0
- Mixed workload: 158 qps with 99 rebuilds

## Memory Efficiency

| Vectors | Bytes/Vector | Overhead | RSS |
| --- | --- | --- | --- |
| 1,000 | 2112 B | 1.4x theoretical | 875.8 MB |
| 5,000 | 2114 B | 1.4x theoretical | 902.9 MB |
| 10,000 | 2114 B | 1.4x theoretical | 958.4 MB |

Theoretical minimum: 1536 bytes/vector (384 dims × 4 bytes)

## Correctness Guarantees

- [x] No deleted IDs in search results
- [x] stats().count correct after deletion (4000/4000)
- Recall@10 after deletion: 95.8%
- Recall@10 after reinsert: 94.6%

## Rebuild Stability

- Deterministic results: YES
- Build time CV: 0.099 (stable)

## Verdicts

- [x] **Recall@10 ≥ 90% at ≤1,000 vectors** — mean=98.0%
- [x] **Recall@10 ≥ 70% at 10,000 vectors** — mean=79.9%
- [x] **Throughput ≥ 200 qps at 5,000 vectors** — 377 qps
- [x] **No deleted IDs in search results** — clean
- [x] **Build determinism (CV < 0.3)** — CV=0.099
- [x] **Clustered recall within 10pp of uniform** — delta=0.3pp

**6/6 passed**
