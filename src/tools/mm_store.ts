import { insertMemory } from "../db.js";
import { embed, embeddingToBuffer } from "../embeddings.js";
import { checkStoreLimits } from "../license.js";
import { isZvecEnabled } from "../config.js";
import { getVectorStore } from "../vector_store.js";
import type { MemoryType } from "../types.js";

export async function handleMmStore(args: {
  title: string;
  content: string;
  type?: MemoryType;
  tags?: string[];
  metadata?: Record<string, unknown>;
}): Promise<{ success: boolean; id?: string; message?: string }> {
  // Enforce free tier limits
  const limits = checkStoreLimits();
  if (!limits.allowed) {
    return { success: false, message: limits.message };
  }

  const type = args.type ?? "raw";
  const tags = args.tags ?? [];
  const metadata = args.metadata ?? {};

  const embedding = await embed(`${args.title} ${args.content}`);
  const embeddingBuf = embedding ? embeddingToBuffer(embedding) : null;

  const memory = insertMemory({
    type,
    title: args.title,
    content: args.content,
    tags,
    metadata,
    embedding: embeddingBuf,
    tier: "hot",
  });

  // Dual-write to Zvec if active
  if (isZvecEnabled() && embedding) {
    getVectorStore().upsert(memory.id, embedding);
  }

  return { success: true, id: memory.id, message: `Memory stored: ${memory.title}` };
}
