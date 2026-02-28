/**
 * Lambda handler: GET /player/balance
 * Lấy số dư của player — authed qua Cognito JWT.
 */

import { withPlayerAuth } from "@megawin/auth";
import { toApiGatewayResponse } from "@megawin/app-core/use-cases";

// ============ Handler ============

export const handler = withPlayerAuth(async (event) => {
  const { accountId, tenantId } = event.user;

  // TODO: Inject balance use case (query tenant hoặc local cache)
  return toApiGatewayResponse({
    success: true,
    data: {
      accountId,
      tenantId,
      balance: 0,
      currency: "VND",
    },
  });
});
