import { deleteMemory, logSessionEvent } from "../db.js";
import { getVectorStore } from "../vector_store.js";
import { getCurrentSessionId } from "../metrics.js";

export async function handleMmDelete(args: {
  id: string;
}): Promise<{ success: boolean; message: string }> {
  const deleted = deleteMemory(args.id);
  if (!deleted) {
    return { success: false, message: "Memory not found" };
  }

  // Remove from vector store (no-op on BruteForceStore)
  getVectorStore().delete(args.id);

  // Log cross-session event
  const sessionId = getCurrentSessionId();
  if (sessionId) {
    logSessionEvent(sessionId, "memory_archived", args.id);
  }

  return { success: true, message: "Memory archived" };
}
