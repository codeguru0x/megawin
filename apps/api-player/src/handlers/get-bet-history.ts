/**
 * Lambda handler: GET /player/bets
 * Lịch sử đặt cược của player — authed qua Cognito JWT.
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

const querySchema = z.object({
  gameId: z.string().optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
});

// ============ Handler ============

interface ValidatedEvent {
  validated: {
    queryStringParameters: z.infer<typeof querySchema>;
  };
  authContext: {
    sub: string;
    tenantId?: string;
    accountId?: string;
    roles: string[];
  };
}

export const handler = middy(async (event: ValidatedEvent) => {
  const { accountId, sub, tenantId } = event.authContext;
  const query = event.validated.queryStringParameters;

  // TODO: Inject bet history use case
  return toApiGatewayResponse({
    success: true,
    data: {
      playerId: accountId ?? sub,
      tenantId,
      bets: [],
      filters: query,
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
      queryStringParameters: querySchema,
    })
  )
  .use(httpErrorHandlerUseCaseFormat());
