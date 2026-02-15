import { getLatestHandoff } from "../db.js";

export async function handleMmHandoffLoad(): Promise<Record<string, unknown>> {
  const handoff = getLatestHandoff();
  if (!handoff) {
    return { success: false, message: "No handoff found" };
  }
  return { success: true, handoff };
}
