/**
 * Lambda handler: POST /games/max3d/bets
 * Player đặt cược Max 3D — authed qua Cognito JWT Bearer token.
 *
 * Max 3D nhận bộ ba số (triplets) dạng string "000"-"999".
 * Mỗi board có playMode (basic/plus) và playType (straight/combo3/combo6).
 * QuickPick không được chấp nhận từ client — server không hỗ trợ tự sinh số.
 */

import { withPlayerAuth } from "@megawin/auth";

import { PlaceBetUseCase } from "@megawin/game-max3d-application/use-cases/place-bet";

import { TicketChannel } from "@megawin/game-core/entities";
import z from "zod";
import {
  max3dTripletSchema,
  max3dDrawIdSchema,
  VALID_BOARD_NOS,
} from "@megawin/game-max3d/schemas";
import { PlayMode, PlayType } from "@megawin/game-max3d/entities";

// ─── Composite schemas ───

export const max3dBoardSchema = z
  .object({
    boardNo: z.enum(VALID_BOARD_NOS),
    playMode: z.enum([PlayMode.Basic, PlayMode.Plus]),
    playType: z.enum([PlayType.Straight, PlayType.Combo3, PlayType.Combo6]),
    triplets: z.array(max3dTripletSchema).min(1).max(2),
  })
  .superRefine((board, ctx) => {
    const { playMode, playType, triplets } = board;

    if (playMode === PlayMode.Basic) {
      if (triplets.length !== 1) {
        ctx.addIssue({
          code: "custom",
          message: "Max 3D Cơ Bản cần chọn đúng 1 bộ ba số.",
          path: ["triplets"],
        });
      }
    }

    if (playMode === PlayMode.Plus) {
      if (triplets.length !== 2) {
        ctx.addIssue({
          code: "custom",
          message: "Max 3D+ cần chọn đúng 2 bộ ba số.",
          path: ["triplets"],
        });
      }

      if (playType !== PlayType.Straight) {
        ctx.addIssue({
          code: "custom",
          message: "Max 3D+ chỉ hỗ trợ kiểu chơi Straight.",
          path: ["playType"],
        });
      }
    }
  });

// ─── Place bet body schema ───

export const max3dPlaceBetBodySchema = z.object({
  drawIds: z
    .array(max3dDrawIdSchema)
    .min(1)
    .max(6)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Các drawId không được trùng lặp.",
    }),
  boards: z
    .array(max3dBoardSchema)
    .min(1)
    .max(4)
    .refine((boards) => new Set(boards.map((b) => b.boardNo)).size === boards.length, {
      message: "Các board không được trùng boardNo.",
    }),
});

export type Max3dBoard = z.infer<typeof max3dBoardSchema>;

// ============ Handler ============

const useCase = new PlaceBetUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { tenantId, accountId, username } = event.user;
    const { drawIds, boards: rawBoards } = event.schema.body;
    const ipAddress = event.requestContext.http.sourceIp;

    const boards = rawBoards.map((b: Max3dBoard) => ({
      boardNo: b.boardNo,
      playMode: b.playMode,
      playType: b.playType,
      selection: {
        triplets: [...b.triplets],
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
  { schemas: { body: max3dPlaceBetBodySchema } },
);
