import { describe, it } from "../../tests/migration/runner.ts";
import { expect } from "../../tests/migration/assertions.ts";

import autoc from "./autoc.ts";

describe("autoc", () => {
  it("throws", () => expect(autoc).toThrow(/issues\/337/));
});
