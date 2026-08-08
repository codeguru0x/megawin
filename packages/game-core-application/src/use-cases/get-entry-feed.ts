/**
 * Use Case: Get Bets Feed (Tenant API)
 *
 * Tenant poll bets feed để nhận thay đổi trạng thái đơn cược.
 * Extends ApiGatewayUseCase – handler chỉ cần gọi run(input).
 *
 * Business logic:
 * - Query entryFeed collection: version > afterVersion, tenantId = current tenant.
 * - Sort version ASC, limit N (over-fetch 1 để detect hasMore).
 * - Loại bỏ `id` và `tenantId` (internal fields, tenant không cần) trước khi trả về.
 */

import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import type { BetsFeedResponse, GameProduct } from "@megawin/game-core/entities";

import { EntryFeedRepository } from "../infras/repos/entry-feed-repo";

export interface GetEntryFeedInput {
  tenantId: string;
  afterVersion: string;
  limit: number;
  gameProduct?: GameProduct;
}

export class GetEntryFeedUseCase extends ApiGatewayUseCase<GetEntryFeedInput, BetsFeedResponse> {
  private readonly feedRepo = new EntryFeedRepository();

  protected async execute(input: GetEntryFeedInput): Promise<BetsFeedResponse> {
    const limit = input.limit;

    const entities = await this.feedRepo.pollFeed({
      tenantId: input.tenantId,
      afterVersion: input.afterVersion,
      // Lấy thêm 1 để detect hasMore
      limit: limit + 1,
      gameProduct: input.gameProduct,
    });

    const hasMore = entities.length > limit;
    const items = entities.slice(0, limit);

    const lastVersion = items.length > 0 ? items[items.length - 1]!.version : input.afterVersion;

    return {
      // Bỏ id (internal ObjectId) và tenantId (tenant đã biết qua auth)
      items: items.map(({ id: _id, tenantId: _tenantId, ...rest }) => rest),
      lastVersion,
      hasMore,
    };
  }
}
