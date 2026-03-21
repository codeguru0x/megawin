/**
 * Lambda handler: GET /tenant/bets/feed
 *
 * Tenant poll bets feed để nhận thay đổi trạng thái đơn cược của khách.
 * Mỗi item trả về chứa đầy đủ: thông tin cược, kết quả quay, chi tiết trả thưởng.
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

// ============ Use case ============

const useCase = new GetEntryFeedUseCase();

// ============ Handler ============

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
