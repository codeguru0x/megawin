/**
 * Use Case: Sync Entry Feed (Power 6/55)
 *
 * Extends BaseSyncEntryFeedUseCase.
 * Implement fetchNextBatch() — fetch typed TicketEntryEntity từ Power655 repo,
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
  EntryResult,
} from "@megawin/game-power655/entities";
import type {
  Power655FeedBetContent,
  Power655FeedDrawResult,
  Power655FeedPayoutDetail,
} from "@megawin/game-power655/entities";
import { toTenantUsername } from "@megawin/shared/utils";

/**
 * Sync Power 6/55 entries vào unified entry feed.
 * Tenant poll collection entryFeed để nhận cập nhật.
 */
export class SyncEntryFeedUseCase extends BaseSyncEntryFeedUseCase {
  private readonly entryRepo = new EntryRepository();

  constructor() {
    super(GameProduct.Power655);
  }

  protected async fetchNextBatch(afterVersion: string, batchSize: number): Promise<Omit<EntryFeedDoc, "_id">[]> {
    const entries = await this.entryRepo.getChangedEntries(Long.fromString(afterVersion), batchSize);
    return entries.map((e) => mapToFeedDoc(e, this.gameProduct));
  }
}

function mapToFeedDoc(e: TicketEntryEntity, gameProduct: GameProduct): Omit<EntryFeedDoc, "_id"> {
  const winAmount = e.payout?.winAmount ?? 0;
  const payoutAmount = e.payout?.payoutAmount ?? 0;
  const stakeAmount = e.amount;

  return {
    version: Long.fromString(e.version),
    gameProduct: gameProduct,
    entryId: e.id,
    ticketId: e.ticketId,
    ticketNo: e.entrySummary.ticketNo,
    tenantId: e.tenantId,
    accountId: e.accountId,
    username: toTenantUsername(e.username),
    ip: e.ipAddress ?? "",
    financialDate: e.financialDate,
    drawId: e.drawId,
    status: e.status,
    outcome: e.outcome,
    betUnitCount: e.betUnitCount,
    unitPrice: e.unitPrice,
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
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    feedCreatedAt: new Date(),
  };
}

function mapVoidInfo(v: EntryVoidInfo | undefined): FeedVoidInfo | undefined {
  if (!v) {
    return undefined;
  }

  return {
    originalAmount: v.originalAmount,
    refundAmount: v.refundAmount,
    voidedAt: v.voidedAt,
  };
}

function mapBetContent(boards: EntryBoardSnapshot[]): Power655FeedBetContent {
  return {
    boards: boards.map((b) => ({
      boardNo: b.boardNo,
      playType: b.playType,
      mainNumbers: b.mainNumbers,
      expandedLines: b.expandedLines,
      betCount: b.betCount,
    })),
  };
}

function mapDrawResult(result: EntryResult | undefined): Power655FeedDrawResult | undefined {
  if (!result) {
    return undefined;
  }

  return {
    winningMain: result.winningMain,
    bonusNumber: result.bonusNumber,
  } satisfies Power655FeedDrawResult;
}

function mapPayoutDetail(payout: EntryPayout | undefined): Power655FeedPayoutDetail | undefined {
  if (!payout || !payout.tiers?.length) {
    return undefined;
  }

  return {
    tiers: payout.tiers.map((t) => ({
      tier: t.tier,
      hitCount: t.hitCount,
      unitAmount: t.unitAmount,
      amount: t.amount,
    })),
  } satisfies Power655FeedPayoutDetail;
}
