/**
 * Use Case: Sync Entry Feed (Max 3D)
 *
 * Extends BaseSyncEntryFeedUseCase — chỉ cung cấp game-specific logic:
 * - GameProduct: Max3d
 * - EntryRepo: Max3D EntryRepository
 * - Mapping: extract stakeAmount, winAmount, payoutAmount từ Max3D entry
 */

import { GameProduct } from "@megawin/game-core/entities";
import type { EntryFeedDoc } from "@megawin/game-core/entities";
import {
  BaseSyncEntryFeedUseCase,
  type FeedSyncableEntryRepo,
} from "@megawin/game-core-application/use-cases";
import { Long } from "mongodb";
import { EntryRepository } from "../../infras/repos/entry-repo";

export class SyncEntryFeedUseCase extends BaseSyncEntryFeedUseCase {
  protected getGameProduct(): GameProduct {
    return GameProduct.Max3d;
  }

  protected createEntryRepo(): FeedSyncableEntryRepo {
    return new EntryRepository();
  }

  protected mapToFeedDoc(
    entry: unknown,
    feedCreatedAt: Date,
  ): Omit<EntryFeedDoc, "_id"> {
    const e = entry as Record<string, any>;
    const winAmount = e.payout?.winAmount ?? 0;
    const payoutAmount = e.payout?.payoutAmount ?? 0;
    const stakeAmount = e.amount ?? 0;

    return {
      version: e.version ?? Long.fromNumber(0),
      gameProduct: GameProduct.Max3d,
      sourceEntryId: e.id,
      ticketId: typeof e.ticketId === "string"
        ? e.ticketId
        : e.ticketId?.toHexString?.() ?? String(e.ticketId),
      ticketNo: e.entrySummary?.ticketNo ?? "",
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
