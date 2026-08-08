/**
 * Use Case: Place Bet (Bingo 18)
 *
 * Đặt cược Bingo 18 với tất cả entries tạo ngay (all-or-nothing):
 *   - Player gửi danh sách drawIds đang mở bán
 *   - Server validate tất cả draws → reject nếu 1 draw không hợp lệ
 *   - Tạo entries cho TẤT CẢ draws ngay lập tức
 *
 * boards[] chứa cả cơ bản (singleNum, doubleMatch, tripleMatch) và bổ sung (sumTotal, bigSmallDraw),
 * phân biệt qua playType. Validation chi tiết ở Zod handler.
 * Use case chỉ kiểm tra tenant + draw (DB) + betCount range.
 */

import { AppException } from "@megawin/shared/errors";
import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus, EntryStatus, TicketStatus } from "@megawin/game-core/entities";
import type {
  Board,
  TicketDoc,
  TicketEntryDoc,
  EntryBoardSnapshot,
  EntrySummary,
} from "@megawin/game-bingo18/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { PlaceBetStore } from "../../infras/repos/place-bet-store";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { GetTenantConfigInternalUseCase } from "../tenant-config/get-tenant-config-internal";
import { TicketCounterRepository } from "@megawin/game-core-application/repos";
import { DebitPlayerService } from "@megawin/game-core-application/services";
import { buildTicketNo, GameProduct } from "@megawin/game-core/entities";
import { Currency } from "@megawin/shared/types";
import type { PlaceBetInput, PlaceBetOutput } from "./dto/place-bet.dto";
import { nowVN, getFinancialDate } from "@megawin/shared/utils";
import { ObjectId } from "mongodb";

