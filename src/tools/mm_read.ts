import { getMemory } from "../db.js";

export async function handleMmRead(args: {
  id: string;
}): Promise<Record<string, unknown>> {
  const memory = getMemory(args.id);
  if (!memory) {
    return { success: false, message: "Memory not found" };
  }

  return {
    success: true,
    memory: {
      id: memory.id,
      type: memory.type,
      title: memory.title,
      content: memory.content,
      tags: memory.tags,
      metadata: memory.metadata,
      tier: memory.tier,
      created_at: memory.created_at,
      updated_at: memory.updated_at,
      accessed_at: memory.accessed_at,
      access_count: memory.access_count,
    },
  };
}
