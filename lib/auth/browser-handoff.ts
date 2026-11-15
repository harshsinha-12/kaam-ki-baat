// Operator-prepared links carry capabilities in the fragment, which is never
// sent to the web server. Consume it once before sibling React effects run.
export interface BrowserHandoff { deviceToken: string; callToken: string; boardKey: string }
const empty = (): BrowserHandoff => ({ deviceToken: "", callToken: "", boardKey: "" });
let current: BrowserHandoff | undefined;

export function parseBrowserHandoff(hash: string, search: string): BrowserHandoff {
  const fragment = new URLSearchParams(hash.length <= 4096 ? hash.replace(/^#/, "") : "");
  const token = (name: string) => {
    const value = fragment.get(name) ?? "";
    return /^[A-Za-z0-9_-]{16,256}$/.test(value) ? value : "";
  };
  const boardKey = fragment.get("b") ?? new URLSearchParams(search).get("key") ?? "";
  return { deviceToken: token("t"), callToken: token("c"), boardKey: boardKey.length <= 512 && !/[\r\n]/.test(boardKey) ? boardKey : "" };
}

export function browserHandoff(): BrowserHandoff {
  if (typeof window === "undefined") return empty();
  if (current) return current;
  current = parseBrowserHandoff(window.location.hash, window.location.search);
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  if (["t", "c", "b"].some(key => fragment.has(key))) {
    for (const key of ["t", "c", "b"]) fragment.delete(key);
    const remainder = fragment.toString();
    window.history.replaceState(null, "", window.location.pathname + window.location.search + (remainder ? `#${remainder}` : ""));
  }
  // Call and board credentials remain in this page's memory only.
  return current;
}
