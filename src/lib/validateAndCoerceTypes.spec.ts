import { jest } from "@jest/globals";

import validateAndCoerceTypes from "./validateAndCoerceTypes.js";
import type { ValidateParams } from "./validateAndCoerceTypes.js";
import { FailedYahooValidationError, InvalidOptionsError } from "./errors.js";
import validate from "./validate";

const schema = {
  $id: "testSchema",
  $schema: "http://json-schema.org/draft-07/schema#",
  properties: {
    date: { yahooFinanceType: "date" },
    dateNull: { yahooFinanceType: "date|null" },
    dateInMs: { yahooFinanceType: "DateInMs" },
    twoNumberRange: { yahooFinanceType: "TwoNumberRange" },
    number: { yahooFinanceType: "number" },
    numberNull: { yahooFinanceType: "number|null" },
    requiredRequired: {
      type: "object",
      properties: { required: { type: "boolean" } },
      required: ["required"],
    },
    noAdditional: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  type: "object",
};

// Default.  Use to show (unexpected) errors during tests.
const defLogParams: ValidateParams = {
  source: "validateAndCoerceTypes.spec.js",
  // schemaKey: "testSchema",
  // @ts-expect-error: ok
  schemaKey: schema,
  //schemaKey: "#/definitions/QuoteSummaryResult",
  type: "result",
  object: {},
  options: {
    logErrors: true,
    logOptionsErrors: true,
  },
};

// If we're purposefully testing failed validation, don't log it.
// i.e. Use to hide (expected) errors during tests.
const defNoLogParams = {
  ...defLogParams,
  options: {
    ...defLogParams.options,
    logErrors: false,
  },
};

describe("validateAndCoerceTypes", () => {
  describe("coersion", () => {
    describe("numbers", () => {
      it("passes regular numbers", () => {
        const object = { number: 2 };
        validateAndCoerceTypes({ ...defLogParams, object });
        expect(object.number).toBe(2);
      });

      it("corerces rawNumberObjs", () => {
        const object = { number: { raw: 0.006599537, fmt: "6.5%" } };
        validateAndCoerceTypes({ ...defLogParams, object });
        expect(object.number).toBe(0.006599537);
      });

      it("passes if data is null and type IS number|null", () => {
        const object = { numberNull: null };
        expect(() => validateAndCoerceTypes({ ...defLogParams, object })).not
          .toThrow();
      });

      it("fails if data is null and type IS NOT number|null", () => {
        const object = { number: null };
        let error: FailedYahooValidationError | any;
        try {
          validateAndCoerceTypes({ ...defNoLogParams, object });
        } catch (e) {
          error = e;
        }
        // @ts-ignore
        expect(error).toBeDefined();
        expect(error.errors[0].message).toMatch(/Expecting number/);
      });

      it("passes and coerces {} to null if type IS number|null", () => {
        const object = { numberNull: {} };
        expect(() => validateAndCoerceTypes({ ...defLogParams, object })).not
          .toThrow();
        expect(object.numberNull).toBe(null);
      });

      it("fails when receiving {} if type IS NOT number|null", () => {
        const object = { number: {} };
        let error: FailedYahooValidationError | any;
        try {
          validateAndCoerceTypes({ ...defNoLogParams, object });
        } catch (e) {
          error = e;
        }
        expect(error).toBeDefined();
        expect(error.errors[0].message).toMatch(/number \| null/);
      });

      it("fails if data is not a number nor object", () => {
        const object = { number: true };
        expect(() => validateAndCoerceTypes({ ...defNoLogParams, object }))
          .toThrow(/Failed Yahoo Schema/);
      });

      it("fails if data.raw is not a number", () => {
        const object = { number: { raw: "a string" } };
        expect(() => validateAndCoerceTypes({ ...defNoLogParams, object }))
          .toThrow(/Failed Yahoo Schema/);
      });

      it("fails if string returns a NaN", () => {
        const object = { number: "not-a-number" };
        expect(() => validateAndCoerceTypes({ ...defNoLogParams, object }))
          .toThrow(/Failed Yahoo Schema/);
      });
    });

    describe("dates", () => {
      it("coerces rawNumberObjs", () => {
        const dateInMs = 1612313997;
        const object = { date: { raw: dateInMs } };
        validateAndCoerceTypes({ ...defLogParams, object });
        expect(object.date).toBeInstanceOf(Date);
        // @ts-ignore
        expect(object.date.getTime()).toBe(dateInMs * 1000);
      });

      it("coerces epochs", () => {
        const dateInMs = 1612313997;
        const object = { date: dateInMs };
        validateAndCoerceTypes({ ...defLogParams, object });
        // @ts-ignore
        expect(object.date.getTime()).toBe(new Date(dateInMs * 1000).getTime());
      });

      it("coerces recognizable date string", () => {
        const dateStr = "2021-02-02T21:00:01.000Z";
        const object = { date: dateStr };
        validateAndCoerceTypes({ ...defLogParams, object });
        // @ts-ignore
        expect(object.date.getTime()).toBe(new Date(dateStr).getTime());
      });

      it("throws on non-matching strings", () => {
        const object = { date: "clearly not a date" };
        expect(() => validateAndCoerceTypes({ ...defNoLogParams, object }))
          .toThrow(/Failed Yahoo Schema/);
      });

      it("passes through Date objects", () => {
        const date = new Date();
        const object = { date };
        validateAndCoerceTypes({ ...defLogParams, object });
        expect(object.date).toBe(date);
      });

      it("passes if data is null and type IS date|null", () => {
        const object = { dateNull: null };
        expect(() => validateAndCoerceTypes({ ...defLogParams, object })).not
          .toThrow();
      });

      it("fails if data is null and type IS NOT date|null", () => {
        const object = { date: null };
        let error: FailedYahooValidationError | any;
        try {
          validateAndCoerceTypes({ ...defNoLogParams, object });
        } catch (e) {
          error = e;
        }
        // @ts-ignore
        expect(error).toBeDefined();
        expect(error.errors[0].message).toMatch(/Expecting date/);
      });

      it("passes and coerces {} to null if type IS Date|null", () => {
        const object = { dateNull: {} };
        expect(() => validateAndCoerceTypes({ ...defLogParams, object })).not
          .toThrow();
        expect(object.dateNull).toBe(null);
      });

      it("fails when receiving {} if type IS NOT date|null", () => {
        const object = { date: {} };
        let error: FailedYahooValidationError | any;
        try {
          validateAndCoerceTypes({ ...defNoLogParams, object });
        } catch (e) {
          error = e;
        }
        expect(error).toBeDefined();
        expect(error.errors[0].message).toMatch(/date \| null/);
      });
    });

    describe("DateInMs", () => {
      it("works with date in milliseconds", () => {
        const object = { dateInMs: 917015400000 };
        validateAndCoerceTypes({ ...defLogParams, object });
        expect(object.dateInMs).toBeInstanceOf(Date);
      });
    });

    describe("TwoNumberRange", () => {
      it("works with valid input", () => {
        const object = { twoNumberRange: "541.867 - 549.19" };
        validateAndCoerceTypes({ ...defLogParams, object });
        expect(object.twoNumberRange).toMatchObject({
          low: 541.867,
          high: 549.19,
        });
      });

      it("throws on invalid input", () => {
        const object = { twoNumberRange: "X - 549.19" };
        expect(() => validateAndCoerceTypes({ ...defNoLogParams, object }))
          .toThrow(/^Failed Yahoo/);
      });

      it("throws no matching type on weird input", () => {
        const object = { twoNumberRange: 12 };
        expect(() => validateAndCoerceTypes({ ...defNoLogParams, object }))
          .toThrow(/^Failed Yahoo/);
      });
    });

    describe("failures", () => {
      it("fails on invalid options usage", () => {
        const options = { period1: true };
        expect(() =>
          validateAndCoerceTypes({
            ...defNoLogParams,
            object: options,
            type: "options",
            schemaKey: "#/definitions/HistoricalOptions",
            source: "historical-in-validate.spec",
            options: { ...defNoLogParams.options, logOptionsErrors: false },
          })
        ).toThrow(InvalidOptionsError);
      });

      it("fails on error", () => {
        const object = { date: { weird: 123 } };
        let error: FailedYahooValidationError | any;
        try {
          validateAndCoerceTypes({ ...defNoLogParams, object });
        } catch (e) {
          error = e;
        }

        /* @ts-ignore */
        expect(error).toBeDefined();

        /* @ts-ignore */
        if (!error) return;
        expect(error.message).toMatch(/Failed Yahoo Schema/);

        /* @ts-ignore */
        const error0 = error.errors[0];
        expect(error0).toBeDefined();
        expect(error0.keyword).toBe("yahooFinanceType");
        // expect(error0.message).toBe("No matching type");
        expect(error0.message).toBe("Expecting date'ish");
        expect(error0.params).toBeDefined();

        if (!error0.params) return;
        expect(error0.params.schema).toBe("date");
        expect(error0.params.data).toBe(object.date);
        expect(error0.instancePath).toBe("/date");

        // TODO
        //expect(error0.schemaPath).toBe("#/properties/date/yahooFinanceType");
      });

      it("fails on invalid schema key", () => {
        expect(() =>
          validateAndCoerceTypes({
            ...defNoLogParams,
            schemaKey: "SOME_MISSING_KEY",
          })
        ).toThrow(/No such schema/);
      });

      // i.e. on output not from bin/modify-schema
      it('fails when yahooFinanceType is not "date"|"number"', () => {
        const schema = { yahooFinanceType: "impossible" };
        // const validate = ajv.compile(schema);
        // expect(() => validate({})).toThrow(/No such yahooFinanceType/);
        const errors = validate({}, schema);
        expect(errors[0].message).toMatch(/yahooFinanceType: no matching type/);
      });

      it("logs errors when logErrors=true", () => {
        const origConsole = console;
        const fakeConsole = {
          error: jest.fn(),
          log: jest.fn(),
          dir: jest.fn(),
        };

        /* @ts-ignore */
        console = fakeConsole;
        const object = { requiredRequired: {} };
        expect(() =>
          validateAndCoerceTypes({
            ...defLogParams,
            object,
          })
        ).toThrow("Failed Yahoo Schema validation");
        console = origConsole;

        expect(fakeConsole.log).toHaveBeenCalled();
      });

      it("does not log errors when logErrors=false", () => {
        const origConsole = console;
        const fakeConsole = {
          error: jest.fn(),
          log: jest.fn(),
          dir: jest.fn(),
        };

        /* @ts-ignore */
        console = fakeConsole;
        const object = { requiredRequired: {} };
        expect(() =>
          validateAndCoerceTypes({
            ...defNoLogParams,
            object,
          })
        ).toThrow("Failed Yahoo Schema validation");
        console = origConsole;

        expect(fakeConsole.log).not.toHaveBeenCalled();
        expect(fakeConsole.error).not.toHaveBeenCalled();
        expect(fakeConsole.dir).not.toHaveBeenCalled();
      });

      it("returns results/errors in error object", () => {
        const object = { noAdditional: { additional: true } };

        let error: FailedYahooValidationError | any;
        try {
          validateAndCoerceTypes({
            ...defNoLogParams,
            object,
          });
        } catch (e) {
          error = e;
        }

        expect(error).toBeDefined();
        expect(error.message).toMatch(/Failed Yahoo/);
        expect(error.result).toBe(object);
        expect(error.errors).toBeType("array");
      });

      it("returns ref to problem data in error object", () => {
        const object = { noAdditional: { additional: true }, number: "str" };

        let error: FailedYahooValidationError | any;
        try {
          validateAndCoerceTypes({
            ...defNoLogParams,
            object,
          });
        } catch (e) {
          error = e;
        }

        expect(error).toBeDefined();
        expect(error.message).toMatch(/Failed Yahoo/);

        let e;

        e = error.errors[1]; //?
        expect(e.params).toMatchObject({
          data: "str",
          schema: "number",
        });
        expect(e.instancePath).toBe("/number");
        expect(e.data).toBe("str");

        e = error.errors[0]; //?
        expect(e.instancePath).toBe("/noAdditional");
        expect(e.params).toMatchObject({
          additionalProperty: "additional",
        });
        expect(e.data).toBe(object.noAdditional);
      });
    });
  });
});
