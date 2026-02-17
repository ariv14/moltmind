import { getMemoryStats } from "../db.js";
import { getHealthScore } from "../diagnostics.js";
import { isModelReady } from "../embeddings.js";

const startTime = Date.now();

export async function handleMmStatus(): Promise<Record<string, unknown>> {
  const stats = getMemoryStats();
  const healthScore = getHealthScore();
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  return {
    success: true,
    version: "0.3.2",
    db_stats: stats,
    health_score: healthScore,
    embedding_model_ready: isModelReady(),
    uptime_seconds: uptimeSeconds,
  };
}
