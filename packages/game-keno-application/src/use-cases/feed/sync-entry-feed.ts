/**
 * Use Case: Sync Entry Feed (Keno)
 *
 * Extends BaseSyncEntryFeedUseCase — chỉ cung cấp game-specific logic:
 * - GameProduct: keno
 * - EntryRepo: Keno EntryRepository
 * - Mapping: extract tất cả fields cho EntryFeedDoc từ Keno entry
 */

import { GameProduct } from "@megawin/game-core/entities";
import type { EntryFeedDoc, FeedVoidInfo } from "@megawin/game-core/entities";
import {
  BaseSyncEntryFeedUseCase,
  type FeedSyncableEntryRepo,
} from "@megawin/game-core-application/use-cases";
import { Long } from "mongodb";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawEntity } from "@megawin/game-keno/entities";
import type {
  KenoFeedBetContent,
  KenoFeedDrawResult,
  KenoFeedPayoutDetail,
} from "@megawin/game-keno/entities";

export class SyncEntryFeedUseCase extends BaseSyncEntryFeedUseCase {
  private readonly drawRepo = new DrawRepository();

  protected getGameProduct(): GameProduct {
    return GameProduct.Keno;
  }

  protected createEntryRepo(): FeedSyncableEntryRepo {
    return new EntryRepository();
  }

  protected override async buildBatchContext(entries: unknown[]): Promise<Map<string, DrawEntity>> {
    const drawIds = [...new Set((entries as any[]).map((e: any) => e.drawId as string))];
    const draws = await this.drawRepo.getDrawsByIds(drawIds);
    return new Map<string, DrawEntity>(draws.map((d) => [d.drawId, d]));
  }

  protected mapToFeedDoc(
    entry: unknown,
    feedCreatedAt: Date,
    ctx?: unknown,
  ): Omit<EntryFeedDoc, "_id"> {
    const e = entry as Record<string, any>;
    const drawMap = ctx as Map<string, DrawEntity> | undefined;
    const draw = drawMap?.get(e.drawId);
    const winAmount = e.payout?.winAmount ?? 0;
    const payoutAmount = e.payout?.payoutAmount ?? 0;
    const stakeAmount = e.amount ?? 0;

    return {
      version: e.version ?? Long.fromNumber(0),
      gameProduct: GameProduct.Keno,
      sourceEntryId: e.id,
      ticketId:
        typeof e.ticketId === "string"
          ? e.ticketId
          : (e.ticketId?.toHexString?.() ?? String(e.ticketId)),
      ticketNo: e.entrySummary?.ticketNo ?? "",
      tenantId: e.tenantId,
      playerId: e.accountId,
      username: e.username ?? "",
      financialDate: e.financialDate ?? e.drawId.slice(0, 10),
      drawId: e.drawId,
      // drawTime/drawDate lấy từ draw (source of truth) thay vì snapshot cũ trong entry.
      drawTime: draw?.drawTime ?? new Date(e.drawId.slice(0, 10)),
      drawDate: draw?.drawDate ?? e.drawId.slice(0, 10),
      status: e.status,
      outcome: e.outcome,
      stakeAmount,
      winAmount,
      payoutAmount,
      netAmount: stakeAmount - payoutAmount,
      commissionRate: e.tenant?.commissionRate ?? 0,
      commissionAmount: e.tenant?.commissionAmount ?? 0,
      voidInfo: mapVoidInfo(e),
      betContent: mapBetContent(e),
      drawResult: mapDrawResult(e),
      payoutDetail: mapPayoutDetail(e),
      sourceUpdatedAt: e.updatedAt ?? feedCreatedAt,
      feedCreatedAt,
    };
  }
}

function mapVoidInfo(e: Record<string, any>): FeedVoidInfo | undefined {
  const v = e.voidInfo;
  if (!v) return undefined;
  return {
    originalAmount: v.originalAmount,
    refundAmount: v.refundAmount,
    refundStatus: String(v.refundStatus),
    voidedAt: v.voidedAt,
  };
}

function mapBetContent(e: Record<string, any>): KenoFeedBetContent {
  const boards = (e.entrySummary?.boards ?? []).map((b: any) => ({
    boardNo: b.boardNo,
    playType: String(b.playType),
    numbers: b.numbers ?? [],
    betCount: b.betCount ?? 1,
  }));
  const sideBets = (e.entrySummary?.sideBets ?? []).map((s: any) => ({
    playType: String(s.playType),
    bet: String(s.bet),
    betCount: s.betCount ?? 1,
  }));
  return { boards, sideBets };
}

function mapDrawResult(e: Record<string, any>): KenoFeedDrawResult | undefined {
  const r = e.result;
  if (!r) return undefined;
  return {
    winningNumbers: r.winningNumbers ?? [],
    bigCount: r.bigCount ?? 0,
    smallCount: r.smallCount ?? 0,
    evenCount: r.evenCount ?? 0,
    oddCount: r.oddCount ?? 0,
    publishedAt:
      r.publishedAt instanceof Date ? r.publishedAt.toISOString() : String(r.publishedAt),
  };
}

function mapPayoutDetail(e: Record<string, any>): KenoFeedPayoutDetail | undefined {
  const p = e.payout;
  if (!p) return undefined;
  return {
    settledAt: p.settledAt instanceof Date ? p.settledAt.toISOString() : String(p.settledAt),
    boardPayouts: (p.boardPayouts ?? []).map((b: any) => ({
      boardNo: b.boardNo,
      playType: String(b.playType),
      pickCount: b.pickCount,
      matchCount: b.matchCount,
      betCount: b.betCount,
      winAmount: b.winAmount,
    })),
    sideBetPayouts: (p.sideBetPayouts ?? []).map((s: any) => ({
      playType: String(s.playType),
      bet: String(s.bet),
      outcome: String(s.outcome),
      isWin: s.isWin,
      betCount: s.betCount,
      winAmount: s.winAmount,
    })),
  };
}
