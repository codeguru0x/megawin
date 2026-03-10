/**
 * Lambda handler: POST /player/keno/bets
 * Player đặt cược Keno — authed qua Cognito JWT Bearer token.
 *
 * Số Keno nhận dạng string "01"-"80" (zero-padded).
 */

import { withPlayerAuth } from "@megawin/auth";

import { PlaceBetUseCase } from "@megawin/game-keno-application/use-cases/place-bet";
import { kenoNumberSchema, kenoDrawIdSchema } from "@megawin/game-keno/schemas";
import { TicketChannel } from "@megawin/game-core/entities";
import { KenoBigSmallBet, KenoEvenOddBet, KenoPlayType } from "@megawin/game-keno/entities";
import z from "zod";

// ============ Handler ============

// ─── Composite schemas ───

const SideBetPlayType = {
  BigSmall: KenoPlayType.BigSmall,
  EvenOdd: KenoPlayType.EvenOdd,
} as const;

const AllSideBetValues = { ...KenoBigSmallBet, ...KenoEvenOddBet } as const;

const KENO_BOARD_NO = ["A", "B"] as const;

export const kenoBoardSchema = z
  .object({
    boardNo: z.enum(KENO_BOARD_NO),
    numbers: z.array(kenoNumberSchema).min(1).max(10),
  })
  .refine((b) => new Set(b.numbers).size === b.numbers.length, {
    message: "Các số trong board không được trùng nhau.",
    path: ["numbers"],
  });

export const kenoSideBetSchema = z.object({
  playType: z.enum(SideBetPlayType),
  bet: z.enum(AllSideBetValues),
});

// ─── Place bet body schema ───
export const kenoPlaceBetBodySchema = z
  .object({
    drawIds: z
      .array(kenoDrawIdSchema)
      .min(1)
      .max(30)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Các drawId không được trùng lặp.",
      }),
    boards: z
      .array(kenoBoardSchema)
      .max(KENO_BOARD_NO.length)
      .refine((boards) => new Set(boards.map((b) => b.boardNo)).size === boards.length, {
        message: "Các boardNo không được trùng lặp.",
      })
      .default([]),
    sideBets: z.array(kenoSideBetSchema).default([]),
  })
  .refine((data) => data.boards.length > 0 || data.sideBets.length > 0, {
    message: "Phải có ít nhất 1 board cơ bản hoặc 1 side bet.",
  });

const useCase = new PlaceBetUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { tenantId, accountId, username } = event.user;
    const { drawIds, boards, sideBets } = event.schema.body;
    const ipAddress = event.requestContext.http.sourceIp;

    return useCase.run({
      tenantId,
      accountId,
      username,
      channel: TicketChannel.Sdk,
      ipAddress,
      drawIds,
      boards,
      sideBets,
    });
  },
  { schemas: { body: kenoPlaceBetBodySchema } },
);
