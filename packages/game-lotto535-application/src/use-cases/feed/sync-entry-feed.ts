/**
 * Use Case: Sync Entry Feed (Lotto 5/35)
 *
 * Extends BaseSyncEntryFeedUseCase.
 * Implement fetchNextBatch() — fetch typed TicketEntryEntity từ Lotto535 repo,
 * map sang EntryFeedDoc[] (type-safe, không dùng unknown/Record).
 */

import type { EntryFeedDoc, FeedVoidInfo } from "@megawin/game-core/entities";
import { GameProduct } from "@megawin/game-core/entities";
import { BaseSyncEntryFeedUseCase } from "@megawin/game-core-application/use-cases";
import type {
  EntryBoardSnapshot,
  EntryPayout,
  EntryResult,
  EntryVoidInfo,
  Lotto535FeedBetContent,
  Lotto535FeedDrawResult,
  Lotto535FeedPayoutDetail,
  TicketEntryEntity,
} from "@megawin/game-lotto535/entities";
import { toTenantUsername } from "@megawin/shared/utils";
import { Long } from "mongodb";

import { EntryRepository } from "../../infras/repos/entry-repo";

export class SyncEntryFeedUseCase extends BaseSyncEntryFeedUseCase {
  private readonly entryRepo = new EntryRepository();

  constructor() {
    super(GameProduct.Lotto535);
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
    betUnitCount: e.betUnitCount,
    unitPrice: e.unitPrice,
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

function mapBetContent(boards: EntryBoardSnapshot[]): Lotto535FeedBetContent {
  return {
    boards: boards.map((b) => ({
      boardNo: b.boardNo,
      playType: b.playType,
      mainNumbers: b.mainNumbers,
      specialNumbers: b.specialNumbers,
      expandedLines: b.expandedLines,
      betCount: b.betCount,
    })),
  } satisfies Lotto535FeedBetContent;
}

function mapDrawResult(result: EntryResult | undefined): Lotto535FeedDrawResult | undefined {
  if (!result) {
    return undefined;
  }

  return {
    winningMain: result.winningMain,
    winningSpecial: result.winningSpecial,
  } satisfies Lotto535FeedDrawResult;
}

function mapPayoutDetail(payout: EntryPayout | undefined): Lotto535FeedPayoutDetail | undefined {
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
  } satisfies Lotto535FeedPayoutDetail;
}
