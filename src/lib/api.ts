/** JSON response with CDN caching (Vercel honours s-maxage / stale-while-revalidate). */
export function json(data: unknown, { maxAge = 60, status = 200 } = {}) {
  return Response.json(data, {
    status,
    headers: { "cache-control": `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 5}` },
  });
}
