import { describe, test as it } from "@std/testing/bdd";
import { expect } from "@std/expect";

import validateAndCoerce, { type JSONSchema } from "./index.ts";
const definitions = {};

function voc(
  input: Parameters<typeof validateAndCoerce>[0],
  schema: Parameters<typeof validateAndCoerce>[1],
) {
  return validateAndCoerce(
    input,
    schema,
    { definitions, logger: console, logObj: console.dir },
  );
}

describe("validateAndCoerce", () => {
  describe("string (incl. dates)", () => {
    describe("regular strings", () => {
      it("passes on a string", () => {
        const errors = voc("foo", { type: "string" });
        expect(errors).toHaveLength(0);
      });

      it("fails on a non-string", () => {
        const errors = voc(123, { type: "string" });
        expect(errors).toHaveLength(1);
      });
    });

    describe("dates", () => {
      const schema = {
        type: "object" as const,
        properties: {
          date: { type: "string" as const, format: "date-time" },
        },
      };

      it("accepts a date", () => {
        const data = { date: new Date() };
        const errors = voc(data, schema);
        expect(errors).toHaveLength(0);
      });

      describe("numbers", () => {
        it("coerces a date in ms (temporarily)", () => {
          const data = { date: Date.now() };
          const errors = voc(data, schema);
          expect(errors).toHaveLength(0);
          expect(data.date).toBeInstanceOf(Date);
        });

        it("coerces a date in seconds", () => {
          const data = { date: Date.now() / 1000 };
          const errors = voc(data, schema);
          expect(errors).toHaveLength(0);
          expect(data.date).toBeInstanceOf(Date);
        });
      });

      describe("objects", () => {
        it("accepts yahoo raw type", () => {
          const data = { date: { raw: Date.now() / 1000 } };
          const errors = voc(data, schema);
          expect(errors).toHaveLength(0);
          expect(data.date).toBeInstanceOf(Date);
        });

        it("does not allow yahoo null type by default", () => {
          const data = { date: {} };
          const errors = voc(data, schema);
          expect(errors).toHaveLength(1);
          expect(errors[0].message).toBe(
            "Got {}->null for 'date', did you want 'date | null' ?",
          );
        });

        it("does allow yahoo null as part of a union", () => {
          const data = { date: {} };
          const errors = voc(data, {
            type: "object",
            properties: {
              date: {
                anyOf: [
                  { type: "string", format: "date-time" },
                  { type: "null" },
                ],
              },
            },
          });
          expect(errors).toHaveLength(0);
          expect(data.date).toBeNull();
        });
      });

      describe("strings", () => {
        it("coerces a date-only string to UTC midnight", () => {
          const data = { date: "2020-01-01" };
          const errors = voc(data, schema);
          expect(errors).toHaveLength(0);
          expect(data.date).toBeInstanceOf(Date);
          expect(data.date).toEqual(new Date("2020-01-01T00:00:00.000Z"));
        });

        it("fails on invalid string string", () => {
          const data = { date: "invalid" };
          const errors = voc(data, schema);
          expect(errors).toHaveLength(1);
          expect(errors[0].message).toBe("Expecting date'ish");
        });
      });

      describe("discriminator", () => {
        const schema: JSONSchema = {
          type: "object" as const,
          // @ts-ignore: unofficial extension
          discriminator: { propertyName: "quoteType" },
          required: ["quoteType"],
          additionalProperties: true,
          oneOf: [
            {
              type: "object" as const,
              properties: {
                quoteType: { type: "string" as const, const: "EQUITY" },
                EquityOnlyProp: { type: "string" as const, const: "test" },
              },
              required: ["quoteType", "EquityOnlyProp"],
            },
            {
              type: "object" as const,
              properties: {
                quoteType: { type: "string" as const, const: "ETF" },
                EtfOnlyProp: { type: "string" as const, const: "test" },
              },
              required: ["quoteType", "EtfOnlyProp"],
            },
          ],
        };

        it("passes on correct discriminator", () => {
          const data = { quoteType: "EQUITY", EquityOnlyProp: "test" };
          const errors = voc(data, schema);
          expect(errors).toHaveLength(0);
        });

        it("only logs errors for correct discriminator", () => {
          const data = { quoteType: "ETF" }; // missing required EtfOnlyProp
          const errors = voc(data, schema);
          expect(errors).toHaveLength(1);
          expect(errors[0].subErrors).toHaveLength(1);
          expect(errors[0].subErrors![0]).toMatchObject({
            message: "Missing required property",
            data: "EtfOnlyProp",
          });
        });
      });
    });
  });
});
