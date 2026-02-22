/**
 * Lambda handler: GET /tenant/players
 * Tenant xem danh sách player của mình.
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

const querySchema = z.object({
  page: z.string().optional(),
  pageSize: z.string().optional(),
  status: z.string().optional(),
});

// ============ Handler ============

interface ValidatedEvent {
  validated: {
    queryStringParameters: z.infer<typeof querySchema>;
  };
  tenantContext: TenantContext;
}

export const handler = middy(async (event: ValidatedEvent) => {
  const { tenantId } = event.tenantContext;
  const query = event.validated.queryStringParameters;

  // TODO: Inject list players use case
  return toApiGatewayResponse({
    success: true,
    data: {
      tenantId,
      players: [],
      filters: query,
    },
  });
})
  .use(tenantAuth())
  .use(validatorZodMiddleware({ queryStringParameters: querySchema }))
  .use(httpErrorHandlerUseCaseFormat());
