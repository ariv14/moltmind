import { insertMemory } from "../db.js";
import { embed, embeddingToBuffer } from "../embeddings.js";
import type { MemoryType } from "../types.js";

export async function handleMmStore(args: {
  title: string;
  content: string;
  type?: MemoryType;
  tags?: string[];
  metadata?: Record<string, unknown>;
}): Promise<{ success: boolean; id?: string; message?: string }> {
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

  return { success: true, id: memory.id, message: `Memory stored: ${memory.title}` };
}
