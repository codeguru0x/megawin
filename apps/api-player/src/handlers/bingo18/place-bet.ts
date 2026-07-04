/**
 * Lambda handler: POST /player/bingo18/bets
 * Player đặt cược Bingo 18 — authed qua Cognito JWT Bearer token.
 *
 * Bingo 18: quay 3 viên xúc xắc (1-6), mỗi 6 phút.
 *
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ BREAKING CHANGE — Unified boards[], xoá sideBets[]                      ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║                                                                         ║
 * ║ TẤT CẢ loại chơi (cơ bản + bổ sung) giờ nằm trong `boards[]`.         ║
 * ║ Field `sideBets[]` đã bị XOÁ hoàn toàn khỏi request body.             ║
 * ║                                                                         ║
 * ║ Mỗi board là 1 discriminated union theo `playType`:                     ║
 * ║                                                                         ║
 * ║ ┌───────────────┬──────────────────────────────────────────────────────┐ ║
 * ║ │ playType      │ Fields bắt buộc                                     │ ║
 * ║ ├───────────────┼──────────────────────────────────────────────────────┤ ║
 * ║ │ singleNum     │ number: 1-6                                         │ ║
 * ║ │ doubleMatch   │ number: 1-6                                         │ ║
 * ║ │ tripleMatch   │ tripleKind: "specific"|"any", number nếu specific   │ ║
 * ║ │ sumTotal      │ sum: 3-18                                           │ ║
 * ║ │ bigSmallDraw  │ bet: "big"|"draw"|"small"                           │ ║
 * ║ └───────────────┴──────────────────────────────────────────────────────┘ ║
 * ║                                                                         ║
 * ║ boardNo: "A"-"F" — tối đa 6 boards, không trùng boardNo.              ║
 * ║ Bất kỳ panel nào cũng có thể chơi bất kỳ loại nào.                    ║
 * ║                                                                         ║
 * ║ SDK migration: thay sideBets[] bằng boards[] với playType tương ứng,   ║
 * ║ thêm boardNo cho mỗi side bet.                                         ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import { withPlayerAuth } from "@megawin/auth";
import { extractClientIpFromApiGatewayV2 } from "@megawin/shared/utils/ip";

import { PlaceBetUseCase } from "@megawin/game-bingo18-application/use-cases/place-bet";
import {
  bingo18NumberSchema,
  bingo18SumSchema,
  bingo18DrawIdSchema,
} from "@megawin/game-bingo18/schemas";
import { TicketChannel } from "@megawin/game-core/entities";
import {
  Bingo18PlayType,
  Bingo18BigSmallBet,
  Bingo18TripleKind,
} from "@megawin/game-bingo18/entities";
import z from "zod";
import { boardsOrderRefine } from "../../lib/schemas";

// ============ Board Schemas — Tách riêng theo playType ============

/** boardNo hợp lệ: A-F. Tối đa 6 panels. */
const BINGO18_BOARD_NO = ["A", "B", "C", "D", "E", "F"] as const;

/** Schema dùng chung cho tất cả boards: boardNo + betCount. */
const baseBoardFields = {
  boardNo: z.enum(BINGO18_BOARD_NO),
  betCount: z.number().int().positive().default(1),
} as const;

// ─── Cách chơi cơ bản: singleNum ───

/** Chọn 1 số (1-6). Trúng theo số lần xuất hiện (1/2/3). */
const singleNumBoardSchema = z.object({
  ...baseBoardFields,
  playType: z.literal(Bingo18PlayType.SingleNum),
  number: bingo18NumberSchema,
});

// ─── Cách chơi cơ bản: doubleMatch ───

/** Chọn cặp trùng (11,22,...,66). number = số trong cặp (1-6). */
const doubleMatchBoardSchema = z.object({
  ...baseBoardFields,
  playType: z.literal(Bingo18PlayType.DoubleMatch),
  number: bingo18NumberSchema,
});

// ─── Cách chơi cơ bản: tripleMatch ───

/**
 * Chọn bộ 3 trùng. 2 loại:
 * - specific: chọn số cụ thể (111-666), bắt buộc number.
 * - any: bất kỳ bộ ba, number không cần.
 */
const tripleMatchSpecificSchema = z.object({
  ...baseBoardFields,
  playType: z.literal(Bingo18PlayType.TripleMatch),
  tripleKind: z.literal(Bingo18TripleKind.Specific),
  number: bingo18NumberSchema,
});

const tripleMatchAnySchema = z.object({
  ...baseBoardFields,
  playType: z.literal(Bingo18PlayType.TripleMatch),
  tripleKind: z.literal(Bingo18TripleKind.Any),
});

// ─── Cách chơi bổ sung: sumTotal ───

/** Đoán tổng 3 số (3-18). */
const sumTotalBoardSchema = z.object({
  ...baseBoardFields,
  playType: z.literal(Bingo18PlayType.SumTotal),
  sum: bingo18SumSchema,
});

// ─── Cách chơi bổ sung: bigSmallDraw ───

/** Đặt Lớn (12-18) / Hòa (10-11) / Nhỏ (3-9). */
const bigSmallDrawBoardSchema = z.object({
  ...baseBoardFields,
  playType: z.literal(Bingo18PlayType.BigSmallDraw),
  bet: z.enum([Bingo18BigSmallBet.Big, Bingo18BigSmallBet.Draw, Bingo18BigSmallBet.Small]),
});

// ─── Unified board schema ───

/**
 * Unified board schema: discriminated union trên `playType`.
 *
 * tripleMatch có 2 sub-schemas (specific/any) nên không dùng z.discriminatedUnion
 * vì chúng share cùng playType discriminator. Dùng z.union thay thế.
 */
export const bingo18BoardSchema = z.union([
  singleNumBoardSchema,
  doubleMatchBoardSchema,
  tripleMatchSpecificSchema,
  tripleMatchAnySchema,
  sumTotalBoardSchema,
  bigSmallDrawBoardSchema,
]);

// ─── Place bet body schema ───

export const bingo18PlaceBetBodySchema = z.object({
  drawIds: z
    .array(bingo18DrawIdSchema)
    .min(1)
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Các drawId không được trùng lặp.",
    }),
  boards: z
    .array(bingo18BoardSchema)
    .min(1, "Phải có ít nhất 1 board.")
    .max(BINGO18_BOARD_NO.length)
    .refine(boardsOrderRefine(BINGO18_BOARD_NO), {
      message: "Boards phải theo thứ tự liên tục từ A (A → A,B → A,B,C...).",
    }),
});

const useCase = new PlaceBetUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { tenantId, accountId, username } = event.user;
    const { drawIds, boards } = event.schema.body;
    const ipAddress = extractClientIpFromApiGatewayV2(event);

    return useCase.run({
      tenantId,
      accountId,
      username,
      channel: TicketChannel.Sdk,
      ipAddress,
      drawIds,
      boards,
    });
  },
  { schemas: { body: bingo18PlaceBetBodySchema } },
);
