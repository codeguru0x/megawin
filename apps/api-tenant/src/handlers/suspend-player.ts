/**
 * Lambda handler: PATCH /tenant/players/{playerId}/status
 * Tenant suspend/activate player.
 * Auth: API Key (server-to-server).
 */

import { withTenantAuth } from "@megawin/auth/tenant";
import { z } from "zod";

// ============ Zod schema ============

const pathSchema = z.object({
  playerId: z.string().min(1),
});

const bodySchema = z.object({
  status: z.enum(["active", "suspended"]),
  reason: z.string().max(500).optional(),
});

// ============ Handler ============

export const handler = withTenantAuth(
  async (event) => {
    const { tenantId } = event.tenant;
    const { playerId } = event.schema.path;
    const { status, reason } = event.schema.body;

    // TODO: Inject update player status use case
    return {
      tenantId,
      playerId,
      status,
      reason,
      updatedAt: new Date().toISOString(),
    };
  },
  {
    schemas: {
      path: pathSchema,
      body: bodySchema,
    },
  },
);
