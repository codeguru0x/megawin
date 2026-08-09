/**
 * Use Case: Sync Entry Feed (Max 3D Pro)
 *
 * Extends BaseSyncEntryFeedUseCase.
 * Implement fetchNextBatch() — fetch typed TicketEntryEntity từ Max3DPro repo,
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
  Max3dproFeedBetContent,
  Max3dproFeedDrawResult,
  Max3dproFeedPayoutDetail,
  TicketEntryEntity,
} from "@megawin/game-max3dpro/entities";
import { toTenantUsername } from "@megawin/shared/utils";
import { Long } from "mongodb";

import { EntryRepository } from "../../infras/repos/entry-repo";

export class SyncEntryFeedUseCase extends BaseSyncEntryFeedUseCase {
  private readonly entryRepo = new EntryRepository();

  constructor() {
    super(GameProduct.Max3dpro);
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
  if (!v) return undefined;
  return {
    originalAmount: v.originalAmount,
    refundAmount: v.refundAmount,
    voidedAt: v.voidedAt,
  };
}

function mapBetContent(boards: EntryBoardSnapshot[]): Max3dproFeedBetContent {
  return {
    boards: boards.map((b) => ({
      boardNo: b.boardNo,
      playMode: b.playMode,
      playType: b.playType,
      triplets: b.triplets,
      frontDigits: b.frontDigits,
      backDigits: b.backDigits,
      lineCount: b.lineCount,
      betCount: b.betCount,
    })),
  };
}

function mapDrawResult(result: EntryResult | undefined): Max3dproFeedDrawResult | undefined {
  if (!result) {
    return undefined;
  }

  return {
    special: result.special,
    first: result.first,
    second: result.second,
    third: result.third,
  } satisfies Max3dproFeedDrawResult;
}

function mapPayoutDetail(payout: EntryPayout | undefined): Max3dproFeedPayoutDetail | undefined {
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
  } satisfies Max3dproFeedPayoutDetail;
}
