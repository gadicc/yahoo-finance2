import { expect } from "@std/expect";
import {
  assertDateContracts,
  type DateContractException,
} from "./date-contracts.ts";

const file = "src/modules/example.ts";
const result = (type: string, name = "eventDate") =>
  `export interface Result { ${name}?: ${type}; }`;

Deno.test("date contracts accept dates, aliases, arrays and observed absence", () => {
  for (
    const type of [
      "Date",
      "(Date)",
      "Date | null",
      "Date | (null)",
      "Date | undefined",
      "Date[]",
      "Array<Date>",
      "ReadonlyArray<Date>",
      "readonly Date[]",
      "Date[] | null",
      "(Date | null)[]",
    ]
  ) expect(() => assertDateContracts(file, result(type))).not.toThrow();
  expect(() =>
    assertDateContracts(file, `type Event = Date | null; ${result("Event")}`)
  ).not.toThrow();
  expect(() =>
    assertDateContracts(
      file,
      `import type { DateInMs as Ms } from "../lib/commonTypes.ts"; ${
        result("Ms")
      }`,
    )
  ).not.toThrow();
});

Deno.test("date contracts reject raw, broad, mixed and unresolved date types", () => {
  for (
    const type of [
      "string",
      "number",
      "any",
      "unknown",
      "object",
      "null",
      "undefined",
      "Date | string",
      "Date | number",
      "string[]",
      "Array<number>",
      "Missing",
    ]
  ) {
    expect(() => assertDateContracts(file, result(type))).toThrow(
      /Date contract/,
    );
  }
  for (
    const prefix of [
      "type Date = number;",
      "interface Date {}",
      "class Date {}",
      "type Other = string; type Event = Other;",
      "type Event = Event;",
      "type Event<T = Date> = T;",
      'import { Date } from "untrusted";',
      'import { DateInMs as Event } from "untrusted";',
      "type Array<T> = string;",
    ]
  ) {
    const type = prefix.includes("Array")
      ? "Array<Date>"
      : prefix.includes("Event")
      ? "Event"
      : "Date";
    expect(() => assertDateContracts(file, prefix + result(type))).toThrow();
  }
  expect(() =>
    assertDateContracts(file, "interface Result<Date> { eventDate: Date; }")
  ).toThrow();
  expect(() =>
    assertDateContracts(
      file,
      "interface Result<Array> { eventDate: Array<Date>; }",
    )
  ).toThrow();
});

Deno.test("date contracts inspect quoted, nested, and type-alias properties", () => {
  for (
    const source of [
      result("string", '"newListingDate"'),
      "interface Result { eventDate; }",
      "interface Result { nested: { listingDate: number }[]; }",
      "type Result = { nested: Array<{ listingDate: string }>; };",
      "type Data = { listingDate: number }; interface Result { value: Data; }",
    ]
  ) expect(() => assertDateContracts(file, source)).toThrow(/Date contract/);
  // Lowercase labels and user-input unions are outside the suffix rule.
  expect(() =>
    assertDateContracts(
      file,
      "interface Options { date: Date | string | number; }",
    )
  ).not.toThrow();
});

const exception: DateContractException = {
  file,
  member: "Result.eventDate",
  type: "string",
  kind: "semantic",
  reason: "A quarter label in this synthetic test.",
};

Deno.test("date exceptions are exact, frozen, and must not go stale", () => {
  expect(() => assertDateContracts(file, result("string"), [exception])).not
    .toThrow();
  for (const type of ["number", "Date", "string | null"]) {
    expect(() => assertDateContracts(file, result(type), [exception]))
      .toThrow(/exception freezes/);
  }
  expect(() => assertDateContracts(file, "interface Result {}", [exception]))
    .toThrow(/stale date exception/);
  expect(() =>
    assertDateContracts("src/modules/another.ts", result("string"), [exception])
  ).toThrow(/use Date/);
  expect(() =>
    assertDateContracts(file, result("string").replace("Result", "Other"), [
      exception,
    ])
  ).toThrow();
  expect(() =>
    assertDateContracts(file, result("string"), [exception, exception])
  )
    .toThrow(/Duplicate date exception/);
});

Deno.test("temporary exceptions also freeze related timestamp and inverse-count debt", () => {
  for (
    const [member, type, targetType] of [
      ["lastUpdated", "number", "DateInMs"],
      ["sharesShortPriorMonth", "Date", "number"],
    ] as const
  ) {
    const debt: DateContractException = {
      ...exception,
      member: `Result.${member}`,
      kind: "next-major",
      type,
      targetType,
    };
    expect(() => assertDateContracts(file, result(type, member), [debt])).not
      .toThrow();
    expect(() => assertDateContracts(file, result(targetType, member), [debt]))
      .toThrow(/exception freezes/);
    expect(() => assertDateContracts(file, "interface Result {}", [debt]))
      .toThrow(/stale date exception/);
  }
});

Deno.test("candidate comments cannot grant exceptions", () => {
  expect(() =>
    assertDateContracts(
      file,
      `/** @date-exception permanent */ ${result("string")}`,
    )
  ).toThrow(/use Date/);
});
