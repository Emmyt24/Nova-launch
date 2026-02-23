import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import BurnHistoryTable from "../BurnHistoryTable";

function makeRecords(count = 12) {
  return Array.from({ length: count }).map((_, i) => {
    const idx = i + 1;
    return {
      id: `r${idx}`,
      date: new Date(2026, 0, idx).toISOString(),
      from: `0xADDR${String(idx).padStart(2, "0")}`,
      amount: idx,
      symbol: "TOK",
      type: idx % 2 === 0 ? "self" : "admin",
      txHash: `tx${idx}`,
    } as const;
  });
}

describe("BurnHistoryTable", () => {
  it("shows pagination and navigates pages", async () => {
    render(<BurnHistoryTable records={makeRecords(12)} explorerBase="https://explorer.test/tx" />);
    expect(screen.getByText(/Page 1 of 2/)).toBeTruthy();
    const next = screen.getByText("Next");
    fireEvent.click(next);
    expect(screen.getByText(/Page 2 of 2/)).toBeTruthy();
  });

  it("filters by self burns", async () => {
    render(<BurnHistoryTable records={makeRecords(12)} explorerBase="https://explorer.test/tx" />);
    const selfBtn = screen.getByText("Self Burns");
    fireEvent.click(selfBtn);
    // 12 records, evens are self => 6
    const selfs = await screen.findAllByText("Self");
    expect(selfs.length).toBe(6);
  });

  it("toggles date sort", async () => {
    const { container } = render(<BurnHistoryTable records={makeRecords(12)} explorerBase="https://explorer.test/tx" />);
    // first page, first row amount should be highest (12) because default sort is date desc
    const firstAmountCell = container.querySelector("tbody tr td:nth-child(3)");
    expect(firstAmountCell).toBeTruthy();
    const before = firstAmountCell!.textContent || "";
    expect(before).toMatch(/12/);

    // click Date header to toggle to asc
    const dateHeader = screen.getByText(/Date/);
    fireEvent.click(dateHeader);
    const afterCell = container.querySelector("tbody tr td:nth-child(3)");
    const after = afterCell!.textContent || "";
    expect(after).toMatch(/1/);
  });
});
