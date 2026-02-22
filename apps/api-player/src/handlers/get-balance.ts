/**
 * Lambda handler: GET /player/balance
 * Lấy số dư của player — authed qua Cognito JWT.
 */

import middy from "@middy/core";

import {
  authorizationMiddleware,
  httpErrorHandlerUseCaseFormat,
} from "@megawin/app-core/lambda/middleware";

import {
  toApiGatewayResponse,
} from "@megawin/app-core/use-cases";

import { AccountType } from "@megawin/identity-domain/accounts/account";

// ============ Handler ============

interface AuthedEvent {
  authContext: {
    sub: string;
    accountType: string;
    tenantId?: string;
    accountId?: string;
    roles: string[];
  };
}

export const handler = middy(async (event: AuthedEvent) => {
  const { sub, tenantId, accountId } = event.authContext;

  // TODO: Inject balance use case (query tenant hoặc local cache)
  return toApiGatewayResponse({
    success: true,
    data: {
      playerId: accountId ?? sub,
      tenantId,
      balance: 0,
      currency: "VND",
    },
  });
})
  .use(
    authorizationMiddleware({
      accountType: AccountType.Player,
    })
  )
  .use(httpErrorHandlerUseCaseFormat());
