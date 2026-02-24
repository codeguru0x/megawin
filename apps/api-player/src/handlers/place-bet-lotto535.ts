/**
 * Lambda handler: POST /player/lotto535/bets
 * Player đặt cược Lotto 5/35 — authed qua Cognito JWT Bearer token.
 *
 * Số Lotto 5/35 nhận dạng string "01"-"35" (main), "01"-"12" (special).
 * Parse sang number trước khi truyền vào use case.
 */

import middy from "@middy/core";
import { z } from "zod";

import {
  validatorZodMiddleware,
  authorizationMiddleware,
  httpErrorHandlerUseCaseFormat,
} from "@megawin/app-core/lambda/middleware";

import { AccountType } from "@megawin/identity-domain/accounts/account";

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

interface ValidatedEvent {
  validated: {
    body: z.infer<typeof bodySchema>;
  };
  authContext: {
    sub: string;
    accountType: string;
    tenantId?: string;
    accountId?: string;
    roles: string[];
  };
}

const useCase = new PlaceBetUseCase();

export const handler = middy(async (event: ValidatedEvent) => {
  const { sub, tenantId, accountId } = event.authContext;
  const body = event.validated.body;

  if (!tenantId) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        success: false,
        error: { code: "BAD_REQUEST", message: "tenantId is required." },
      }),
    };
  }

  const boards = body.boards.map((b) => ({
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
    drawId: body.drawId,
    drawCount: body.drawCount,
    boards,
  });
})
  .use(
    authorizationMiddleware({
      accountType: AccountType.Player,
    }),
  )
  .use(
    validatorZodMiddleware({
      body: bodySchema,
    }),
  )
  .use(httpErrorHandlerUseCaseFormat());
