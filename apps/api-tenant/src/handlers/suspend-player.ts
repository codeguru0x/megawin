/**
 * Lambda handler: PATCH /tenant/players/{playerId}/status
 * Tenant suspend/activate player.
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

const bodySchema = z.object({
  status: z.enum(["active", "suspended"]),
  reason: z.string().max(500).optional(),
});

// ============ Handler ============

interface ValidatedEvent {
  validated: {
    pathParameters: z.infer<typeof pathSchema>;
    body: z.infer<typeof bodySchema>;
  };
  tenantContext: TenantContext;
}

export const handler = middy(async (event: ValidatedEvent) => {
  const { tenantId } = event.tenantContext;
  const { playerId } = event.validated.pathParameters;
  const { status, reason } = event.validated.body;

  // TODO: Inject update player status use case
  return toApiGatewayResponse({
    success: true,
    data: {
      tenantId,
      playerId,
      status,
      reason,
      updatedAt: new Date().toISOString(),
    },
  });
})
  .use(tenantAuth())
  .use(
    validatorZodMiddleware({
      pathParameters: pathSchema,
      body: bodySchema,
    })
  )
  .use(httpErrorHandlerUseCaseFormat());
