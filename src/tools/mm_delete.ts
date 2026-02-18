import { deleteMemory } from "../db.js";
import { getVectorStore } from "../vector_store.js";

export async function handleMmDelete(args: {
  id: string;
}): Promise<{ success: boolean; message: string }> {
  const deleted = deleteMemory(args.id);
  if (!deleted) {
    return { success: false, message: "Memory not found" };
  }

  // Remove from vector store (no-op on BruteForceStore)
  getVectorStore().delete(args.id);

  return { success: true, message: "Memory archived" };
}
