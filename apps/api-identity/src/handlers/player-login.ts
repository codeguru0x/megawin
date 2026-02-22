/**
 * Lambda handler: POST /players/login
 * Server-to-server: Tenant server gọi để đăng nhập player.
 *
 * Luồng:
 * 1. tenantAuth()              → verify X-Tenant-Id + X-Api-Key
 * 2. validatorZodMiddleware    → validate body (assertionToken)
 * 3. handler                  → inject tenantId từ tenantContext → useCase.run()
 * 4. httpErrorHandlerUseCaseFormat → catch error
 *
 * tenantId lấy từ API Key auth (không từ body) để đảm bảo tenant
 * chỉ login player cho chính mình.
 */

import middy from "@middy/core";
import { z } from "zod";

import {
  validatorZodMiddleware,
  httpErrorHandlerUseCaseFormat,
  type TenantContext,
} from "@megawin/app-core/lambda/middleware";

import {
  PlayerLoginUseCase,
} from "@megawin/identity-application/use-cases/players";

import { tenantAuth } from "@megawin/identity-application/shared";

// ============ Zod schema ============

const bodySchema = z.object({
  assertionToken: z
    .string()
    .min(1, "assertionToken is required"),
});

// ============ Use case instance ============

const useCase = new PlayerLoginUseCase();

// ============ Handler ============

interface ValidatedEvent {
  validated: { body: z.infer<typeof bodySchema> };
  tenantContext: TenantContext;
}

export const handler = middy(async (event: ValidatedEvent) => {
  const { assertionToken } = event.validated.body;
  const { tenantId } = event.tenantContext;

  return useCase.run({ assertionToken, tenantId });
})
  .use(tenantAuth())
  .use(validatorZodMiddleware({ body: bodySchema }))
  .use(httpErrorHandlerUseCaseFormat());
