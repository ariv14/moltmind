import { submitFeedback } from "../diagnostics.js";

export async function handleMmFeedback(args: {
  type: "bug" | "feature_request" | "friction";
  message: string;
  tool_name?: string;
}): Promise<{ success: boolean; message: string }> {
  submitFeedback(args.type, args.message, args.tool_name ?? null);
  return { success: true, message: "Feedback recorded. Thank you." };
}
