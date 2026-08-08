/**
 * Compile-time type test cho `docPath`.
 *
 * Đây KHÔNG phải test runtime (vitest) — file chỉ được kiểm bởi `tsc` (`check-types`).
 * Mỗi `@ts-expect-error` khẳng định "path sai PHẢI đỏ ở compiler". Nếu path sai bỗng
 * hợp lệ (helper hỏng), `@ts-expect-error` sẽ báo lỗi "unused" → check-types fail.
 *
 * Runtime behaviour (identity, cả 2 dạng path/`$path`) test ở `dot-path.test.ts`.
 */

import type { Long } from "mongodb";

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

// ── path hợp lệ (update/filter key — không $) — phải compile ──
p("tenantId");
p("payout");
p("payout.winAmount");
p("payout.settledAt");
p("entrySummary.ticketNo");
p("entrySummary.boards");
p("entrySummary.boards.picks");
p("entrySummary.boards.boardNo");
p("version");

// ── ref hợp lệ (aggregate value ref — có $) — phải compile, trả literal y hệt ──
const ref1: "$payout.payoutAmount" = p("$payout.payoutAmount");
const ref2: "$entrySummary.boards.point" = p("$entrySummary.boards.point");
void ref1;
void ref2;

// ── path SAI — phải báo lỗi compile ──
// @ts-expect-error typo field
p("payout.winAmoun");
// @ts-expect-error field không tồn tại
p("entrySummary.boards.number");
// @ts-expect-error đi sâu vào leaf
p("tenantId.length");
// @ts-expect-error typo field (dạng $ref)
p("$payout.payoutAmoun");
// @ts-expect-error field không tồn tại (dạng $ref)
p("$entrySummary.boards.number");
