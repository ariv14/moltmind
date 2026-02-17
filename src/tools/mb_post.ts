import { moltbookFetch, requireToken } from "../moltbook_client.js";
import { isDuplicatePost, recordPost, hashPostTitle, hashPostContent } from "../db.js";
import type { MoltbookPost } from "../types.js";

export type MbPostAction = "create" | "get" | "delete";

export async function handleMbPost(args: {
  action: MbPostAction;
  id?: string;
  title?: string;
  content?: string;
  submolt?: string;
}): Promise<Record<string, unknown>> {
  switch (args.action) {
    case "create": {
      const token = requireToken();
      if (!args.title || !args.content) {
        return { success: false, message: "title and content are required to create a post" };
      }

      // Dedup check — block exact/near-exact duplicates before hitting the API
      const titleHash = hashPostTitle(args.title);
      const contentHash = hashPostContent(args.content);
      const submolt = args.submolt ?? null;
      if (isDuplicatePost(titleHash, contentHash, submolt)) {
        return { success: false, message: "Duplicate post blocked. Similar content was already posted to this submolt." };
      }

      const body: Record<string, unknown> = { title: args.title, content: args.content };
      if (args.submolt) body.submolt = args.submolt;

      const res = await moltbookFetch<MoltbookPost>("/posts", {
        method: "POST",
        body,
        token,
      });
      if (!res.ok) {
        return { success: false, message: res.error ?? "Failed to create post", retry_after: res.retry_after };
      }

      // Record successful post for future dedup
      const post = res.data as MoltbookPost;
      try {
        recordPost(post.id ?? args.title, args.title, args.content, submolt);
      } catch {
        // Non-critical — don't fail the post if tracking fails
      }

      return { success: true, message: "Post created.", post: res.data };
    }

    case "get": {
      if (!args.id) {
        return { success: false, message: "id is required to get a post" };
      }
      const token = requireToken();
      const res = await moltbookFetch<MoltbookPost>(`/posts/${args.id}`, {
        method: "GET",
        token,
      });
      if (!res.ok) {
        return { success: false, message: res.error ?? "Post not found" };
      }
      return { success: true, post: res.data };
    }

    case "delete": {
      if (!args.id) {
        return { success: false, message: "id is required to delete a post" };
      }
      const token = requireToken();
      const res = await moltbookFetch(`/posts/${args.id}`, {
        method: "DELETE",
        token,
      });
      if (!res.ok) {
        return { success: false, message: res.error ?? "Failed to delete post" };
      }
      return { success: true, message: "Post deleted." };
    }

    default:
      return { success: false, message: `Unknown action: ${args.action}` };
  }
}
