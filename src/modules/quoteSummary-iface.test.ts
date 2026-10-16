import { expect } from "../../tests/migration/assertions.ts";
import { test } from "../../tests/migration/runner.ts";
import {
  Action,
  Grade,
  OwnershipEnum,
  Relation,
} from "./quoteSummary-iface.ts";

test("quoteSummary public enums retain Yahoo wire values at runtime", () => {
  const transaction = {
    filerRelation: Relation.ChiefExecutiveOfficer,
    ownership: OwnershipEnum.D,
  };
  const rating = {
    action: Action.Up,
    fromGrade: Grade.Hold,
    toGrade: Grade.Buy,
  };

  expect(JSON.parse(JSON.stringify({ transaction, rating }))).toEqual({
    transaction: {
      filerRelation: "Chief Executive Officer",
      ownership: "D",
    },
    rating: { action: "up", fromGrade: "Hold", toGrade: "Buy" },
  });
  expect(OwnershipEnum.I).toBe("I");
  expect(Relation.Empty).toBe("");
  expect(Grade.Empty).toBe("");
});

test("quoteSummary grades preserve distinct upstream spellings", () => {
  expect(Grade.EqualWeight).toBe("Equal-Weight");
  expect(Grade.GradeEqualWeight).toBe("Equal-weight");
  expect(Grade.LongTermBuy).toBe("Long-Term Buy");
  expect(Grade.GradeLongTermBuy).toBe("Long-term Buy");
  expect(Grade.Overweight).toBe("Overweight");
  expect(Grade.OVerweight).toBe("OVerweight");
  expect(Grade.Buy).toBe("Buy");
  expect(Grade.buy).toBe("buy");
  expect(Grade.BUy).toBe("BUy");
});
