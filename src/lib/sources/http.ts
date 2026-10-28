/** fetch JSON with retries + backoff on 429/5xx. */
export async function getJson<T>(url: string, { retries = 6, timeoutMs = 20_000 } = {}): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let retryAfter = 0;
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "midterm-tracker/0.1 (+https://github.com/shitoshparajuli/midterm)" },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
      if (res.ok) return (await res.json()) as T;
      if (res.status !== 429 && res.status < 500) {
        throw new Error(`HTTP ${res.status} ${url}: ${(await res.text()).slice(0, 200)}`);
      }
      lastErr = new Error(`HTTP ${res.status} ${url}`);
      retryAfter = Number(res.headers.get("retry-after")) * 1000 || 0;
    } catch (e) {
      lastErr = e;
      if (e instanceof Error && e.message.startsWith("HTTP 4")) throw e;
    }
    await new Promise((r) => setTimeout(r, Math.max(retryAfter, 500 * 2 ** attempt) + Math.random() * 250));
  }
  throw lastErr;
}

export const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
