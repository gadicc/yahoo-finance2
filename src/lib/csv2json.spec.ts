import csv2json from "./csv2json.js";

describe("csv2json", () => {
  it("handles historical input", () => {
    const csv = "Date,Open,High,Low,Close,Adj Close,Volume\n" +
      "2020-10-29,112.370003,116.930000,112.199997,115.320000,115.121384,146129200\n" +
      "2020-10-30,111.059998,111.989998,107.720001,108.860001,108.672516,190272600";

    const obj = csv2json(csv);
    expect(obj.length).toBe(2);

    // camelcase
    const headers = Object.keys(obj[0]);
    expect(headers[0]).toBe("date");
    expect(headers[5]).toBe("adjClose");

    expect(obj[0].date).toBeInstanceOf(Date);
    expect(obj[0].open).toBeType("number");
  });

  it("returns anything else - not actually used in historical", () => {
    const csv = "string\nstring";
    const obj = csv2json(csv);
    expect(obj[0].string).toBeType("string");
  });

  /*
  actually, one line files are ok... headers and no data.
  it("throws on weird file (no newlines)", () => {
    const csv = "one line file";
    expect(() => csv2json(csv)).toThrow(/No newlines/);
  });
  */

  it("handles nulls", () => {
    const obj = csv2json("val\nnull")[0];
    expect(obj.val).toBe(null);
  });
});
