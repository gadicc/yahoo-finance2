/** Cumulative counts for one endpoint family within a test file. */
export interface RecacheEndpointStats {
  endpoint: string;
  requests: number;
  reused: number;
  statuses: Record<string, number>;
}

export const RECACHE_STATS_PREFIX = "YF_RECACHE_STATS ";

/** Group symbol paths without exposing query strings, cookies, or payloads. */
export function recacheEndpoint(url: URL): string {
  const path = url.pathname.replace(
    /\/(quoteSummary|recommendationsbysymbol|chart|options|timeseries|quote)\/[^/]+$/,
    "/$1/:symbol",
  );
  return url.host + path.replace(/\/trending\/[^/]+$/, "/trending/:country");
}

/** Only accept the private runner's counter records, never arbitrary test text. */
export function parseRecacheStats(
  line: string,
): RecacheEndpointStats[] | undefined {
  if (!line.startsWith(RECACHE_STATS_PREFIX)) return;
  let data: unknown;
  try {
    data = JSON.parse(line.slice(RECACHE_STATS_PREFIX.length));
  } catch {
    return;
  }
  const count = (value: unknown): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  if (
    Array.isArray(data) &&
    data.every((item) =>
      item !== null && typeof item === "object" &&
      typeof item.endpoint === "string" && count(item.requests) &&
      count(item.reused) &&
      item.statuses !== null && typeof item.statuses === "object" &&
      !Array.isArray(item.statuses) &&
      Object.entries(item.statuses).every(([status, value]) =>
        /^(?:\d{3}|networkError)$/.test(status) && count(value)
      )
    )
  ) return data;
}

/** Add the final cumulative snapshot from each file, avoiding repeated-hook counts. */
export function mergeRecacheStats(
  snapshots: Iterable<RecacheEndpointStats[]>,
): RecacheEndpointStats[] {
  const totals = new Map<string, RecacheEndpointStats>();
  for (const snapshot of snapshots) {
    for (const row of snapshot) {
      let total = totals.get(row.endpoint);
      if (!total) {
        total = {
          endpoint: row.endpoint,
          requests: 0,
          reused: 0,
          statuses: {},
        };
        totals.set(row.endpoint, total);
      }
      total.requests += row.requests;
      total.reused += row.reused;
      for (const [status, value] of Object.entries(row.statuses)) {
        total.statuses[status] = (total.statuses[status] ?? 0) + value;
      }
    }
  }
  return [...totals.values()].sort((a, b) =>
    a.endpoint.localeCompare(b.endpoint)
  );
}

/** Markdown is readable in both the command log and GitHub's job summary. */
export function formatRecacheStats(rows: RecacheEndpointStats[]): string {
  const lines = ["### Yahoo recache request counts", ""];
  if (!rows.length) {
    return [...lines, "No live network requests were made."].join("\n");
  }
  lines.push(
    "| Endpoint | Network attempts | Reused | Outcomes |",
    "| --- | ---: | ---: | --- |",
  );
  for (const row of rows) {
    const outcomes = Object.entries(row.statuses).sort().map((
      [status, count],
    ) => `${status}: ${count}`).join(", ");
    lines.push(
      `| ${row.endpoint} | ${row.requests} | ${row.reused} | ${outcomes} |`,
    );
  }
  const attempts = rows.reduce((total, row) => total + row.requests, 0);
  const reused = rows.reduce((total, row) => total + row.reused, 0);
  lines.push(
    "",
    `Total: ${attempts} network attempts; ${reused} requests reused.`,
  );
  return lines.join("\n");
}
