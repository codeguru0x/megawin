/**
 * Lambda handler: POST /player/lotto535/bets
 * Player đặt cược Lotto 5/35 — authed qua Cognito JWT Bearer token.
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
import type { PlaceBetBoardInput } from "@megawin/game-lotto535-application/use-cases/place-bet";
import { PlayType } from "@megawin/game-lotto535/entities";
import { TicketChannel } from "@megawin/game-core/entities";

// ============ Zod schemas ============

const boardSchema = z.object({
  boardNo: z.string().min(1),
  playType: z.enum(PlayType),
  selection: z.object({
    mainNumbers: z.array(z.number().int()).min(0),
    specialNumbers: z.array(z.number().int()).min(0),
  }),
});

const bodySchema = z.object({
  startDrawId: z.string().regex(/^\d{4}-\d{2}-\d{2}-\d{3}$/, "Format: YYYY-MM-DD-NNN"),
  drawCount: z.number().int().min(1).max(6),
  boards: z.array(boardSchema).min(1).max(5),
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
