import type { Long } from "mongodb";
import { describe, expect, it } from "vitest";

import { docPath } from "../../src/mongo/dot-path";

interface EntryPayout {
  winAmount: number;
  payoutAmount: number;
  settledAt: Date;
}

interface BoardSnapshot {
  boardNo: string;
  picks: string[];
  point: number;
}

interface Market {
  status: string;
  updatedAt?: Date;
}

interface TestEntryDoc {
  tenantId: string;
  drawId: string;
  payout?: EntryPayout;
  entrySummary: { ticketNo: string; boards: BoardSnapshot[] };
  markets: Record<string, Market>;
  version: Long;
  createdAt: Date;
}

const p = docPath<TestEntryDoc>();

describe("docPath", () => {
  it("returns the path unchanged (identity)", () => {
    expect(p("tenantId")).toBe("tenantId");
    expect(p("payout.payoutAmount")).toBe("payout.payoutAmount");
    expect(p("entrySummary.ticketNo")).toBe("entrySummary.ticketNo");
  });

  it("supports array element paths without index (multikey dot notation)", () => {
    expect(p("entrySummary.boards.picks")).toBe("entrySummary.boards.picks");
    expect(p("entrySummary.boards.boardNo")).toBe("entrySummary.boards.boardNo");
  });

  it("works as a $set key", () => {
    const now = new Date();
    const update = {
      $set: {
        [p("payout.settledAt")]: now,
        [p("payout.payoutAmount")]: 100,
      },
    };
    expect(update.$set).toHaveProperty("payout.settledAt", now);
    expect(update.$set).toHaveProperty("payout.payoutAmount", 100);
  });

  it("accepts $-prefixed refs for aggregate value references (identity)", () => {
    expect(p("$payout.payoutAmount")).toBe("$payout.payoutAmount");
    expect(p("$payout.winAmount")).toBe("$payout.winAmount");
    expect(p("$entrySummary.boards.point")).toBe("$entrySummary.boards.point");
  });

  it("works inside a $group $sum stage with $-prefixed refs", () => {
    const group = {
      _id: null,
      totalPayout: { $sum: p("$payout.payoutAmount") },
      totalWin: { $sum: p("$payout.winAmount") },
    };
    expect(group.totalPayout.$sum).toBe("$payout.payoutAmount");
    expect(group.totalWin.$sum).toBe("$payout.winAmount");
  });
});
