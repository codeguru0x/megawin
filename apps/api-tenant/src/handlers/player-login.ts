/**
 * Lambda handler: POST /tenant/players/login
 * Server-to-server: Tenant server gọi để đăng nhập player.
 *
 * Auth: Tenant API Key.
 * tenantId lấy từ API Key auth (không từ body) để đảm bảo tenant
 * chỉ login player cho chính mình.
 */

import { z } from "zod";

import { withTenantAuth } from "@megawin/auth/tenant";

import {
  PlayerLoginUseCase,
} from "@megawin/identity-application/use-cases/players";

// ============ Zod schema ============

const bodySchema = z.object({
  assertionToken: z
    .string()
    .min(1, "assertionToken is required"),
});

// ============ Use case ============

const useCase = new PlayerLoginUseCase();

// ============ Handler ============

export const handler = withTenantAuth(
  async (event) => {
    const { assertionToken } = event.schema.body;
    const { tenantId } = event.tenant;

    return useCase.run({ assertionToken, tenantId });
  },
  { schemas: { body: bodySchema } },
);
