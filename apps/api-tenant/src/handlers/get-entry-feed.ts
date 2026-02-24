/**
 * Lambda handler: GET /tenant/entries/feed
 *
 * Tenant poll entry feed để nhận thay đổi trạng thái đơn cược.
 *
 * Auth: API Key (server-to-server).
 *
 * Query params:
 * - afterVersion: poll từ version này trở đi (exclusive). Lần đầu gửi "0".
 * - limit: số record tối đa (default 100, max 500).
 * - gameProduct: lọc theo game (optional).
 *
 * Response:
 * - items: danh sách entry thay đổi, sorted by version ASC.
 * - lastVersion: version lớn nhất – tenant lưu lại làm cursor.
 * - hasMore: true nếu còn data cần poll tiếp.
 */

import middy from "@middy/core";
import { z } from "zod";

import {
  validatorZodMiddleware,
  httpErrorHandlerUseCaseFormat,
  type TenantContext,
} from "@megawin/app-core/lambda/middleware";

import { tenantAuth } from "@megawin/identity-application/shared";
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

interface ValidatedEvent {
  validated: {
    queryStringParameters: z.infer<typeof querySchema>;
  };
  tenantContext: TenantContext;
}

const useCase = new GetEntryFeedUseCase();

export const handler = middy(async (event: ValidatedEvent) => {
  const { tenantId } = event.tenantContext;
  const query = event.validated.queryStringParameters;

  return useCase.run({
    tenantId,
    afterVersion: query.afterVersion,
    limit: query.limit ? Number(query.limit) : undefined,
    gameProduct: query.gameProduct as GameProduct | undefined,
  });
})
  .use(tenantAuth())
  .use(validatorZodMiddleware({ queryStringParameters: querySchema }))
  .use(httpErrorHandlerUseCaseFormat());
