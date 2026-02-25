/**
 * Lambda handler: GET /tenant/entries/feed
 *
 * Tenant poll entry feed để nhận thay đổi trạng thái đơn cược.
 * Auth: API Key (server-to-server).
 */

import { z } from "zod";

import { withTenantAuth } from "@megawin/auth/tenant";
import { GAME_PRODUCT_VALUES } from "@megawin/game-core/entities";
import type { GameProduct } from "@megawin/game-core/entities";
import { GetEntryFeedUseCase } from "@megawin/game-core-application/use-cases";

// ============ Zod schema ============

const querySchema = z.object({
  afterVersion: z.string().min(1, "afterVersion is required"),
  limit: z.string().optional(),
  gameProduct: z.enum(GAME_PRODUCT_VALUES as [string, ...string[]]).optional(),
});

// ============ Handler ============

const useCase = new GetEntryFeedUseCase();

export const handler = withTenantAuth(
  async (event) => {
    const { tenantId } = event.tenant;
    const { afterVersion, limit, gameProduct } = event.schema.query;

    return useCase.run({
      tenantId,
      afterVersion,
      limit: limit ? Number(limit) : undefined,
      gameProduct: gameProduct as GameProduct | undefined,
    });
  },
  { schemas: { query: querySchema } },
);
