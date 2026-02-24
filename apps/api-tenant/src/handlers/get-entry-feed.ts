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

import {
  toApiGatewayResponse,
} from "@megawin/app-core/use-cases";

import { tenantAuth } from "@megawin/identity-application/shared";

import { GAME_PRODUCT_VALUES } from "@megawin/game-core/entities";
import type { EntryFeedResponse } from "@megawin/game-core/entities";
import { EntryFeedRepository } from "@megawin/game-core-application/repos";
import { toEntryFeedItem } from "@megawin/game-core-application/mappers";

// ============ Zod schema ============

const querySchema = z.object({
  afterVersion: z.string().min(1, "afterVersion is required"),
  limit: z.string().optional(),
  gameProduct: z.enum(GAME_PRODUCT_VALUES as [string, ...string[]]).optional(),
});

// ============ Singleton repo ============

const feedRepo = new EntryFeedRepository();

// ============ Handler ============

interface ValidatedEvent {
  validated: {
    queryStringParameters: z.infer<typeof querySchema>;
  };
  tenantContext: TenantContext;
}

export const handler = middy(async (event: ValidatedEvent) => {
  const { tenantId } = event.tenantContext;
  const query = event.validated.queryStringParameters;

  const limit = Math.min(
    Math.max(Number(query.limit) || 100, 1),
    500,
  );

  const entities = await feedRepo.pollFeed({
    tenantId,
    afterVersion: query.afterVersion,
    limit: limit + 1,
    gameProduct: query.gameProduct as any,
  });

  const hasMore = entities.length > limit;
  const items = entities.slice(0, limit);

  const lastVersion = items.length > 0
    ? items[items.length - 1]!.version
    : query.afterVersion;

  const response: EntryFeedResponse = {
    items: items.map(toEntryFeedItem),
    lastVersion,
    hasMore,
  };

  return toApiGatewayResponse({
    success: true,
    data: response,
  });
})
  .use(tenantAuth())
  .use(validatorZodMiddleware({ queryStringParameters: querySchema }))
  .use(httpErrorHandlerUseCaseFormat());
