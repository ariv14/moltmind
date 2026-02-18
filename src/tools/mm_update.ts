import { updateMemory } from "../db.js";
import { embed, embeddingToBuffer } from "../embeddings.js";
import { getVectorStore } from "../vector_store.js";
import type { MemoryType, MemoryTier } from "../types.js";

export async function handleMmUpdate(args: {
  id: string;
  title?: string;
  content?: string;
  type?: MemoryType;
  tags?: string[];
  metadata?: Record<string, unknown>;
  tier?: MemoryTier;
}): Promise<Record<string, unknown>> {
  const updates: Record<string, unknown> = {};
  if (args.title !== undefined) updates.title = args.title;
  if (args.content !== undefined) updates.content = args.content;
  if (args.type !== undefined) updates.type = args.type;
  if (args.tags !== undefined) updates.tags = args.tags;
  if (args.metadata !== undefined) updates.metadata = args.metadata;
  if (args.tier !== undefined) updates.tier = args.tier;

  // Re-embed if content changed
  let newEmbedding: Float32Array | null = null;
  if (args.content !== undefined) {
    const text = `${args.title ?? ""} ${args.content}`;
    newEmbedding = await embed(text);
    if (newEmbedding) {
      updates.embedding = embeddingToBuffer(newEmbedding);
    }
  }

  const updated = updateMemory(args.id, updates);
  if (!updated) {
    return { success: false, message: "Memory not found" };
  }

  // Dual-write to vector store (no-op on BruteForceStore)
  if (newEmbedding) {
    getVectorStore().upsert(args.id, newEmbedding);
  }

  return {
    success: true,
    memory: {
      id: updated.id,
      type: updated.type,
      title: updated.title,
      content: updated.content,
      tags: updated.tags,
      tier: updated.tier,
      updated_at: updated.updated_at,
    },
  };
}
