import { describe, expect, it } from "vitest";

import { dayDiff, findMatch, toCents } from "./matcher";

const transaction = {
  id: "tx-1",
  amount: -11.63,
  label: "CB OFFICE DEPOT",
  date: new Date("2026-08-13T00:00:00Z"),
};

function invoice(
  overrides: Partial<{
    id: string;
    supplier_name: string;
    invoice_number: string;
    tax_free_total: number;
    vat_amount: number;
    due_date: string | null;
  }> = {},
) {
  return {
    id: "inv-1",
    supplier_name: "Office Depot",
    invoice_number: "F-1",
    tax_free_total: 9.69,
    vat_amount: 1.94,
    due_date: "2026-08-12",
    ...overrides,
  };
}

describe("toCents", () => {
  it("converts two-decimal strings without float drift", () => {
    expect(toCents("9.69") + toCents("1.94")).toBe(1163);
    expect(toCents("-11.63")).toBe(-1163);
  });

  it("accepts numbers the same way", () => {
    expect(toCents(9.69) + toCents(1.94)).toBe(1163);
    expect(Math.abs(toCents(-11.63))).toBe(1163);
  });

  it("pads a single decimal digit", () => {
    expect(toCents("10.5")).toBe(1050);
  });

  it("throws on invalid money", () => {
    expect(() => toCents("abc")).toThrow(/Invalid money value/);
  });
});

describe("dayDiff", () => {
  it("uses calendar days", () => {
    expect(dayDiff("2026-01-31", "2026-01-01")).toBe(30);
  });

  it("is consistent for Date and YYYY-MM-DD strings", () => {
    expect(dayDiff(new Date("2026-08-13T00:00:00Z"), "2026-08-12")).toBe(1);
    expect(dayDiff("2026-08-13", "2026-08-12")).toBe(1);
  });
});

describe("findMatch", () => {
  it("returns null when there are no invoices", () => {
    expect(findMatch(transaction, [])).toBeNull();
  });

  it("matches a single eligible invoice", () => {
    expect(findMatch(transaction, [invoice()])?.id).toBe("inv-1");
  });

  it("leaves unmatched when two invoices are eligible", () => {
    expect(
      findMatch(transaction, [
        invoice({ id: "inv-a", due_date: "2026-08-12" }),
        invoice({ id: "inv-b", supplier_name: "Other", due_date: "2026-08-11" }),
      ]),
    ).toBeNull();
  });

  it("rejects a null due_date", () => {
    expect(findMatch(transaction, [invoice({ due_date: null })])).toBeNull();
  });

  it("rejects a one-cent amount mismatch", () => {
    expect(
      findMatch(transaction, [invoice({ vat_amount: 1.95 })]),
    ).toBeNull();
  });

  it("accepts due dates on the window bounds (-3 and +30 days)", () => {
    expect(
      findMatch(transaction, [invoice({ id: "bound-before", due_date: "2026-08-10" })])
        ?.id,
    ).toBe("bound-before");
    expect(
      findMatch(transaction, [invoice({ id: "bound-after", due_date: "2026-09-12" })])
        ?.id,
    ).toBe("bound-after");
  });

  it("rejects due dates just outside the window (-4 and +31 days)", () => {
    expect(
      findMatch(transaction, [invoice({ due_date: "2026-08-09" })]),
    ).toBeNull();
    expect(
      findMatch(transaction, [invoice({ due_date: "2026-09-13" })]),
    ).toBeNull();
  });

  it("ignores ineligible invoices when exactly one remains eligible", () => {
    expect(
      findMatch(transaction, [
        invoice({ id: "bad-amount", vat_amount: 1.95 }),
        invoice({ id: "bad-date", due_date: "2026-08-09" }),
        invoice({ id: "ok", due_date: "2026-08-12" }),
      ])?.id,
    ).toBe("ok");
  });
});
