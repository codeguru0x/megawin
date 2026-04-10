/**
 * Lambda handler: POST /games/max3dpro/bets
 * Player đặt cược Max 3D Pro — authed qua Cognito JWT Bearer token.
 *
 * Max 3D Pro có 2 play mode:
 * - multiNumber: chọn 3-20 bộ ba số, hệ thống tạo P(n,2) ordered pairs.
 * - multiDigit: chọn 3 chữ số đầu + 3 chữ số sau, hệ thống expand hoán vị.
 *
 * Play type: straight (duy nhất).
 *
 * Zod validate đầy đủ tại đây → Use Case không cần validate lại các rule đã qua.
 */

import { withPlayerAuth } from "@megawin/auth";

import {
  PlaceBetUseCase,
  type PlaceBetBoardInput,
} from "@megawin/game-max3dpro-application/use-cases/place-bet";

import { TicketChannel } from "@megawin/game-core/entities";
import z from "zod";
import {
  max3dproTripletSchema,
  max3dproDrawIdSchema,
  max3dproDigitSchema,
  VALID_BOARD_NOS,
} from "@megawin/game-max3dpro/schemas";
import {
  PlayMode,
  PlayType,
  MAX3D_PRO_MULTI_NUMBER_MIN,
  MAX3D_PRO_MULTI_NUMBER_MAX,
} from "@megawin/game-max3dpro/entities";
import { isUnique } from "@megawin/shared/utils";
import { boardsOrderRefine } from "../../lib/schemas";

// ─── Board schemas (discriminated by playMode) ───

/**
 * multiNumber: chọn 3-20 bộ ba số, hệ thống tạo P(n,2) ordered pairs.
 */
const max3dproMultiNumberBoardSchema = z.object({
  boardNo: z.enum(VALID_BOARD_NOS),
  playMode: z.literal(PlayMode.MultiNumber),
  playType: z.literal(PlayType.Straight),
  triplets: z
    .array(max3dproTripletSchema)
    .min(MAX3D_PRO_MULTI_NUMBER_MIN)
    .max(MAX3D_PRO_MULTI_NUMBER_MAX),
  /** Số lần cược nhân bội (≥ 1). Mặc định 1 cho backward compat. */
  betCount: z.number().int().min(1).default(1),
});

/**
 * multiDigit: chọn đúng 3 chữ số đầu + 3 chữ số sau, hệ thống expand hoán vị.
 */
const max3dproMultiDigitBoardSchema = z.object({
  boardNo: z.enum(VALID_BOARD_NOS),
  playMode: z.literal(PlayMode.MultiDigit),
  playType: z.literal(PlayType.Straight),
  frontDigits: z.array(max3dproDigitSchema).length(3),
  backDigits: z.array(max3dproDigitSchema).length(3),
  /** Số lần cược nhân bội (≥ 1). Mặc định 1 cho backward compat. */
  betCount: z.number().int().min(1).default(1),
});

export const max3dproBoardSchema = z.discriminatedUnion("playMode", [
  max3dproMultiNumberBoardSchema,
  max3dproMultiDigitBoardSchema,
]);

// ─── Place bet body schema ───

export const max3dproPlaceBetBodySchema = z.object({
  drawIds: z
    .array(max3dproDrawIdSchema)
    .min(1)
    .max(6)
    .refine(isUnique, { message: "Các kỳ quay không được trùng lặp." }),
  boards: z
    .array(max3dproBoardSchema)
    .min(1)
    .max(VALID_BOARD_NOS.length)
    .refine(boardsOrderRefine(VALID_BOARD_NOS), {
      message: "Boards phải theo thứ tự liên tục từ A (A → A,B → A,B,C...).",
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

    const boards: PlaceBetBoardInput[] = rawBoards.map((b: Max3dproBoard) => ({
      boardNo: b.boardNo,
      playMode: b.playMode,
      playType: b.playType,
      selection:
        b.playMode === PlayMode.MultiNumber
          ? { triplets: b.triplets }
          : { triplets: [], frontDigits: b.frontDigits, backDigits: b.backDigits },
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
  { schemas: { body: max3dproPlaceBetBodySchema } },
);
