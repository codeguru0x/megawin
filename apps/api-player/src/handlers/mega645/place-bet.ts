/**
 * Lambda handler: POST /player/mega645/bets
 *
 * Player đặt cược Mega 6/45 — authed qua Cognito JWT Bearer token.
 *
 * Mega 6/45 chỉ có numbers (không có specialNumbers).
 * Số nhận dạng string "01"-"45".
 * PlayTypes: Standard (6 số), Bao5 (5 số), Bao7-Bao18.
 */

import { withPlayerAuth } from "@megawin/auth";
import { extractClientIpFromApiGatewayV2 } from "@megawin/shared/utils/ip";

import { PlaceBetUseCase } from "@megawin/game-mega645-application/use-cases/place-bet";

import { TicketChannel } from "@megawin/game-core/entities";
import z from "zod";
import { mega645NumberSchema, mega645DrawIdSchema } from "@megawin/game-mega645/schemas";
import { PlayType, VALID_BOARD_NOS } from "@megawin/game-mega645/entities";
import { isUnique } from "@megawin/shared/utils";
import { boardsOrderRefine } from "../../lib/schemas";

// ─── Composite schemas ───

export const mega645SelectionSchema = z.object({
  numbers: z.array(mega645NumberSchema).max(18),
});

export const mega645BoardSchema = z
  .object({
    boardNo: z.enum(VALID_BOARD_NOS),
    playType: z.enum([
      PlayType.Standard,
      PlayType.Bao5,
      PlayType.Bao7,
      PlayType.Bao8,
      PlayType.Bao9,
      PlayType.Bao10,
      PlayType.Bao11,
      PlayType.Bao12,
      PlayType.Bao13,
      PlayType.Bao14,
      PlayType.Bao15,
      PlayType.Bao18,
    ]),
    selection: mega645SelectionSchema,
    betCount: z.number().int().min(1).default(1),
  })
  .superRefine((board, ctx) => {
    const { playType, selection } = board;
    const numLen = selection.numbers.length;

    // Validate uniqueness of main numbers
    if (!isUnique(selection.numbers)) {
      ctx.addIssue({
        code: "custom",
        message: "Số chính không được trùng nhau.",
        path: ["selection", "numbers"],
      });
    }

    switch (playType) {
      case PlayType.Standard:
        if (numLen !== 6)
          ctx.addIssue({
            code: "custom",
            message: "Chơi thường: cần chọn đúng 6 số.",
            path: ["selection", "numbers"],
          });
        break;
      case PlayType.Bao5:
        if (numLen !== 5)
          ctx.addIssue({
            code: "custom",
            message: "Bao 5: cần chọn đúng 5 số.",
            path: ["selection", "numbers"],
          });
        break;
      case PlayType.Bao7:
        if (numLen !== 7)
          ctx.addIssue({
            code: "custom",
            message: "Bao 7: cần chọn đúng 7 số.",
            path: ["selection", "numbers"],
          });
        break;
      case PlayType.Bao8:
        if (numLen !== 8)
          ctx.addIssue({
            code: "custom",
            message: "Bao 8: cần chọn đúng 8 số.",
            path: ["selection", "numbers"],
          });
        break;
      case PlayType.Bao9:
        if (numLen !== 9)
          ctx.addIssue({
            code: "custom",
            message: "Bao 9: cần chọn đúng 9 số.",
            path: ["selection", "numbers"],
          });
        break;
      case PlayType.Bao10:
        if (numLen !== 10)
          ctx.addIssue({
            code: "custom",
            message: "Bao 10: cần chọn đúng 10 số.",
            path: ["selection", "numbers"],
          });
        break;
      case PlayType.Bao11:
        if (numLen !== 11)
          ctx.addIssue({
            code: "custom",
            message: "Bao 11: cần chọn đúng 11 số.",
            path: ["selection", "numbers"],
          });
        break;
      case PlayType.Bao12:
        if (numLen !== 12)
          ctx.addIssue({
            code: "custom",
            message: "Bao 12: cần chọn đúng 12 số.",
            path: ["selection", "numbers"],
          });
        break;
      case PlayType.Bao13:
        if (numLen !== 13)
          ctx.addIssue({
            code: "custom",
            message: "Bao 13: cần chọn đúng 13 số.",
            path: ["selection", "numbers"],
          });
        break;
      case PlayType.Bao14:
        if (numLen !== 14)
          ctx.addIssue({
            code: "custom",
            message: "Bao 14: cần chọn đúng 14 số.",
            path: ["selection", "numbers"],
          });
        break;
      case PlayType.Bao15:
        if (numLen !== 15)
          ctx.addIssue({
            code: "custom",
            message: "Bao 15: cần chọn đúng 15 số.",
            path: ["selection", "numbers"],
          });
        break;
      case PlayType.Bao18:
        if (numLen !== 18)
          ctx.addIssue({
            code: "custom",
            message: "Bao 18: cần chọn đúng 18 số.",
            path: ["selection", "numbers"],
          });
        break;
    }
  });

// ─── Place bet body schema ───

export const mega645PlaceBetBodySchema = z.object({
  drawIds: z
    .array(mega645DrawIdSchema)
    .min(1)
    .max(6)
    .refine((ids) => isUnique(ids), {
      message: "Các kỳ quay không được trùng lặp.",
    }),
  boards: z
    .array(mega645BoardSchema)
    .min(1)
    .max(VALID_BOARD_NOS.length)
    .refine(boardsOrderRefine(VALID_BOARD_NOS), {
      message: "Boards phải theo thứ tự liên tục từ A (A → A,B → A,B,C...).",
    }),
});

export type Mega645Board = z.infer<typeof mega645BoardSchema>;

// ============ Handler ============

const useCase = new PlaceBetUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { tenantId, accountId, username } = event.user;
    const { drawIds, boards: rawBoards } = event.schema.body;
    const ipAddress = extractClientIpFromApiGatewayV2(event);

    const boards = rawBoards.map((b: Mega645Board) => ({
      boardNo: b.boardNo,
      playType: b.playType,
      selection: {
        numbers: b.selection.numbers,
      },
      betCount: b.betCount ?? 1,
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
  { schemas: { body: mega645PlaceBetBodySchema } },
);
