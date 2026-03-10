/**
 * Lambda handler: POST /games/max3dpro/bets
 * Player đặt cược Max 3D Pro — authed qua Cognito JWT Bearer token.
 *
 * Max 3D Pro có 2 play mode:
 * - multiNumber: chọn 3-20 bộ ba số, hệ thống tạo C(n,2) cặp.
 * - multiDigit: chọn 3 chữ số đầu + 3 chữ số sau, hệ thống expand.
 *
 * Play type: straight | quickPick.
 */

import { withPlayerAuth } from "@megawin/auth";

import { PlaceBetUseCase } from "@megawin/game-max3dpro-application/use-cases/place-bet";

import { TicketChannel } from "@megawin/game-core/entities";
import z from "zod";
import {
  max3dproTripletSchema,
  max3dproDrawIdSchema,
  max3dproDigitSchema,
  VALID_BOARD_NOS,
} from "@megawin/game-max3dpro/schemas";
import { PlayMode, PlayType } from "@megawin/game-max3dpro/entities";

// ─── Selection schemas per play mode ───

const multiNumberSelectionSchema = z.object({
  triplets: z.array(max3dproTripletSchema).min(3).max(20),
});

const multiDigitSelectionSchema = z.object({
  frontDigits: z.array(max3dproDigitSchema).length(3),
  backDigits: z.array(max3dproDigitSchema).length(3),
});

// ─── Board schema ───

export const max3dproBoardSchema = z
  .object({
    boardNo: z.enum(VALID_BOARD_NOS),
    playMode: z.enum([PlayMode.MultiNumber, PlayMode.MultiDigit]),
    playType: z.enum([PlayType.Straight, PlayType.QuickPick]),
    triplets: z.array(max3dproTripletSchema).optional(),
    frontDigits: z.array(max3dproDigitSchema).optional(),
    backDigits: z.array(max3dproDigitSchema).optional(),
  })
  .superRefine((board, ctx) => {
    const { playMode, playType } = board;

    if (playType === PlayType.QuickPick) return;

    if (playMode === PlayMode.MultiNumber) {
      const result = multiNumberSelectionSchema.safeParse({
        triplets: board.triplets,
      });
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue(issue.message);
        }
      }
    }

    if (playMode === PlayMode.MultiDigit) {
      const result = multiDigitSelectionSchema.safeParse({
        frontDigits: board.frontDigits,
        backDigits: board.backDigits,
      });
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue(issue.message);
        }
      }
    }
  });

// ─── Place bet body schema ───

export const max3dproPlaceBetBodySchema = z.object({
  drawIds: z
    .array(max3dproDrawIdSchema)
    .min(1)
    .max(6)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Các drawId không được trùng lặp.",
    }),
  boards: z
    .array(max3dproBoardSchema)
    .min(1)
    .max(4)
    .refine((boards) => new Set(boards.map((b) => b.boardNo)).size === boards.length, {
      message: "Các board không được trùng boardNo.",
    }),
});

export type Max3dproBoard = z.infer<typeof max3dproBoardSchema>;

// ============ Handler ============

const useCase = new PlaceBetUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { tenantId, accountId, username } = event.user;
    const { drawIds, boards: rawBoards } = event.schema.body;
    const ipAddress = event.requestContext.http.sourceIp;

    const boards = rawBoards.map((b: Max3dproBoard) => ({
      boardNo: b.boardNo,
      playMode: b.playMode,
      playType: b.playType,
      selection: {
        triplets: b.triplets ?? [],
        frontDigits: b.frontDigits,
        backDigits: b.backDigits,
      },
    }));

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
  { schemas: { body: max3dproPlaceBetBodySchema } },
);
