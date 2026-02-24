/**
 * Lambda handler: POST /player/keno/bets
 * Player đặt cược Keno — authed qua Cognito JWT Bearer token.
 *
 * Số Keno nhận dạng string "01"-"80" (zero-padded).
 */

import middy from "@middy/core";
import { z } from "zod";

import {
  validatorZodMiddleware,
  authorizationMiddleware,
  httpErrorHandlerUseCaseFormat,
} from "@megawin/app-core/lambda/middleware";

import { AccountType } from "@megawin/identity-domain/accounts/account";

import { PlaceBetUseCase } from "@megawin/game-keno-application/use-cases/place-bet";
import { KenoPlayType, KenoBigSmallBet, KenoEvenOddBet } from "@megawin/game-keno/entities";
import { TicketChannel } from "@megawin/game-core/entities";

// ============ Zod schemas ============

const kenoNumberSchema = z
  .string()
  .regex(/^(0[1-9]|[1-7][0-9]|80)$/, "Số Keno phải từ '01' đến '80'");

const boardSchema = z.object({
  boardNo: z.string().min(1),
  numbers: z.array(kenoNumberSchema).min(1).max(10),
});

const SideBetPlayType = {
  BigSmall: KenoPlayType.BigSmall,
  EvenOdd: KenoPlayType.EvenOdd,
} as const;

const AllSideBetValues = { ...KenoBigSmallBet, ...KenoEvenOddBet } as const;

const sideBetSchema = z.object({
  playType: z.enum(SideBetPlayType),
  bet: z.enum(AllSideBetValues),
});

const bodySchema = z.object({
  startDrawId: z.string().regex(/^\d{4}-\d{2}-\d{2}-\d{3}$/, "Format: YYYY-MM-DD-NNN"),
  drawCount: z.number().int().min(1).max(20),
  boards: z.array(boardSchema).default([]),
  sideBets: z.array(sideBetSchema).default([]),
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

  return useCase.run({
    tenantId,
    playerId: accountId ?? sub,
    channel: TicketChannel.Sdk,
    startDrawId: body.startDrawId,
    drawCount: body.drawCount,
    boards: body.boards,
    sideBets: body.sideBets,
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
