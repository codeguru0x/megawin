/**
 * Use Case: Sync Entry Feed (Bingo 18)
 *
 * Extends BaseSyncEntryFeedUseCase.
 * Implement fetchNextBatch() — fetch typed TicketEntryEntity từ Bingo18 repo,
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
} from "@megawin/game-bingo18/entities";
import type {
  Bingo18FeedBetContent,
  Bingo18FeedDrawResult,
  Bingo18FeedPayoutDetail,
} from "@megawin/game-bingo18/entities";
import { toTenantUsername } from "@megawin/shared/utils";

export class SyncEntryFeedUseCase extends BaseSyncEntryFeedUseCase {
  private readonly entryRepo = new EntryRepository();

  constructor() {
    super(GameProduct.Bingo18);
  }

  /**
   *
   * @param afterVersion - Version cuối cùng đã sync thành công.
   * @param batchSize - Số lượng entries tối đa mỗi batch.
   * @returns - Danh sách EntryFeedDoc.
   */
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

// ─── Type-safe mappers: TicketEntryEntity → EntryFeedDoc ─────────────────────

function mapToFeedDoc(e: TicketEntryEntity): Omit<EntryFeedDoc, "_id"> {
  const winAmount = e.payout?.winAmount ?? 0;
  const payoutAmount = e.payout?.payoutAmount ?? 0;
  const stakeAmount = e.amount;

  return {
    version: Long.fromString(e.version),
    gameProduct: GameProduct.Bingo18,
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
  if (!v) {
    return undefined;
  }

  return {
    originalAmount: v.originalAmount,
    refundAmount: v.refundAmount,
    refundStatus: v.refundStatus,
    voidedAt: v.voidedAt,
  };
}

function mapBetContent(
  boards: EntryBoardSnapshot[],
  sideBets: EntrySideBetSnapshot[],
): Bingo18FeedBetContent {
  return {
    boards: boards.map((b) => ({
      boardNo: b.boardNo,
      playType: String(b.playType),
      number: b.number,
      tripleKind: b.tripleKind != null ? String(b.tripleKind) : undefined,
      betCount: b.betCount,
    })),
    sideBets: sideBets.map((s) => ({
      playType: String(s.playType),
      sum: s.sum,
      bet: s.bet != null ? String(s.bet) : undefined,
      betCount: s.betCount,
    })),
  };
}

function mapDrawResult(result: TicketEntryEntity["result"]): Bingo18FeedDrawResult | undefined {
  if (!result) return undefined;
  return {
    numbers: result.numbers,
    sum: result.sum,
    publishedAt:
      result.publishedAt instanceof Date
        ? result.publishedAt.toISOString()
        : String(result.publishedAt),
  };
}

function mapPayoutDetail(payout: EntryPayout | undefined): Bingo18FeedPayoutDetail | undefined {
  if (!payout) return undefined;
  return {
    settledAt:
      payout.settledAt instanceof Date ? payout.settledAt.toISOString() : String(payout.settledAt),
    boardPayouts: payout.boardPayouts.map((b) => ({
      boardNo: b.boardNo,
      playType: String(b.playType),
      tripleKind: b.tripleKind != null ? String(b.tripleKind) : undefined,
      matchCount: b.matchCount,
      betCount: b.betCount,
      unitWinAmount: b.unitWinAmount,
      winAmount: b.winAmount,
    })),
    sideBetPayouts: payout.sideBetPayouts.map((s) => ({
      playType: String(s.playType),
      sum: s.sum,
      bet: s.bet != null ? String(s.bet) : undefined,
      outcome: s.outcome,
      isWin: s.isWin,
      betCount: s.betCount,
      unitWinAmount: s.unitWinAmount,
      winAmount: s.winAmount,
    })),
  };
}
