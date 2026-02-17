import { initProjectVault } from "../db.js";
import { getCurrentSessionId } from "../metrics.js";

export async function handleMmInit(): Promise<{ success: boolean; path: string; message: string }> {
  const path = initProjectVault(getCurrentSessionId());
  return { success: true, path, message: "Project vault initialized at .moltmind/memory.db" };
}
