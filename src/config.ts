const MOLTBOOK_TOOLS = [
  "mb_auth",
  "mb_post",
  "mb_feed",
  "mb_comment",
  "mb_vote",
  "mb_social",
  "mb_submolt",
];

let moltbookEnabled: boolean | null = null;

function parseMoltbookFlag(): boolean {
  return process.argv.includes("--moltbook");
}

export function isMoltbookEnabled(): boolean {
  if (moltbookEnabled === null) {
    moltbookEnabled = parseMoltbookFlag();
  }
  return moltbookEnabled;
}

export function isToolEnabled(toolName: string): boolean {
  if (MOLTBOOK_TOOLS.includes(toolName)) {
    return isMoltbookEnabled();
  }
  return true;
}

export function getToolMode(): "default" | "moltbook" {
  return isMoltbookEnabled() ? "moltbook" : "default";
}

export function getEnabledToolCount(): number {
  return isMoltbookEnabled() ? 21 : 14;
}
