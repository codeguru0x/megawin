/**
 * Lambda handler: POST /player/power655/bets
 *
 * Player đặt cược Power 6/55 — authed qua Cognito JWT Bearer token.
 *
 * Power 6/55 chỉ có mainNumbers (không có specialNumbers).
 * Số nhận dạng string "01"-"55". Parse sang number trước khi truyền vào use case.
 * PlayTypes: Standard (6 số), Bao5 (5 số → 50 lines), Bao7-Bao18 (C(N,6) lines).
 */

import { withPlayerAuth } from "@megawin/auth";
import { extractClientIpFromApiGatewayV2 } from "@megawin/shared/utils/ip";

import { PlaceBetUseCase } from "@megawin/game-power655-application/use-cases/place-bet";

import { TicketChannel } from "@megawin/game-core/entities";
import z from "zod";
import { power655MainNumberSchema, power655DrawIdSchema } from "@megawin/game-power655/schemas";
import { PlayType } from "@megawin/game-power655/entities";
import { POWER655_MAX_BOARDS } from "@megawin/game-power655/rules";
import { isUnique } from "@megawin/shared/utils";
import { boardsSequentialRefine } from "../../lib/schemas";

// ─── Composite schemas ───

export const power655SelectionSchema = z.object({
  mainNumbers: z.array(power655MainNumberSchema).min(5).max(18),
});

export const power655BoardSchema = z
  .object({
    boardNo: z.string(),
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
    selection: power655SelectionSchema,
    betCount: z.number().int().min(1).default(1),
  })
  .superRefine((board, ctx) => {
    const { playType, selection } = board;
    const mainLen = selection.mainNumbers.length;

    if (!isUnique(selection.mainNumbers)) {
      ctx.addIssue({
        code: "custom",
        message: "Số chính không được trùng nhau.",
        path: ["selection", "mainNumbers"],
      });
    }

    switch (playType) {
      case PlayType.Standard:
        if (mainLen !== 6)
          ctx.addIssue({
            code: "custom",
            message: "Chơi thường: cần chọn đúng 6 số.",
            path: ["selection", "mainNumbers"],
          });
        break;
      case PlayType.Bao5:
        if (mainLen !== 5)
          ctx.addIssue({
            code: "custom",
            message: "Bao 5: cần chọn đúng 5 số.",
            path: ["selection", "mainNumbers"],
          });
        break;
      case PlayType.Bao7:
        if (mainLen !== 7)
          ctx.addIssue({
            code: "custom",
            message: "Bao 7: cần chọn đúng 7 số.",
            path: ["selection", "mainNumbers"],
          });
        break;
      case PlayType.Bao8:
        if (mainLen !== 8)
          ctx.addIssue({
            code: "custom",
            message: "Bao 8: cần chọn đúng 8 số.",
            path: ["selection", "mainNumbers"],
          });
        break;
      case PlayType.Bao9:
        if (mainLen !== 9)
          ctx.addIssue({
            code: "custom",
            message: "Bao 9: cần chọn đúng 9 số.",
            path: ["selection", "mainNumbers"],
          });
        break;
      case PlayType.Bao10:
        if (mainLen !== 10)
          ctx.addIssue({
            code: "custom",
            message: "Bao 10: cần chọn đúng 10 số.",
            path: ["selection", "mainNumbers"],
          });
        break;
      case PlayType.Bao11:
        if (mainLen !== 11)
          ctx.addIssue({
            code: "custom",
            message: "Bao 11: cần chọn đúng 11 số.",
            path: ["selection", "mainNumbers"],
          });
        break;
      case PlayType.Bao12:
        if (mainLen !== 12)
          ctx.addIssue({
            code: "custom",
            message: "Bao 12: cần chọn đúng 12 số.",
            path: ["selection", "mainNumbers"],
          });
        break;
      case PlayType.Bao13:
        if (mainLen !== 13)
          ctx.addIssue({
            code: "custom",
            message: "Bao 13: cần chọn đúng 13 số.",
            path: ["selection", "mainNumbers"],
          });
        break;
      case PlayType.Bao14:
        if (mainLen !== 14)
          ctx.addIssue({
            code: "custom",
            message: "Bao 14: cần chọn đúng 14 số.",
            path: ["selection", "mainNumbers"],
          });
        break;
      case PlayType.Bao15:
        if (mainLen !== 15)
          ctx.addIssue({
            code: "custom",
            message: "Bao 15: cần chọn đúng 15 số.",
            path: ["selection", "mainNumbers"],
          });
        break;
      case PlayType.Bao18:
        if (mainLen !== 18)
          ctx.addIssue({
            code: "custom",
            message: "Bao 18: cần chọn đúng 18 số.",
            path: ["selection", "mainNumbers"],
          });
        break;
    }
  });

// ─── Place bet body schema ───

export const power655PlaceBetBodySchema = z.object({
  drawIds: z
    .array(power655DrawIdSchema)
    .min(1)
    .max(6)
    .refine((ids) => isUnique(ids), {
      message: "Các drawId không được trùng lặp.",
    }),
  boards: z.array(power655BoardSchema).min(1).max(POWER655_MAX_BOARDS).refine(boardsSequentialRefine(), {
    message: "Boards phải liên tục và đúng thứ tự bắt đầu từ A (A, B, C … Z, AA, AB, AC …).",
  }),
});

export type Power655Board = z.infer<typeof power655BoardSchema>;

// ============ Handler ============

const useCase = new PlaceBetUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { tenantId, accountId, username } = event.user;
    const { drawIds, boards: rawBoards } = event.schema.body;
    const ipAddress = extractClientIpFromApiGatewayV2(event);

    const boards = rawBoards.map((b: Power655Board) => ({
      boardNo: b.boardNo,
      playType: b.playType,
      selection: {
        mainNumbers: b.selection.mainNumbers,
      },
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
  { schemas: { body: power655PlaceBetBodySchema } },
);
