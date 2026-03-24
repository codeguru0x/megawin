/**
 * Use Case: Sync Entry Feed (Keno)
 *
 * Extends BaseSyncEntryFeedUseCase.
 * Implement fetchNextBatch() — fetch typed TicketEntryEntity từ Keno repo,
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
  EntrySideBetSnapshot,
  EntryPayout,
  EntryVoidInfo,
} from "@megawin/game-keno/entities";
import type {
  KenoFeedBetContent,
  KenoFeedDrawResult,
  KenoFeedPayoutDetail,
} from "@megawin/game-keno/entities";
import { toTenantUsername } from "@megawin/shared/utils";

export class SyncEntryFeedUseCase extends BaseSyncEntryFeedUseCase {
  private readonly entryRepo = new EntryRepository();

  constructor() {
    super(GameProduct.Keno);
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
    gameProduct: GameProduct.Keno,
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
    betContent: mapBetContent(e.entrySummary.boards, e.entrySummary.sideBets),
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

function mapBetContent(
  boards: EntryBoardSnapshot[],
  sideBets: EntrySideBetSnapshot[],
): KenoFeedBetContent {
  return {
    boards: boards.map((b) => ({
      boardNo: b.boardNo,
      playType: String(b.playType),
      numbers: b.numbers,
      betCount: b.betCount,
    })),
    sideBets: sideBets.map((s) => ({
      playType: String(s.playType),
      bet: String(s.bet),
      betCount: s.betCount,
    })),
  };
}

function mapDrawResult(result: TicketEntryEntity["result"]): KenoFeedDrawResult | undefined {
  if (!result) return undefined;
  return {
    winningNumbers: result.winningNumbers,
    bigCount: result.bigCount,
    smallCount: result.smallCount,
    evenCount: result.evenCount,
    oddCount: result.oddCount,
    publishedAt:
      result.publishedAt instanceof Date
        ? result.publishedAt.toISOString()
        : String(result.publishedAt),
  };
}

function mapPayoutDetail(payout: EntryPayout | undefined): KenoFeedPayoutDetail | undefined {
  if (!payout) return undefined;
  return {
    settledAt:
      payout.settledAt instanceof Date ? payout.settledAt.toISOString() : String(payout.settledAt),
    boardPayouts: payout.boardPayouts.map((b) => ({
      boardNo: b.boardNo,
      playType: String(b.playType),
      pickCount: b.pickCount,
      matchCount: b.matchCount,
      betCount: b.betCount,
      winAmount: b.winAmount,
    })),
    sideBetPayouts: payout.sideBetPayouts.map((s) => ({
      playType: String(s.playType),
      bet: String(s.bet),
      outcome: s.outcome,
      isWin: s.isWin,
      betCount: s.betCount,
      winAmount: s.winAmount,
    })),
  };
}
