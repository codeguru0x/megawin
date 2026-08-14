/**
 * Lambda handler: GET /tenant/players
 * Tenant xem danh sách player của mình.
 * Auth: API Key (server-to-server).
 */

import { withTenantAuth } from "@megawin/auth/tenant";
import { z } from "zod";

// ============ Zod schema ============

const querySchema = z.object({
  page: z.string().optional(),
  pageSize: z.string().optional(),
  status: z.string().optional(),
});

// ============ Handler ============

export const handler = withTenantAuth(
  async (event) => {
    const { tenantId } = event.tenant;
    const query = event.schema.query;

    // TODO: Inject list players use case
    return {
      tenantId,
      players: [],
      filters: query,
    };
  },
  { schemas: { query: querySchema } },
);
