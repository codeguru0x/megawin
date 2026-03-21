/**
 * Use Case: Get Bets Feed (Tenant API)
 *
 * Tenant poll bets feed để nhận thay đổi trạng thái đơn cược.
 * Extends ApiGatewayUseCase – handler chỉ cần gọi run(input).
 *
 * Business logic:
 * - Query entryFeed collection: version > afterVersion, tenantId = current tenant.
 * - Sort version ASC, limit N (over-fetch 1 để detect hasMore).
 * - Convert entities → JSON-safe items (Long→string, Date→ISO string).
 */

import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import type { GameProduct, BetsFeedResponse } from "@megawin/game-core/entities";
import { EntryFeedRepository } from "../infras/repos/entry-feed-repo";
import { toBetsFeedItem } from "../infras/mappers/entry-feed-mapper";

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;

export interface GetEntryFeedInput {
  tenantId: string;
  afterVersion: string;
  limit?: number;
  gameProduct?: GameProduct;
}

export class GetEntryFeedUseCase extends ApiGatewayUseCase<GetEntryFeedInput, BetsFeedResponse> {
  private readonly feedRepo = new EntryFeedRepository();

  protected async execute(input: GetEntryFeedInput): Promise<BetsFeedResponse> {
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

    const entities = await this.feedRepo.pollFeed({
      tenantId: input.tenantId,
      afterVersion: input.afterVersion,
      limit: limit + 1,
      gameProduct: input.gameProduct,
    });

    const hasMore = entities.length > limit;
    const items = entities.slice(0, limit);

    const lastVersion = items.length > 0 ? items[items.length - 1]!.version : input.afterVersion;

    return {
      items: items.map(toBetsFeedItem),
      lastVersion,
      hasMore,
    };
  }
}
