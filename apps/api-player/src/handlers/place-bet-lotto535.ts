/**
 * Lambda handler: POST /player/lotto535/bets
 * Player đặt cược Lotto 5/35 — authed qua Cognito JWT Bearer token.
 *
 * Số Lotto 5/35 nhận dạng string "01"-"35" (main), "01"-"12" (special).
 * Parse sang number trước khi truyền vào use case.
 */

import { withPlayerAuth } from "@megawin/auth";

import { PlaceBetUseCase } from "@megawin/game-lotto535-application/use-cases/place-bet";

import { TicketChannel } from "@megawin/game-core/entities";
import z from "zod";
import {
  lotto535MainNumberSchema,
  lotto535SpecialNumberSchema,
  lotto535DrawIdSchema,
  VALID_BOARD_NOS,
} from "@megawin/game-lotto535/schemas";
import { PlayType } from "@megawin/game-lotto535/entities";

// ─── Composite schemas ───

export const lotto535SelectionSchema = z.object({
  mainNumbers: z.array(lotto535MainNumberSchema),
  specialNumbers: z.array(lotto535SpecialNumberSchema),
});

export const lotto535BoardSchema = z.object({
  boardNo: z.enum(VALID_BOARD_NOS),
  playType: z.enum([
    PlayType.Standard,
    PlayType.MainCover,
    PlayType.MainCover4,
    PlayType.SpecialCover,
    PlayType.QuickPick,
  ]),
  selection: lotto535SelectionSchema,
});

// ─── Place bet body schema ───

export const lotto535PlaceBetBodySchema = z.object({
  drawIds: z
    .array(lotto535DrawIdSchema)
    .min(1)
    .max(6)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Các drawId không được trùng lặp.",
    }),
  boards: z
    .array(lotto535BoardSchema)
    .min(1)
    .max(5)
    .refine(
      (boards) => new Set(boards.map((b) => b.boardNo)).size === boards.length,
      { message: "Các board không được trùng boardNo." }
    ),
});

export type Lotto535Board = z.infer<typeof lotto535BoardSchema>;

// ============ Handler ============

const useCase = new PlaceBetUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { tenantId, accountId, username } = event.user;
    const { drawIds, boards: rawBoards } = event.schema.body;

    const boards = rawBoards.map((b: Lotto535Board) => ({
      boardNo: b.boardNo,
      playType: b.playType,
      selection: {
        mainNumbers: b.selection.mainNumbers.map((s: string) =>
          parseInt(s, 10)
        ),
        specialNumbers: b.selection.specialNumbers.map((s: string) =>
          parseInt(s, 10)
        ),
      },
    }));

    return useCase.run({
      tenantId,
      accountId,
      username,
      channel: TicketChannel.Sdk,
      drawIds,
      boards,
    });
  },
  { schemas: { body: lotto535PlaceBetBodySchema } }
);
