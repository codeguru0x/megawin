/**
 * Lambda handler: POST /player/bingo18/bets
 * Player đặt cược Bingo 18 — authed qua Cognito JWT Bearer token.
 *
 * Bingo 18: quay 3 viên xúc xắc (1-6), mỗi 6 phút.
 * Cách chơi cơ bản: singleNum, doubleMatch, tripleMatch
 * Cách chơi bổ sung: sumTotal, bigSmallDraw
 */

import { withPlayerAuth } from "@megawin/auth";

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

// ─── Board schemas ───

const BINGO18_BOARD_NO = ["A", "B", "C", "D", "E", "F"] as const;

const BasicPlayType = {
  SingleNum: Bingo18PlayType.SingleNum,
  DoubleMatch: Bingo18PlayType.DoubleMatch,
  TripleMatch: Bingo18PlayType.TripleMatch,
} as const;

export const bingo18BoardSchema = z
  .object({
    boardNo: z.enum(BINGO18_BOARD_NO),
    playType: z.enum(BasicPlayType),
    number: bingo18NumberSchema.optional(),
    tripleKind: z.enum(Bingo18TripleKind).optional(),
  })
  .refine(
    (b) => {
      if (
        b.playType === Bingo18PlayType.SingleNum ||
        b.playType === Bingo18PlayType.DoubleMatch
      ) {
        return b.number != null && b.number >= 1 && b.number <= 6;
      }
      return true;
    },
    {
      message: "number (1-6) bắt buộc cho singleNum và doubleMatch.",
      path: ["number"],
    }
  )
  .refine(
    (b) => {
      if (b.playType === Bingo18PlayType.TripleMatch) {
        return b.tripleKind != null;
      }
      return true;
    },
    {
      message:
        'tripleKind ("specific" | "any") bắt buộc cho tripleMatch.',
      path: ["tripleKind"],
    }
  )
  .refine(
    (b) => {
      if (
        b.playType === Bingo18PlayType.TripleMatch &&
        b.tripleKind === Bingo18TripleKind.Specific
      ) {
        return b.number != null && b.number >= 1 && b.number <= 6;
      }
      return true;
    },
    {
      message: "number (1-6) bắt buộc cho tripleMatch specific.",
      path: ["number"],
    }
  );

// ─── Side bet schemas ───

const SideBetPlayType = {
  SumTotal: Bingo18PlayType.SumTotal,
  BigSmallDraw: Bingo18PlayType.BigSmallDraw,
} as const;

export const bingo18SideBetSchema = z
  .object({
    playType: z.enum(SideBetPlayType),
    sum: bingo18SumSchema.optional(),
    bet: z.enum(Bingo18BigSmallBet).optional(),
  })
  .refine(
    (sb) => {
      if (sb.playType === Bingo18PlayType.SumTotal) {
        return sb.sum != null;
      }
      return true;
    },
    {
      message: "sum (3-18) bắt buộc cho sumTotal.",
      path: ["sum"],
    }
  )
  .refine(
    (sb) => {
      if (sb.playType === Bingo18PlayType.BigSmallDraw) {
        return sb.bet != null;
      }
      return true;
    },
    {
      message: 'bet ("big" | "draw" | "small") bắt buộc cho bigSmallDraw.',
      path: ["bet"],
    }
  );

// ─── Place bet body schema ───

export const bingo18PlaceBetBodySchema = z
  .object({
    drawIds: z
      .array(bingo18DrawIdSchema)
      .min(1)
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Các drawId không được trùng lặp.",
      }),
    boards: z
      .array(bingo18BoardSchema)
      .max(BINGO18_BOARD_NO.length)
      .refine(
        (boards) =>
          new Set(boards.map((b) => b.boardNo)).size === boards.length,
        { message: "Các boardNo không được trùng lặp." }
      )
      .default([]),
    sideBets: z.array(bingo18SideBetSchema).default([]),
  })
  .refine((data) => data.boards.length > 0 || data.sideBets.length > 0, {
    message: "Phải có ít nhất 1 board cơ bản hoặc 1 side bet.",
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
  { schemas: { body: bingo18PlaceBetBodySchema } }
);
