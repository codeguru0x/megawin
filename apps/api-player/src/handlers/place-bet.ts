/**
 * Lambda handler: POST /player/games/{gameId}/bets
 * Player đặt cược — authed qua Cognito JWT Bearer token.
 *
 * Luồng:
 * 1. API Gateway Cognito Authorizer → verify JWT, inject claims
 * 2. authorizationMiddleware        → check accountType=player, status=active
 * 3. validatorZodMiddleware         → validate body + pathParameters
 * 4. handler                        → extract player info → use case logic
 * 5. httpErrorHandlerUseCaseFormat  → error handling
 */

import middy from "@middy/core";
import { z } from "zod";

import {
  validatorZodMiddleware,
  authorizationMiddleware,
  httpErrorHandlerUseCaseFormat,
} from "@megawin/app-core/lambda/middleware";

import {
  toApiGatewayResponse,
} from "@megawin/app-core/use-cases";

import { AccountType } from "@megawin/identity-domain/accounts/account";

// ============ Zod schemas ============

const pathSchema = z.object({
  gameId: z.string().min(1),
});

const bodySchema = z.object({
  roundId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().length(3),
  selections: z.array(z.unknown()).min(1, "At least one selection required"),
  idempotencyKey: z.string().uuid().optional(),
});

// ============ Handler ============

interface ValidatedEvent {
  validated: {
    body: z.infer<typeof bodySchema>;
    pathParameters: z.infer<typeof pathSchema>;
  };
  authContext: {
    sub: string;
    accountType: string;
    tenantId?: string;
    accountId?: string;
    roles: string[];
  };
}

export const handler = middy(async (event: ValidatedEvent) => {
  const { gameId } = event.validated.pathParameters;
  const bet = event.validated.body;
  const { sub, tenantId, accountId } = event.authContext;

  // TODO: Inject game use case (place bet logic)
  // Placeholder response cho scaffold
  return toApiGatewayResponse({
    success: true,
    data: {
      betId: `bet_${Date.now()}`,
      gameId,
      roundId: bet.roundId,
      playerId: accountId ?? sub,
      tenantId,
      amount: bet.amount,
      currency: bet.currency,
      status: "accepted",
    },
  });
})
  .use(
    authorizationMiddleware({
      accountType: AccountType.Player,
    })
  )
  .use(
    validatorZodMiddleware({
      body: bodySchema,
      pathParameters: pathSchema,
    })
  )
  .use(httpErrorHandlerUseCaseFormat());
