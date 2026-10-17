import { describe, it } from "../../tests/helpers/runner.ts";
import { expect } from "../../tests/helpers/assertions.ts";

import autoc from "./autoc.ts";

describe("autoc", () => {
  it("throws", () => expect(autoc).toThrow(/issues\/337/));
});
