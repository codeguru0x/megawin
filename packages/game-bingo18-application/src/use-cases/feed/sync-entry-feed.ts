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
  EntryPayout,
  EntryVoidInfo,
  EntryResult,
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
    return entries.map((e) => mapToFeedDoc(e, this.gameProduct));
  }
}

// ─── Type-safe mappers: TicketEntryEntity → EntryFeedDoc ─────────────────────

/**
 *
 * @param e - TicketEntryEntity
 * @param gameProduct - GameProduct
 * @returns Omit<EntryFeedDoc, "_id">
 */
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

function mapBetContent(boards: EntryBoardSnapshot[]): Bingo18FeedBetContent {
  return {
    boards: boards.map((b) => ({
      boardNo: b.boardNo,
      playType: b.playType,
      number: b.number,
      tripleKind: b.tripleKind,
      sum: b.sum,
      bet: b.bet,
      betCount: b.betCount,
    })),
  } satisfies Bingo18FeedBetContent;
}

function mapVoidInfo(v: EntryVoidInfo | undefined): FeedVoidInfo | undefined {
  if (!v) {
    return undefined;
  }

  return {
    originalAmount: v.originalAmount,
    refundAmount: v.refundAmount,
    voidedAt: v.voidedAt,
  } satisfies FeedVoidInfo;
}

function mapDrawResult(result: EntryResult | undefined): Bingo18FeedDrawResult | undefined {
  if (!result) {
    return undefined;
  }

  return {
    numbers: result.numbers,
  } satisfies Bingo18FeedDrawResult;
}

function mapPayoutDetail(payout: EntryPayout | undefined): Bingo18FeedPayoutDetail | undefined {
  if (!payout) {
    return undefined;
  }

  return {
    boardPayouts: payout.boardPayouts.map((b) => ({
      boardNo: b.boardNo,
      playType: b.playType,
      tripleKind: b.tripleKind,
      matchCount: b.matchCount,
      sum: b.sum,
      bet: b.bet,
      outcome: b.outcome,
      isWin: b.isWin,
      betCount: b.betCount,
      unitWinAmount: b.unitWinAmount,
      winAmount: b.winAmount,
    })),
  };
}
