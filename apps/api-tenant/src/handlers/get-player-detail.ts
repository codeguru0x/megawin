/**
 * Lambda handler: GET /tenant/players/{playerId}
 * Tenant xem chi tiết player.
 * Auth: API Key (server-to-server).
 */

import { toApiGatewayResponse } from "@megawin/app-core/use-cases";
import { withTenantAuth } from "@megawin/auth/tenant";
import { z } from "zod";

// ============ Zod schema ============

const pathSchema = z.object({
  playerId: z.string().min(1),
});

// ============ Handler ============

export const handler = withTenantAuth(
  async (event) => {
    const { tenantId } = event.tenant;
    const { playerId } = event.schema.path;

    // TODO: Inject get player detail use case
    return toApiGatewayResponse({
      success: true,
      data: {
        tenantId,
        playerId,
        player: null,
      },
    });
  },
  { schemas: { path: pathSchema } },
);
