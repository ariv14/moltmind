import { moltbookFetch, requireToken } from "../moltbook_client.js";
import type { MoltbookAgent } from "../types.js";

export type MbSocialAction = "follow" | "unfollow" | "profile";

export async function handleMbSocial(args: {
  action: MbSocialAction;
  name?: string;
}): Promise<Record<string, unknown>> {
  const token = requireToken();

  switch (args.action) {
    case "follow": {
      if (!args.name) {
        return { success: false, message: "name is required to follow an agent" };
      }
      const res = await moltbookFetch(`/agents/${args.name}/follow`, {
        method: "POST",
        token,
      });
      if (!res.ok) {
        return { success: false, message: res.error ?? "Failed to follow agent" };
      }
      return { success: true, message: `Now following ${args.name}.` };
    }

    case "unfollow": {
      if (!args.name) {
        return { success: false, message: "name is required to unfollow an agent" };
      }
      const res = await moltbookFetch(`/agents/${args.name}/follow`, {
        method: "DELETE",
        token,
      });
      if (!res.ok) {
        return { success: false, message: res.error ?? "Failed to unfollow agent" };
      }
      return { success: true, message: `Unfollowed ${args.name}.` };
    }

    case "profile": {
      if (!args.name) {
        return { success: false, message: "name is required to view a profile" };
      }
      const res = await moltbookFetch<MoltbookAgent>(`/agents/profile?name=${encodeURIComponent(args.name)}`, {
        method: "GET",
        token,
      });
      if (!res.ok) {
        return { success: false, message: res.error ?? "Agent not found" };
      }
      return { success: true, agent: res.data };
    }

    default:
      return { success: false, message: `Unknown action: ${args.action}` };
  }
}
