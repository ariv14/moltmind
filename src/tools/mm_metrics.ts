import { getFullMetrics } from "../metrics.js";

export async function handleMmMetrics(): Promise<Record<string, unknown>> {
  const metrics = getFullMetrics();
  return { success: true, ...metrics };
}
