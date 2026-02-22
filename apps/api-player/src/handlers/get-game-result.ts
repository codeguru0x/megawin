/**
 * Lambda handler: GET /player/games/{gameId}/results/{roundId}
 * Xem kết quả game round — authed qua Cognito JWT.
 */

import middy from "@middy/core";
import { z } from "zod";

import {
  authorizationMiddleware,
  validatorZodMiddleware,
  httpErrorHandlerUseCaseFormat,
} from "@megawin/app-core/lambda/middleware";

import {
  toApiGatewayResponse,
} from "@megawin/app-core/use-cases";

import { AccountType } from "@megawin/identity-domain/accounts/account";

// ============ Zod schema ============

const pathSchema = z.object({
  gameId: z.string().min(1),
  roundId: z.string().min(1),
});

// ============ Handler ============

interface ValidatedEvent {
  validated: {
    pathParameters: z.infer<typeof pathSchema>;
  };
  authContext: {
    sub: string;
    tenantId?: string;
    accountId?: string;
  };
}

export const handler = middy(async (event: ValidatedEvent) => {
  const { gameId, roundId } = event.validated.pathParameters;

  // TODO: Inject game result use case
  return toApiGatewayResponse({
    success: true,
    data: {
      gameId,
      roundId,
      result: null,
      status: "pending",
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
      pathParameters: pathSchema,
    })
  )
  .use(httpErrorHandlerUseCaseFormat());
