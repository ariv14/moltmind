import { deleteMemory } from "../db.js";

export async function handleMmDelete(args: {
  id: string;
}): Promise<{ success: boolean; message: string }> {
  const deleted = deleteMemory(args.id);
  if (!deleted) {
    return { success: false, message: "Memory not found" };
  }
  return { success: true, message: "Memory archived" };
}
