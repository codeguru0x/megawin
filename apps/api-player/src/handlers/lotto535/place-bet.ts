/**
 * Lambda handler: POST /player/lotto535/bets
 * Player đặt cược Lotto 5/35 — authed qua Cognito JWT Bearer token.
 *
 * Số Lotto 5/35 nhận và lưu dạng string zero-padded: "01"-"35" (main), "01"-"12" (special).
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
import { boardsOrderRefine } from "../../lib/schemas";

// ─── Composite schemas ───

export const lotto535SelectionSchema = z.object({
  mainNumbers: z.array(lotto535MainNumberSchema).max(15, "Số chính tối đa 15 số."),
  specialNumbers: z.array(lotto535SpecialNumberSchema).max(12, "Số đặc biệt tối đa 12 số."),
});

export const lotto535BoardSchema = z
  .object({
    boardNo: z.enum(VALID_BOARD_NOS),
    playType: z.enum([
      PlayType.Standard,
      PlayType.MainCover,
      PlayType.MainCover4,
      PlayType.SpecialCover,
    ]),
    selection: lotto535SelectionSchema,
    betCount: z.number().int().min(1).default(1),
  })
  .superRefine((board, ctx) => {
    const { playType, selection } = board;
    const mainLen = selection.mainNumbers.length;
    const specialLen = selection.specialNumbers.length;

    if (new Set(selection.mainNumbers).size !== mainLen) {
      ctx.addIssue({
        code: "custom",
        message: "Số chính không được trùng nhau.",
        path: ["selection", "mainNumbers"],
      });
    }

    if (new Set(selection.specialNumbers).size !== specialLen) {
      ctx.addIssue({
        code: "custom",
        message: "Số đặc biệt không được trùng nhau.",
        path: ["selection", "specialNumbers"],
      });
    }

    switch (playType) {
      case PlayType.Standard:
        if (mainLen !== 5)
          ctx.addIssue({
            code: "custom",
            message: "Chơi thường: cần chọn đúng 5 số chính.",
            path: ["selection", "mainNumbers"],
          });
        if (specialLen !== 1)
          ctx.addIssue({
            code: "custom",
            message: "Chơi thường: cần chọn đúng 1 số đặc biệt.",
            path: ["selection", "specialNumbers"],
          });
        break;

      case PlayType.MainCover4:
        if (mainLen !== 4)
          ctx.addIssue({
            code: "custom",
            message: "Bao 4 số: cần chọn đúng 4 số chính.",
            path: ["selection", "mainNumbers"],
          });
        if (specialLen !== 1)
          ctx.addIssue({
            code: "custom",
            message: "Bao 4 số: cần chọn đúng 1 số đặc biệt.",
            path: ["selection", "specialNumbers"],
          });
        break;

      case PlayType.MainCover:
        if (mainLen < 6 || mainLen > 15)
          ctx.addIssue({
            code: "custom",
            message: "Bao số chính: cần chọn 6-15 số chính.",
            path: ["selection", "mainNumbers"],
          });
        if (specialLen !== 1)
          ctx.addIssue({
            code: "custom",
            message: "Bao số chính: cần chọn đúng 1 số đặc biệt.",
            path: ["selection", "specialNumbers"],
          });
        break;

      case PlayType.SpecialCover:
        if (mainLen !== 5)
          ctx.addIssue({
            code: "custom",
            message: "Bao số đặc biệt: cần chọn đúng 5 số chính.",
            path: ["selection", "mainNumbers"],
          });
        if (specialLen < 2)
          ctx.addIssue({
            code: "custom",
            message: "Bao số đặc biệt: cần chọn ít nhất 2 số đặc biệt.",
            path: ["selection", "specialNumbers"],
          });
        break;
    }
  });

// ─── Place bet body schema ───

export const lotto535PlaceBetBodySchema = z.object({
  drawIds: z
    .array(lotto535DrawIdSchema)
    .min(1)
    .max(6)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Các kỳ không được trùng lặp.",
    }),
  boards: z
    .array(lotto535BoardSchema)
    .min(1)
    .max(VALID_BOARD_NOS.length)
    .refine(boardsOrderRefine(VALID_BOARD_NOS), {
      message: "Boards phải theo thứ tự liên tục từ A (A → A,B → A,B,C...).",
    }),
});

export type Lotto535Board = z.infer<typeof lotto535BoardSchema>;

// ============ Handler ============

const useCase = new PlaceBetUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { tenantId, accountId, username } = event.user;
    const { drawIds, boards: rawBoards } = event.schema.body;
    const ipAddress = event.requestContext.http.sourceIp;

    // String zero-padded — truyền thẳng, không cần parseInt
    const boards = rawBoards.map((b: Lotto535Board) => ({
      boardNo: b.boardNo,
      playType: b.playType,
      selection: {
        mainNumbers: b.selection.mainNumbers,
        specialNumbers: b.selection.specialNumbers,
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
  { schemas: { body: lotto535PlaceBetBodySchema } },
);