export class PlaceBetUseCase extends ApiGatewayUseCase<PlaceBetInput, PlaceBetOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly placeBetStore = new PlaceBetStore();
  private readonly ticketCounter = new TicketCounterRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();
  private readonly getTenantConfig = new GetTenantConfigInternalUseCase();
  private readonly debitService = new DebitPlayerService();

  protected async execute(input: PlaceBetInput): Promise<PlaceBetOutput> {
    const { tenantId, accountId, username, channel, ipAddress, drawIds, boards: boardInputs } = input;

    // ── 1. Load game config ──
    const globalConfig = await this.getGlobalConfig.run();
    const { play } = globalConfig;

    // ── 2. Validate drawIds ──
    // drawIds.length >= 1 và không duplicate đã validate bởi Zod schema.
    // Giới hạn maxDrawCount là runtime config → cần check lại ở đây.
    if (drawIds.length > play.maxDrawCount) {
      throw AppException.badRequest(`Số kỳ phải từ 1 đến ${play.maxDrawCount}.`);
    }

    // ── 3. Validate boards ──
    // boards.length >= 1 và boardNo đúng thứ tự chữ cái (A, B, C... AA...) đã validate bởi Zod schema.
    // Zod chỉ chặn hard cap (chống abuse); maxBasicBoardsPerTicket là runtime config →
    // đây là NƠI DUY NHẤT enforce giới hạn số board thật theo cấu hình game.
    if (boardInputs.length > play.maxBasicBoardsPerTicket) {
      throw AppException.badRequest(`Số board tối đa là ${play.maxBasicBoardsPerTicket}.`);
    }

    // Validate betCount range cho tất cả boards.
    for (const bi of boardInputs) {
      if (bi.betCount < play.minBetCount || bi.betCount > play.maxBetCount) {
        throw AppException.badRequest(`betCount phải từ ${play.minBetCount} đến ${play.maxBetCount}.`);
      }
    }

    // ── 4. Build boards (unified: cơ bản + bổ sung) ──
    const builtBoards: Board[] = boardInputs.map((bi) => ({
      boardNo: bi.boardNo,
      playType: bi.playType,
      number: bi.number,
      tripleKind: bi.tripleKind,
      sum: bi.sum,
      bet: bi.bet,
      betCount: bi.betCount,
    }));

    // ── 5. Validate tất cả draws – all-or-nothing ──
    const now = nowVN();
    const draws = await this.drawRepo.getDrawsByIds(drawIds);

    const drawMap = new Map(draws.map((d) => [d.drawId, d]));

    for (const drawId of drawIds) {
      const draw = drawMap.get(drawId);
      if (!draw) {
        throw AppException.badRequest(`Kỳ quay ${drawId} không tồn tại.`);
      }

      if (draw.status !== DrawStatus.SalesOpen) {
        throw AppException.badRequest(`Kỳ quay ${drawId} không đang mở bán.`);
      }

      if (now >= draw.sales.closeAt) {
        throw AppException.badRequest(`Kỳ quay ${drawId} đã hết thời gian nhận cược.`);
      }
    }

    // ── 6. Load commission rate ──
    const tenantConfig = await this.getTenantConfig.run({ tenantId });
    if (!tenantConfig || tenantConfig.isEnabled !== true) {
      throw AppException.unauthorized("Không được phép chơi game. Vui lòng liên hệ admin.");
    }
    const commissionRate = tenantConfig.commissionRate;

    // ── 7. Calculate pricing ──
    const unitPrice = play.unitPrice;
    // selectionsPerDraw = đếm số bets logic (đếm boards, không nhân betCount).
    const selectionsPerDraw = builtBoards.length;
    // betUnitsPerDraw = tổng đơn vị cược thực tế = Σ(board.betCount).
    const betUnitsPerDraw = builtBoards.reduce((acc, b) => acc + b.betCount, 0);
    const amountPerDraw = unitPrice * betUnitsPerDraw;
    const totalAmount = amountPerDraw * drawIds.length;
    const commissionAmount = Math.round(amountPerDraw * commissionRate);

    // ── 8. Build ticket document ──
    const { seq, date } = await this.ticketCounter.nextTicketSeq(accountId);
    const ticketNo = buildTicketNo(GameProduct.Bingo18, date, seq);
    const drawCount = drawIds.length;

    // tx (UUIDv7) generate sớm để gán vào ticketDoc — link ticket ↔ WAL.
    const tx = this.debitService.generateTx();

    // _id phải là ObjectId instance để MongoDB lưu đúng kiểu và mapper có thể gọi toHexString().
    const ticketObjectId = new ObjectId();
    const ticketId = ticketObjectId.toHexString();
    const ticketDoc: TicketDoc = {
      _id: ticketObjectId,
      tenantId,
      accountId,
      username,
      ticketNo,
      channel,
      ipAddress,
      drawPlan: {
        drawIds,
        drawCount,
      },
      pricing: {
        unitPrice,
        selectionsPerDraw,
        betUnitsPerDraw,
        amountPerDraw,
        totalAmount,
      },
      boards: builtBoards,
      progress: {
        totalDraws: drawCount,
        settledDraws: 0,
      },
      tx,
      financialDate: getFinancialDate(now),
      status: TicketStatus.Paid,
      version: 0,
      createdAt: now,
      updatedAt: now,
    };

    // ── 9. Build entry snapshots (unified boards) ──
    const boardSnapshots: EntryBoardSnapshot[] = builtBoards.map((b) => ({
      boardNo: b.boardNo,
      playType: b.playType,
      number: b.number,
      tripleKind: b.tripleKind,
      sum: b.sum,
      bet: b.bet,
      betCount: b.betCount,
    }));

    // ── 10. Create entries cho TẤT CẢ draws (all-or-nothing) ──
    const entryDocs: Array<Omit<TicketEntryDoc, "_id" | "version">> = [];

    for (const drawId of drawIds) {
      const draw = drawMap.get(drawId)!;
      entryDocs.push({
        tenantId,
        accountId,
        username,
        ipAddress,
        ticketId,
        drawId: draw.drawId,
        financialDate: draw.financialDate,
        tenant: { commissionRate, commissionAmount },
        status: EntryStatus.Scheduled,
        selectionCount: selectionsPerDraw,
        betUnitCount: betUnitsPerDraw,
        amount: amountPerDraw,
        unitPrice,
        entrySummary: {
          ticketNo,
          boards: boardSnapshots,
        } satisfies EntrySummary,
        createdAt: now,
        updatedAt: now,
      });
    }

    // ── 11. Debit player via WAL — ngay trước save để giảm cửa sổ crash ──
    const { balance } = await this.debitService.debit({
      tx,
      tenantId,
      accountId,
      username,
      amount: totalAmount,
      currency: Currency.VND,
      gameId: GameProduct.Bingo18,
      roundIds: drawIds,
      description: `Đặt cược Bingo 18 ${drawCount} kỳ ${drawIds[0]}${drawCount > 1 ? `→${drawIds[drawCount - 1]}` : ""}`,
      metadata: { ticketNo },
    });

    // ── 12. Save ticket + entries atomically ──
    await this.placeBetStore.saveAtomically(ticketDoc, entryDocs);

    // ── 13. Mark WAL completed ──
    await this.debitService.markCompleted(tx);

    return {
      ticketId,
      ticketNo,
      status: TicketStatus.Paid,
      balance,
      drawPlan: {
        drawIds,
        drawCount,
      },
      pricing: {
        unitPrice,
        selectionsPerDraw,
        betUnitsPerDraw,
        amountPerDraw,
        totalAmount,
      },
      boardCount: builtBoards.length,
      entryCount: drawCount,
    };
  }
}
