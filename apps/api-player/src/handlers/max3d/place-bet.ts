/**
 * Lambda handler: POST /games/max3d/bets
 * Player đặt cược Max 3D — authed qua Cognito JWT Bearer token.
 *
 * Max 3D nhận bộ ba số (triplets) dạng string "000"-"999".
 * Basic mode: straight/combo3/combo6 — client chọn đúng 1 bộ ba số.
 * Plus mode: straight only — client chọn đúng 2 bộ ba số.
 *
 * Zod validate đầy đủ tại đây → Use Case không cần validate lại các rule đã qua.
 */

import { withPlayerAuth } from "@megawin/auth";

import { PlaceBetUseCase } from "@megawin/game-max3d-application/use-cases/place-bet";
import type { PlaceBetBoardInput } from "@megawin/game-max3d-application/use-cases/place-bet";

import { TicketChannel } from "@megawin/game-core/entities";
import z from "zod";
import {
  max3dTripletSchema,
  max3dDrawIdSchema,
  VALID_BOARD_NOS,
} from "@megawin/game-max3d/schemas";
import { PlayMode, PlayType } from "@megawin/game-max3d/entities";
import { isUnique, isUniqueBy } from "@megawin/shared/utils/array";

// ─── Board schemas (discriminated by playMode) ───

/**
 * Basic mode: straight/combo3/combo6 — client chọn đúng 1 bộ ba số.
 */
const max3dBasicBoardSchema = z.object({
  boardNo: z.enum(VALID_BOARD_NOS),
  playMode: z.literal(PlayMode.Basic),
  playType: z.enum([PlayType.Straight, PlayType.Combo3, PlayType.Combo6]),
  triplets: z.array(max3dTripletSchema).length(1),
  betCount: z.number().int().min(1).default(1),
});

/**
 * Plus mode: straight only — client chọn đúng 2 bộ ba số.
 * combo3/combo6 không hỗ trợ cho Plus mode.
 */
const max3dPlusBoardSchema = z.object({
  boardNo: z.enum(VALID_BOARD_NOS),
  playMode: z.literal(PlayMode.Plus),
  playType: z.literal(PlayType.Straight),
  triplets: z.array(max3dTripletSchema).length(2),
  betCount: z.number().int().min(1).default(1),
});

export const max3dBoardSchema = z.discriminatedUnion("playMode", [
  max3dBasicBoardSchema,
  max3dPlusBoardSchema,
]);

// ─── Place bet body schema ───

export const max3dPlaceBetBodySchema = z.object({
  drawIds: z
    .array(max3dDrawIdSchema)
    .min(1)
    .max(6)
    .refine(isUnique, { message: "Các drawId không được trùng lặp." }),
  boards: z
    .array(max3dBoardSchema)
    .min(1)
    .max(4)
    .refine((boards) => isUniqueBy(boards, (b) => b.boardNo), {
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

    const boards: PlaceBetBoardInput[] = rawBoards.map((b: Max3dBoard) => ({
      boardNo: b.boardNo,
      playMode: b.playMode,
      playType: b.playType,
      selection: { triplets: b.triplets },
      betCount: b.betCount,
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
