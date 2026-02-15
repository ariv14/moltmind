import { initProjectVault } from "../db.js";

export async function handleMmInit(): Promise<{ success: boolean; path: string; message: string }> {
  const path = initProjectVault();
  return { success: true, path, message: "Project vault initialized at .moltmind/memory.db" };
}
