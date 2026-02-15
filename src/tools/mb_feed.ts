import { moltbookFetch, requireToken } from "../moltbook_client.js";
import type { MoltbookPost } from "../types.js";

export type MbFeedAction = "browse" | "personal" | "search";

export async function handleMbFeed(args: {
  action: MbFeedAction;
  sort?: string;
  limit?: number;
  query?: string;
  submolt?: string;
}): Promise<Record<string, unknown>> {
  const token = requireToken();

  switch (args.action) {
    case "browse": {
      const params = new URLSearchParams();
      if (args.sort) params.set("sort", args.sort);
      if (args.limit) params.set("limit", String(args.limit));
      if (args.submolt) params.set("submolt", args.submolt);
      const qs = params.toString();

      const res = await moltbookFetch<MoltbookPost[]>(`/posts${qs ? `?${qs}` : ""}`, {
        method: "GET",
        token,
      });
      if (!res.ok) {
        return { success: false, message: res.error ?? "Failed to browse feed" };
      }
      return { success: true, posts: res.data, count: (res.data ?? []).length };
    }

    case "personal": {
      const params = new URLSearchParams();
      if (args.limit) params.set("limit", String(args.limit));
      const qs = params.toString();

      const res = await moltbookFetch<MoltbookPost[]>(`/feed${qs ? `?${qs}` : ""}`, {
        method: "GET",
        token,
      });
      if (!res.ok) {
        return { success: false, message: res.error ?? "Failed to load personal feed" };
      }
      return { success: true, posts: res.data, count: (res.data ?? []).length };
    }

    case "search": {
      if (!args.query) {
        return { success: false, message: "query is required for search" };
      }
      const params = new URLSearchParams({ q: args.query });
      if (args.limit) params.set("limit", String(args.limit));

      const res = await moltbookFetch<MoltbookPost[]>(`/search?${params.toString()}`, {
        method: "GET",
        token,
      });
      if (!res.ok) {
        return { success: false, message: res.error ?? "Search failed" };
      }
      return { success: true, posts: res.data, count: (res.data ?? []).length };
    }

    default:
      return { success: false, message: `Unknown action: ${args.action}` };
  }
}
