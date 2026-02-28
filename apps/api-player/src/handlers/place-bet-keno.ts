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
import {
  KenoBigSmallBet,
  KenoEvenOddBet,
  KenoPlayType,
} from "@megawin/game-keno/entities";
import z from "zod";

// ============ Handler ============

// ─── Composite schemas ───

const SideBetPlayType = {
  BigSmall: KenoPlayType.BigSmall,
  EvenOdd: KenoPlayType.EvenOdd,
} as const;

const AllSideBetValues = { ...KenoBigSmallBet, ...KenoEvenOddBet } as const;

export const kenoBoardSchema = z.object({
  boardNo: z.string().min(1),
  numbers: z.array(kenoNumberSchema).min(1).max(10),
});

export const kenoSideBetSchema = z.object({
  playType: z.enum(SideBetPlayType),
  bet: z.enum(AllSideBetValues),
});

// ─── Place bet body schema ───

export const kenoPlaceBetBodySchema = z.object({
  drawIds: z
    .array(kenoDrawIdSchema)
    .min(1)
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Các drawId không được trùng lặp.",
    }),
  boards: z.array(kenoBoardSchema).default([]),
  sideBets: z.array(kenoSideBetSchema).default([]),
});

const useCase = new PlaceBetUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { tenantId, accountId, username } = event.user;
    const { drawIds, boards, sideBets } = event.schema.body;

    return useCase.run({
      tenantId,
      accountId,
      username,
      channel: TicketChannel.Sdk,
      drawIds,
      boards,
      sideBets,
    });
  },
  { schemas: { body: kenoPlaceBetBodySchema } }
);
