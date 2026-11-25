// Accept only paths on this site, including search/hash, from either router state
// or the return form's redirect query parameter.
function localPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") ||
      value.startsWith("//") || value.includes("\\") ||
      Array.from(value).some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) return null;
  const base = "https://stationery.invalid";
  try {
    const url = new URL(value, base);
    if (url.origin !== base) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

export function loginRedirect(from: unknown, search: string): string {
  let stateTarget: unknown = from;
  if (from && typeof from === "object" && "pathname" in from) {
    const { pathname, search: query, hash } = from as Record<string, unknown>;
    stateTarget = typeof pathname === "string" &&
      (query === undefined || typeof query === "string" && (query === "" || query.startsWith("?"))) &&
      (hash === undefined || typeof hash === "string" && (hash === "" || hash.startsWith("#")))
      ? pathname + (query ?? "") + (hash ?? "") : null;
  }
  return localPath(stateTarget) ??
    localPath(new URLSearchParams(search).get("redirect")) ?? "/";
}
