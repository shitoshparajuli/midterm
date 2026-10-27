import { getJson } from "./http";

/**
 * VoteHub public polling API (https://votehub.com/polls/api/).
 * Free; attribution to VoteHub is expected when displaying the data.
 */
const API = "https://api.votehub.com/polls";

export interface VhPoll {
  id: string;
  poll_type: string; // us-senator | governor | us-representative | generic-ballot | ...
  sample_size: number | null;
  population: string | null;
  url: string | null;
  created_at: string;
  start_date: string | null;
  end_date: string;
  pollster: string;
  answers: { choice: string; pct: number }[];
  seat_name: string | null; // e.g. "SC-01" for House
  sponsors: string[];
  internal: boolean;
  partisan: "DEM" | "REP" | null;
  subject: string; // e.g. "2026 Texas", "2026 SC-01", "2026"
}

export const VH_TYPES = ["us-senator", "governor", "us-representative", "generic-ballot"] as const;

export async function fetchVoteHubPolls(): Promise<VhPoll[]> {
  const all: VhPoll[] = [];
  for (const t of VH_TYPES) {
    all.push(...(await getJson<VhPoll[]>(`${API}?poll_type=${t}`, { timeoutMs: 60_000 })));
  }
  return all.filter((p) => p.subject?.startsWith("2026"));
}
