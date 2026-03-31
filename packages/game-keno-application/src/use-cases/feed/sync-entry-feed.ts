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
  EntryPayout,
  EntryVoidInfo,
  EntryResult,
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
    return entries.map((e) => mapToFeedDoc(e, this.gameProduct));
  }
}

/**
 * Map TicketEntryEntity to EntryFeedDoc.
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
  } satisfies Omit<EntryFeedDoc, "_id">;
}

function mapBetContent(boards: EntryBoardSnapshot[]): KenoFeedBetContent {
  return {
    boards: boards.map((b) => ({
      boardNo: b.boardNo,
      playType: b.playType,
      // Cơ bản (pick1-pick10): numbers bắt buộc, bet = undefined.
      // Bổ sung (bigSmall/evenOdd): bet bắt buộc, numbers = undefined.
      numbers: b.numbers,
      bet: b.bet,
      betCount: b.betCount,
    })),
  } satisfies KenoFeedBetContent;
}

function mapVoidInfo(v: EntryVoidInfo | undefined): FeedVoidInfo | undefined {
  if (!v) return undefined;
  return {
    originalAmount: v.originalAmount,
    refundAmount: v.refundAmount,
    voidedAt: v.voidedAt,
  } satisfies FeedVoidInfo;
}

function mapDrawResult(result: EntryResult | undefined): KenoFeedDrawResult | undefined {
  if (!result) {
    return undefined;
  }

  return {
    numbers: result.winningNumbers,
  } satisfies KenoFeedDrawResult;
}

function mapPayoutDetail(payout: EntryPayout | undefined): KenoFeedPayoutDetail | undefined {
  if (!payout) {
    return undefined;
  }

  return {
    boardPayouts: payout.boardPayouts.map((b) => ({
      boardNo: b.boardNo,
      playType: b.playType,
      pickCount: b.pickCount,
      matchCount: b.matchCount,
      bet: b.bet,
      outcome: b.outcome,
      isWin: b.isWin,
      betCount: b.betCount,
      winAmount: b.winAmount,
    })),
  } satisfies KenoFeedPayoutDetail;
}
