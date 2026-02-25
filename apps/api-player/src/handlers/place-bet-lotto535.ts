/**
 * Lambda handler: POST /player/lotto535/bets
 * Player đặt cược Lotto 5/35 — authed qua Cognito JWT Bearer token.
 *
 * Số Lotto 5/35 nhận dạng string "01"-"35" (main), "01"-"12" (special).
 * Parse sang number trước khi truyền vào use case.
 */

import { z } from "zod";

import { withPlayerAuth } from "@megawin/auth";

import { PlaceBetUseCase } from "@megawin/game-lotto535-application/use-cases/place-bet";
import { PlayType } from "@megawin/game-lotto535/entities";
import { TicketChannel } from "@megawin/game-core/entities";

// ============ Zod schemas ============

const VALID_BOARD_NOS = ["A", "B", "C", "D", "E"] as const;

const mainNumberSchema = z
  .string()
  .regex(/^(0[1-9]|[12][0-9]|3[0-5])$/, "Số chính phải từ '01' đến '35'");

const specialNumberSchema = z
  .string()
  .regex(/^(0[1-9]|1[0-2])$/, "Số đặc biệt phải từ '01' đến '12'");

const selectionSchema = z.object({
  mainNumbers: z.array(mainNumberSchema),
  specialNumbers: z.array(specialNumberSchema),
});

const boardSchema = z.object({
  boardNo: z.enum(VALID_BOARD_NOS),
  playType: z.enum([
    PlayType.Standard,
    PlayType.MainCover,
    PlayType.MainCover4,
    PlayType.SpecialCover,
    PlayType.QuickPick,
  ]),
  selection: selectionSchema,
});

const bodySchema = z.object({
  drawId: z.string().regex(
    /^\d{4}-\d{2}-\d{2}-\d{3}$/,
    "Format: YYYY-MM-DD-NNN",
  ),
  drawCount: z.number().int().min(1).max(6),
  boards: z
    .array(boardSchema)
    .min(1)
    .max(5)
    .refine(
      (boards) =>
        new Set(boards.map((b) => b.boardNo)).size === boards.length,
      { message: "Các board không được trùng boardNo." },
    ),
});

// ============ Handler ============

const useCase = new PlaceBetUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { sub, tenantId, accountId } = event.user;
    const { drawId, drawCount, boards: rawBoards } = event.schema.body;

    if (!tenantId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: { code: "BAD_REQUEST", message: "tenantId is required." },
        }),
      };
    }

    const boards = rawBoards.map((b) => ({
      boardNo: b.boardNo,
      playType: b.playType,
      selection: {
        mainNumbers: b.selection.mainNumbers.map((s) => parseInt(s, 10)),
        specialNumbers: b.selection.specialNumbers.map((s) => parseInt(s, 10)),
      },
    }));

    return useCase.run({
      tenantId,
      playerId: accountId ?? sub,
      channel: TicketChannel.Sdk,
      drawId,
      drawCount,
      boards,
    });
  },
  { schemas: { body: bodySchema } },
);
