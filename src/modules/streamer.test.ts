import {
  createTestYahooFinance,
  describe,
  expect,
  it,
  setupCache,
} from "../../tests/common.ts";

import { decodeTypedMarketMessage } from "./streamer.ts";

describe("streamer", () => {
  setupCache();

  describe("pricing", () => {
    it("basic", () => {
      const result = decodeTypedMarketMessage(
        {
          "type": "pricing",
          "message": "CgRBQVBMFUjhmEMY4Jbi68lnKgNOTVMwCDgARTxEgT5lACBFP9gBBA==",
        },
      );
      expect(result).toEqual({
        change: 0.77001953125,
        changePercent: 0.25247371196746826,
        marketCode: "NMS",
        originalBase64:
          "CgRBQVBMFUjhmEMY4Jbi68lnKgNOTVMwCDgARTxEgT5lACBFP9gBBA==",
        price: 305.760009765625,
        priceHint: 4,
        symbol: "AAPL",
        timestampIso: "2026-05-22T08:10:22.000Z",
        timestampMs: 1779437422000,
        type: "pricing",
        unknownField6: 8,
        unknownField7: 0,
      });
    });
  });
});
