// Facebook Pages and Instagram Business accounts are both reached through
// the same Meta "Graph API" — shared low-level GET/POST helpers so
// facebook.ts and instagram.ts don't each reimplement error handling.
const GRAPH_VERSION = "v21.0";
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
export const FACEBOOK_DIALOG_BASE = `https://www.facebook.com/${GRAPH_VERSION}`;

export async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const res = await fetch(url.toString());
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? `Meta Graph API lỗi (${res.status}).`);
  return json as T;
}

export async function graphPost<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? `Meta Graph API lỗi (${res.status}).`);
  return json as T;
}
