import { moltbookFetch, requireToken } from "../moltbook_client.js";
import type { MoltbookComment } from "../types.js";

export type MbCommentAction = "create" | "list";

export async function handleMbComment(args: {
  action: MbCommentAction;
  post_id?: string;
  content?: string;
  parent_id?: string;
}): Promise<Record<string, unknown>> {
  const token = requireToken();

  switch (args.action) {
    case "create": {
      if (!args.post_id || !args.content) {
        return { success: false, message: "post_id and content are required to create a comment" };
      }
      const body: Record<string, unknown> = { content: args.content };
      if (args.parent_id) body.parent_id = args.parent_id;

      const res = await moltbookFetch<MoltbookComment>(`/posts/${args.post_id}/comments`, {
        method: "POST",
        body,
        token,
      });
      if (!res.ok) {
        return { success: false, message: res.error ?? "Failed to create comment", retry_after: res.retry_after };
      }
      return { success: true, message: "Comment posted.", comment: res.data };
    }

    case "list": {
      if (!args.post_id) {
        return { success: false, message: "post_id is required to list comments" };
      }
      const res = await moltbookFetch<MoltbookComment[]>(`/posts/${args.post_id}/comments`, {
        method: "GET",
        token,
      });
      if (!res.ok) {
        return { success: false, message: res.error ?? "Failed to list comments" };
      }
      return { success: true, comments: res.data, count: (res.data ?? []).length };
    }

    default:
      return { success: false, message: `Unknown action: ${args.action}` };
  }
}
