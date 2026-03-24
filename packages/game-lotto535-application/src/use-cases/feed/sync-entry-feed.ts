/**
 * Use Case: Sync Entry Feed (Lotto 5/35)
 *
 * Extends BaseSyncEntryFeedUseCase.
 * Implement fetchNextBatch() — fetch typed TicketEntryEntity từ Lotto535 repo,
 * map sang EntryFeedDoc[] (type-safe, không dùng unknown/Record).
 */

import { GameProduct } from "@megawin/game-core/entities";
import type { EntryFeedDoc, FeedVoidInfo } from "@megawin/game-core/entities";
import { BaseSyncEntryFeedUseCase } from "@megawin/game-core-application/use-cases";
import { Long } from "mongodb";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type {
  TicketEntryEntity,
  EntryBoardSnapshot,
  EntryPayout,
  EntryVoidInfo,
} from "@megawin/game-lotto535/entities";
import type {
  Lotto535FeedBetContent,
  Lotto535FeedDrawResult,
  Lotto535FeedPayoutDetail,
} from "@megawin/game-lotto535/entities";
import { toTenantUsername } from "@megawin/shared/utils";

export class SyncEntryFeedUseCase extends BaseSyncEntryFeedUseCase {
  private readonly entryRepo = new EntryRepository();

  constructor() {
    super(GameProduct.Lotto535);
  }

  protected async fetchNextBatch(
    afterVersion: string,
    batchSize: number,
  ): Promise<Omit<EntryFeedDoc, "_id">[]> {
    const entries = await this.entryRepo.getChangedEntries(
      Long.fromString(afterVersion),
      batchSize,
    );
    return entries.map((e) => mapToFeedDoc(e));
  }
}

function mapToFeedDoc(e: TicketEntryEntity): Omit<EntryFeedDoc, "_id"> {
  const winAmount = e.payout?.winAmount ?? 0;
  const payoutAmount = e.payout?.payoutAmount ?? 0;
  const stakeAmount = e.amount;

  return {
    version: Long.fromString(e.version),
    gameProduct: GameProduct.Lotto535,
    entryId: e.id,
    ticketId: e.ticketId,
    ticketNo: e.entrySummary.ticketNo,
    tenantId: e.tenantId,
    accountId: e.accountId,
    username: toTenantUsername(e.username),
    financialDate: e.financialDate,
    drawId: e.drawId,
    status: e.status,
    outcome: e.outcome,
    stakeAmount,
    winAmount,
    payoutAmount,
    ggr: stakeAmount - payoutAmount,
    commissionRate: e.tenant.commissionRate,
    commissionAmount: e.tenant.commissionAmount,
    voidInfo: mapVoidInfo(e.voidInfo),
    betContent: mapBetContent(e.entrySummary.boards),
    drawResult: mapDrawResult(e.result),
    payoutDetail: mapPayoutDetail(e.payout),
    updatedAt: e.updatedAt ?? new Date(),
    feedCreatedAt: new Date(),
  };
}

function mapVoidInfo(v: EntryVoidInfo | undefined): FeedVoidInfo | undefined {
  if (!v) return undefined;
  return {
    originalAmount: v.originalAmount,
    refundAmount: v.refundAmount,
    refundStatus: String(v.refundStatus),
    voidedAt: v.voidedAt,
  };
}

function mapBetContent(boards: EntryBoardSnapshot[]): Lotto535FeedBetContent {
  return {
    boards: boards.map((b) => ({
      boardNo: b.boardNo,
      playType: String(b.playType),
      mainNumbers: b.mainNumbers,
      specialNumbers: b.specialNumbers,
      expandedLines: b.expandedLines,
      betCount: b.betCount,
    })),
  };
}

function mapDrawResult(result: TicketEntryEntity["result"]): Lotto535FeedDrawResult | undefined {
  if (!result) return undefined;
  return {
    winningMain: result.winningMain,
    winningSpecial: result.winningSpecial,
    publishedAt:
      result.publishedAt instanceof Date
        ? result.publishedAt.toISOString()
        : String(result.publishedAt),
  };
}

function mapPayoutDetail(payout: EntryPayout | undefined): Lotto535FeedPayoutDetail | undefined {
  if (!payout || !payout.tiers?.length) return undefined;
  return {
    settledAt:
      payout.settledAt instanceof Date ? payout.settledAt.toISOString() : String(payout.settledAt),
    tiers: payout.tiers.map((t) => ({
      tier: String(t.tier),
      hitCount: t.hitCount,
      unitAmount: t.unitAmount,
      amount: t.amount,
    })),
  };
}
