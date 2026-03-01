/**
 * Lambda handler: POST /tenant/players/login
 * Server-to-server: Tenant server gọi để đăng nhập / tạo player.
 *
 * Auth: Tenant API Key + IP whitelist.
 * tenantId lấy từ API Key auth (không từ body) để đảm bảo tenant
 * chỉ login player cho chính mình.
 */

import { z } from "zod";

import { withTenantAuth } from "@megawin/auth/tenant";

import { PlayerLoginUseCase } from "@megawin/identity-application/use-cases/players";

// ============ Zod schema ============

const bodySchema = z.object({
  playerExternalId: z
    .string()
    .min(4, "playerExternalId must be at least 4 characters")
    .max(32, "playerExternalId must be at most 32 characters")
    .regex(/^[a-zA-Z0-9]+$/, "playerExternalId must be alphanumeric only"),
});

// ============ Use case ============

const useCase = new PlayerLoginUseCase();

// ============ Handler ============

export const handler = withTenantAuth(
  async (event) => {
    const { playerExternalId } = event.schema.body;
    const { tenantId } = event.tenant;

    return useCase.run({ playerExternalId, tenantId });
  },
  { schemas: { body: bodySchema } }
);
