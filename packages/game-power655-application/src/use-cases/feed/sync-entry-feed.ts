/**
 * Use Case: Sync Entry Feed (Power 6/55)
 *
 * Extends BaseSyncEntryFeedUseCase — chỉ cung cấp game-specific logic:
 * - GameProduct: Power655
 * - EntryRepo: Power655 EntryRepository
 * - Mapping: extract amount (tiền cược), winAmount, payoutAmount từ Power655 entry
 */

import { GameProduct } from "@megawin/game-core/entities";
import type { EntryFeedDoc } from "@megawin/game-core/entities";
import {
  BaseSyncEntryFeedUseCase,
  type FeedSyncableEntryRepo,
} from "@megawin/game-core-application/use-cases";
import { Long } from "mongodb";
import { EntryRepository } from "../../infras/repos/entry-repo";

/**
 * Sync Power 6/55 entries vào unified entry feed.
 * Tenant poll collection entryFeed để nhận cập nhật.
 */
export class SyncEntryFeedUseCase extends BaseSyncEntryFeedUseCase {
  protected getGameProduct(): GameProduct {
    return GameProduct.Power655;
  }

  protected createEntryRepo(): FeedSyncableEntryRepo {
    return new EntryRepository();
  }

  protected mapToFeedDoc(
    entry: unknown,
    feedCreatedAt: Date
  ): Omit<EntryFeedDoc, "_id"> {
    const e = entry as Record<string, any>;
    const winAmount = e.payout?.winAmount ?? 0;
    const payoutAmount = e.payout?.payoutAmount ?? 0;
    // Tiền cược: entry dùng field `amount` (đồng bộ với mega645 / lotto535)
    const stakeAmount = e.amount ?? 0;

    return {
      version: e.version ?? Long.fromNumber(0),
      gameProduct: GameProduct.Power655,
      sourceEntryId: e.id,
      ticketId:
        typeof e.ticketId === "string"
          ? e.ticketId
          : e.ticketId?.toHexString?.() ?? String(e.ticketId),
      ticketNo: e.ticketNo ?? "",
      tenantId: e.tenantId,
      playerId: e.accountId,
      drawId: e.drawId,
      drawTime: e.drawTime,
      drawDate: e.drawDate,
      status: e.status,
      stakeAmount,
      winAmount,
      payoutAmount,
      netAmount: stakeAmount - payoutAmount,
      sourceUpdatedAt: e.updatedAt ?? feedCreatedAt,
      feedCreatedAt,
    };
  }
}
