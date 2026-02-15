import { searchMemoriesFTS, getAllMemories } from "../db.js";
import { embed, cosineSimilarity, bufferToEmbedding, isModelReady } from "../embeddings.js";
import type { MemoryType, MemoryTier } from "../types.js";

export async function handleMmRecall(args: {
  query: string;
  limit?: number;
  tier?: MemoryTier;
  type?: MemoryType;
}): Promise<{ success: boolean; results: Array<Record<string, unknown>>; count: number }> {
  const limit = args.limit ?? 10;
  const fetchLimit = limit * 2;

  // FTS5 keyword search
  const ftsResults = searchMemoriesFTS(args.query, fetchLimit);

  // Build FTS score map (rank by position, normalized 0-1)
  const ftsScoreMap = new Map<string, number>();
  ftsResults.forEach((mem, i) => {
    ftsScoreMap.set(mem.id, 1 - i / Math.max(ftsResults.length, 1));
  });

  // Semantic search (if model available)
  const semanticScoreMap = new Map<string, number>();
  const queryEmbedding = await embed(args.query);

  if (queryEmbedding) {
    // Get all non-archived memories with embeddings
    const allMemories = getAllMemories(args.tier, 1000);
    for (const mem of allMemories) {
      if (mem.embedding) {
        const memEmbedding = bufferToEmbedding(mem.embedding);
        const score = cosineSimilarity(queryEmbedding, memEmbedding);
        semanticScoreMap.set(mem.id, score);
      }
    }
  }

  // Merge: collect all unique IDs
  const allIds = new Set([...ftsScoreMap.keys(), ...semanticScoreMap.keys()]);
  const scored: Array<{ id: string; score: number }> = [];

  for (const id of allIds) {
    const ftsScore = ftsScoreMap.get(id) ?? 0;
    const semScore = semanticScoreMap.get(id) ?? 0;

    // Hybrid weighting: semantic 0.7, keyword 0.3
    const combinedScore = isModelReady()
      ? semScore * 0.7 + ftsScore * 0.3
      : ftsScore; // FTS-only fallback

    scored.push({ id, score: combinedScore });
  }

  scored.sort((a, b) => b.score - a.score);
  const topIds = scored.slice(0, limit);

  // Build result objects from FTS results + all memories
  const allMemMap = new Map<string, typeof ftsResults[number]>();
  for (const mem of ftsResults) allMemMap.set(mem.id, mem);
  if (queryEmbedding) {
    const allMems = getAllMemories(args.tier, 1000);
    for (const mem of allMems) allMemMap.set(mem.id, mem);
  }

  const results = topIds
    .map(({ id, score }) => {
      const mem = allMemMap.get(id);
      if (!mem) return null;
      // Filter by type if specified
      if (args.type && mem.type !== args.type) return null;
      return {
        id: mem.id,
        title: mem.title,
        content: mem.content,
        type: mem.type,
        score: Math.round(score * 1000) / 1000,
        tags: mem.tags,
        created_at: mem.created_at,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return { success: true, results, count: results.length };
}
