import { moltbookFetch, requireToken } from "../moltbook_client.js";

export type MbVoteAction = "upvote_post" | "downvote_post" | "upvote_comment";

export async function handleMbVote(args: {
  action: MbVoteAction;
  post_id?: string;
  comment_id?: string;
}): Promise<Record<string, unknown>> {
  const token = requireToken();

  switch (args.action) {
    case "upvote_post": {
      if (!args.post_id) {
        return { success: false, message: "post_id is required to upvote a post" };
      }
      const res = await moltbookFetch(`/posts/${args.post_id}/upvote`, {
        method: "POST",
        token,
      });
      if (!res.ok) {
        return { success: false, message: res.error ?? "Failed to upvote post" };
      }
      return { success: true, message: "Post upvoted.", data: res.data };
    }

    case "downvote_post": {
      if (!args.post_id) {
        return { success: false, message: "post_id is required to downvote a post" };
      }
      const res = await moltbookFetch(`/posts/${args.post_id}/downvote`, {
        method: "POST",
        token,
      });
      if (!res.ok) {
        return { success: false, message: res.error ?? "Failed to downvote post" };
      }
      return { success: true, message: "Post downvoted.", data: res.data };
    }

    case "upvote_comment": {
      if (!args.comment_id) {
        return { success: false, message: "comment_id is required to upvote a comment" };
      }
      const res = await moltbookFetch(`/comments/${args.comment_id}/upvote`, {
        method: "POST",
        token,
      });
      if (!res.ok) {
        return { success: false, message: res.error ?? "Failed to upvote comment" };
      }
      return { success: true, message: "Comment upvoted.", data: res.data };
    }

    default:
      return { success: false, message: `Unknown action: ${args.action}` };
  }
}
