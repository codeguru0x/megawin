/**
 * Lambda handler: GET /tenant/players/{playerId}
 * Tenant xem chi tiết player.
 * Auth: API Key (server-to-server).
 */

import middy from "@middy/core";
import { z } from "zod";

import {
  validatorZodMiddleware,
  httpErrorHandlerUseCaseFormat,
  type TenantContext,
} from "@megawin/app-core/lambda/middleware";

import {
  toApiGatewayResponse,
} from "@megawin/app-core/use-cases";

import { tenantAuth } from "@megawin/identity-application/shared";

// ============ Zod schema ============

const pathSchema = z.object({
  playerId: z.string().min(1),
});

// ============ Handler ============

interface ValidatedEvent {
  validated: {
    pathParameters: z.infer<typeof pathSchema>;
  };
  tenantContext: TenantContext;
}

export const handler = middy(async (event: ValidatedEvent) => {
  const { tenantId } = event.tenantContext;
  const { playerId } = event.validated.pathParameters;

  // TODO: Inject get player detail use case
  return toApiGatewayResponse({
    success: true,
    data: {
      tenantId,
      playerId,
      player: null,
    },
  });
})
  .use(tenantAuth())
  .use(validatorZodMiddleware({ pathParameters: pathSchema }))
  .use(httpErrorHandlerUseCaseFormat());
