/**
 * Lambda handler: GET /tenant/bets/feed
 *
 * Tenant poll bets feed để nhận thay đổi trạng thái đơn cược của khách.
 * Mỗi item trả về chứa đầy đủ: thông tin cược, kết quả quay, chi tiết trả thưởng.
 * Auth: API Key (server-to-server).
 */

import { withTenantAuth } from "@megawin/auth/tenant";
import { GameProduct } from "@megawin/game-core/entities";
import { GetEntryFeedUseCase } from "@megawin/game-core-application/use-cases";
import { z } from "zod";

// ============ Zod schema ============

const querySchema = z.object({
  afterVersion: z.string().min(1, "afterVersion is required"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  gameProduct: z.enum(GameProduct).optional(),
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
      limit,
      gameProduct,
    });
  },
  { schemas: { query: querySchema } },
);
