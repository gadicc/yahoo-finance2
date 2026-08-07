const commonSymbols = [
  "AAPL", // NMS (Nasdaq)
  "ADH", // Mutual fund, YHD
  "AFRAF", // PNK
  "AMZN", // NMS (Nasdaq)
  "AZT.OL", // Far less properties than other symbols (#42), OSL
  "BEKE", // NYSE
  "BFLY", // NYSE
  "WSKT.JK", // JKT
  "SPOT", // NMS (Nasdaq)
  "GOOG", // NMS (Nasdaq)
  // "UNIR.MI", // FTSE MIB // delisted.
  "OCDO.L", // LSE
  "BABA", // NYSE
  "QQQ", // ETF
  "0P000071W8.TO", // Mutual Fund
  // "MDLY", // Delisted by NYSE on 2021-07-07
  "ABBV", // NYSE
  // "BRKS", // NMS  Delisted.
  "CRON", // NMS
  "EPAC", // NYSE
  "BTC-USD", // CryptoCurrency, CoinMarketCap
  "EURUSD=X", // Currency
  // "SIMP", // see #107 // Delisted since issue.
  "ORSTED.CO", // quoteSummary.price.shortName = null (#197),
  "^VXAPL", // Index (#248)
  "GC=F", // Futures (#449),
  // "APS.AX", // .AX (#461); chart, historical, insights, recommendations, quoteSummary // Delisted
  "SWVXX", // Money Market (#905)
  "BZ=F", // Futures (#1024)
];

interface testSymbolsOptions {
  add?: Array<string>;
  skip?: Array<string>;
}

export default function testSymbols(options?: testSymbolsOptions) {
  let symbols = commonSymbols;

  if (!options) return symbols;

  if (options.skip) {
    if (
      !Array.isArray(options.skip) ||
      (options.skip.length && typeof options.skip[0] !== "string")
    ) {
      throw new Error(
        "createTestSymbols 'skip' option should be an array of strings",
      );
    }
    symbols = symbols.filter((symbol) => !options.skip!.includes(symbol));
  }

  if (options.add) {
    if (
      !Array.isArray(options.add) ||
      (options.add.length && typeof options.add[0] !== "string")
    ) {
      throw new Error(
        "createTestSymbols 'skip' option should be an array of strings",
      );
    }
    symbols = symbols.concat(options.add);
  }

  return symbols;
}
