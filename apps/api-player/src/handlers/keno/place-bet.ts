/**
 * Lambda handler: POST /player/keno/bets
 * Player đặt cược Keno — authed qua Cognito JWT Bearer token.
 *
 * Số Keno nhận dạng string "01"-"80" (zero-padded).
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
 * ║ ┌─────────────┬────────────────────────────────────────────────────────┐ ║
 * ║ │ playType    │ Fields bắt buộc                                       │ ║
 * ║ ├─────────────┼────────────────────────────────────────────────────────┤ ║
 * ║ │ pick1-pick10│ numbers: string[] (1-10 số, unique, "01"-"80")        │ ║
 * ║ │ bigSmall    │ bet: "big" | "small" | "bigSmallDraw"                 │ ║
 * ║ │ evenOdd     │ bet: "even" | "odd" | "evenOddDraw" | "even1112"     │ ║
 * ║ │             │      | "odd1112"                                      │ ║
 * ║ └─────────────┴────────────────────────────────────────────────────────┘ ║
 * ║                                                                         ║
 * ║ boardNo: "A" | "B" | "C" — tối đa 3 boards, không trùng boardNo.      ║
 * ║ Bất kỳ panel nào cũng có thể chơi bất kỳ loại nào.                    ║
 * ║                                                                         ║
 * ║ SDK migration: thay sideBets[] bằng boards[] với playType tương ứng,   ║
 * ║ thêm boardNo cho mỗi side bet.                                         ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import { withPlayerAuth } from "@megawin/auth";
import { extractClientIpFromApiGatewayV2 } from "@megawin/shared/utils/ip";

import { PlaceBetUseCase } from "@megawin/game-keno-application/use-cases/place-bet";
import { kenoNumberSchema, kenoDrawIdSchema } from "@megawin/game-keno/schemas";
import { TicketChannel } from "@megawin/game-core/entities";
import { KenoBigSmallBet, KenoEvenOddBet, KenoPlayType } from "@megawin/game-keno/entities";
import { KENO_MAX_BOARDS } from "@megawin/game-keno/rules";
import z from "zod";
import { boardsSequentialRefine } from "../../lib/schemas";

// ============ Board Schemas — Tách riêng theo playType ============

/** Schema dùng chung cho tất cả boards: boardNo + betCount. */
const baseBoardFields = {
  boardNo: z.string(),
  betCount: z.number().int().min(1).default(1),
} as const;

// ─── Cách chơi cơ bản: pick1-pick10 (chọn số) ───

/**
 * Helper tạo schema cho mỗi bậc pick.
 * Validate: đúng số lượng numbers theo pickCount, unique, format "01"-"80".
 */
function createPickSchema<T extends string>(playType: T, pickCount: number) {
  return z
    .object({
      ...baseBoardFields,
      playType: z.literal(playType),
      numbers: z.array(kenoNumberSchema).length(pickCount, {
        message: `${playType} phải chọn đúng ${pickCount} số.`,
      }),
    })
    .refine((b) => new Set(b.numbers).size === b.numbers.length, {
      message: "Các số trong board không được trùng nhau.",
      path: ["numbers"],
    });
}

const pick1Schema = createPickSchema(KenoPlayType.Pick1, 1);
const pick2Schema = createPickSchema(KenoPlayType.Pick2, 2);
const pick3Schema = createPickSchema(KenoPlayType.Pick3, 3);
const pick4Schema = createPickSchema(KenoPlayType.Pick4, 4);
const pick5Schema = createPickSchema(KenoPlayType.Pick5, 5);
const pick6Schema = createPickSchema(KenoPlayType.Pick6, 6);
const pick7Schema = createPickSchema(KenoPlayType.Pick7, 7);
const pick8Schema = createPickSchema(KenoPlayType.Pick8, 8);
const pick9Schema = createPickSchema(KenoPlayType.Pick9, 9);
const pick10Schema = createPickSchema(KenoPlayType.Pick10, 10);

// ─── Cách chơi bổ sung: bigSmall ───

/** Schema cho cược Lớn/Nhỏ. */
const bigSmallBoardSchema = z.object({
  ...baseBoardFields,
  playType: z.literal(KenoPlayType.BigSmall),
  bet: z.enum([KenoBigSmallBet.Big, KenoBigSmallBet.Small, KenoBigSmallBet.BigSmallDraw]),
});

// ─── Cách chơi bổ sung: evenOdd ───

/** Schema cho cược Chẵn/Lẻ. */
const evenOddBoardSchema = z.object({
  ...baseBoardFields,
  playType: z.literal(KenoPlayType.EvenOdd),
  bet: z.enum([
    KenoEvenOddBet.Even,
    KenoEvenOddBet.Even1112,
    KenoEvenOddBet.EvenOddDraw,
    KenoEvenOddBet.Odd1112,
    KenoEvenOddBet.Odd,
  ]),
});

// ─── Unified board schema qua discriminatedUnion ───

/**
 * Unified board schema: discriminated union trên `playType`.
 * TypeScript compiler đảm bảo type-safe — mỗi playType chỉ cho phép fields hợp lệ.
 */
export const kenoBoardSchema = z.discriminatedUnion("playType", [
  pick1Schema,
  pick2Schema,
  pick3Schema,
  pick4Schema,
  pick5Schema,
  pick6Schema,
  pick7Schema,
  pick8Schema,
  pick9Schema,
  pick10Schema,
  bigSmallBoardSchema,
  evenOddBoardSchema,
]);

// ─── Place bet body schema ───

export const kenoPlaceBetBodySchema = z.object({
  drawIds: z
    .array(kenoDrawIdSchema)
    .min(1)
    .max(30)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Các drawId không được trùng lặp.",
    }),
  boards: z
    .array(kenoBoardSchema)
    .min(1, "Phải có ít nhất 1 board.")
    .max(KENO_MAX_BOARDS)
    .refine(boardsSequentialRefine(), {
      message: "Boards phải liên tục và đúng thứ tự bắt đầu từ A (A, B, C … Z, AA, AB, AC …).",
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
  { schemas: { body: kenoPlaceBetBodySchema } },
);
