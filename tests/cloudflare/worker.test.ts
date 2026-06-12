import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("yahoo-finance2 in Cloudflare Workers", () => {
  it("imports, constructs, and performs a mocked search", async () => {
    const response = await exports.default.fetch("https://worker.test/");
    const body = await response.json() as {
      ok: boolean;
      result: {
        quotes: Array<{ symbol: string }>;
      };
      calls: Array<{
        url: string;
        cookie: string | null;
        userAgent: string | null;
      }>;
      warnings: string[];
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.quotes[0]?.symbol).toBe("AAPL");
    expect(body.calls).toHaveLength(1);
    expect(body.calls[0]?.url).toContain(
      "https://query2.finance.yahoo.com/v1/finance/search",
    );
    expect(body.calls[0]?.url).toContain("q=AAPL");
    expect(body.calls[0]?.cookie).toBe("");
    expect(body.calls[0]?.userAgent).toContain("yahoo-finance2");
    expect(body.warnings.join("\n")).not.toContain(
      "Unsupported environment",
    );
  });
});
