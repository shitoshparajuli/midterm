import type { NextConfig } from "next";
import { ARCHIVED } from "./src/lib/election";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Archived locks are read from disk at request time.
  outputFileTracingIncludes: { "/scorecard": ["./data/archive/**/*"], "/api/scorecard": ["./data/archive/**/*"] },
  // Between cycles only the Scorecard is served; the live pages need the database.
  async redirects() {
    if (!ARCHIVED) return [];
    return ["/", "/races", "/races/:key", "/live", "/vs-polls"].map((source) => ({ source, destination: "/scorecard", permanent: false }));
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
