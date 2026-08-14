/**
 * Use Case: Place Bet (Keno)
 *
 * Đặt cược Keno với tất cả entries tạo ngay (all-or-nothing):
 *   - Player gửi danh sách drawIds đang mở bán
 *   - Server validate tất cả draws → reject nếu 1 draw không hợp lệ
 *   - Debit player qua tenant gateway (WAL-protected)
 *   - Tạo entries cho TẤT CẢ draws ngay lập tức
 *
 * DEBIT FLOW (WAL-protected):
 *   1. Validate input (tenant, draws, boards, pricing)
 *   2. DebitPlayerService.debit() — ghi WAL + gọi tenant debit
 *   3. saveAtomically(ticket { tx }, entries) — ticket link với WAL qua tx
 *   4. DebitPlayerService.markCompleted(tx) — WAL → COMPLETED
 *
 * CRASH SCENARIOS:
 *   - Crash trước debit → WAL DEBIT_PENDING, scheduler confirm debit = not_found → xoá WAL
 *   - Crash sau debit, trước save → scheduler confirm debit = success, no ticket → rollback credit
 *   - Crash sau save, trước markCompleted → scheduler confirm debit = success, ticket exists → markCompleted
 *   - Crash sau markCompleted → đã hoàn tất, TTL cleanup 14 ngày
 *
 * boards[] chứa cả cơ bản (pick1-pick10) và bổ sung (bigSmall/evenOdd),
 * phân biệt qua playType. Validation chi tiết ở Zod handler (discriminated union).
 * Use case chỉ kiểm tra tenant + draw (DB) + betCount range.
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { buildTicketNo, DrawStatus, EntryStatus, GameProduct, TicketStatus } from "@megawin/game-core/entities";
import { TicketCounterRepository } from "@megawin/game-core-application/repos";
import { DebitPlayerService } from "@megawin/game-core-application/services";
import type { Board, EntryBoardSnapshot, TicketDoc, TicketEntryDoc } from "@megawin/game-keno/entities";
import { KENO_BASIC_PLAY_TYPE_SET } from "@megawin/game-keno/entities";
import { getPlayTypeFromPickCount } from "@megawin/game-keno/rules";
import { AppException } from "@megawin/shared/errors";
import { Currency } from "@megawin/shared/types";
import { getFinancialDate, nowVN } from "@megawin/shared/utils";
import { ObjectId } from "mongodb";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { PlaceBetStore } from "../../infras/repos/place-bet-store";
import { GetGlobalConfigUseCase } from "../game-config/get-global-config";
import { GetTenantConfigInternalUseCase } from "../tenant-config/get-tenant-config-internal";
import type { PlaceBetInput, PlaceBetOutput } from "./dto/place-bet.dto";

export class PlaceBetUseCase extends UseCase<PlaceBetInput, PlaceBetOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly placeBetStore = new PlaceBetStore();
  private readonly ticketCounter = new TicketCounterRepository();
  private readonly getGlobalConfig = new GetGlobalConfigUseCase();
  private readonly getTenantConfig = new GetTenantConfigInternalUseCase();
  private readonly debitService = new DebitPlayerService();

  protected async execute(input: PlaceBetInput): Promise<PlaceBetOutput> {
    const { tenantId, accountId, username, channel, ipAddress, drawIds, boards: boardInputs } = input;

    // ── 1. Load game config ──
    const globalConfig = await this.getGlobalConfig.run();
    const { play } = globalConfig;

    // ── 2. Validate tenant ──
    const tenantConfig = await this.getTenantConfig.run({ tenantId });
    if (!tenantConfig || tenantConfig.isEnabled !== true) {
      throw AppException.unauthorized("Không được phép chơi game. Vui lòng liên hệ admin.");
    }

    // ── 3. Kiểm tra giới hạn config động (khác với Zod hardcode) ──
    if (drawIds.length > play.maxDrawCount) {
      throw AppException.badRequest(`Số kỳ tối đa là ${play.maxDrawCount}.`);
    }

    if (boardInputs.length > play.maxBasicBoardsPerTicket) {
      throw AppException.badRequest(`Số board tối đa là ${play.maxBasicBoardsPerTicket}.`);
    }

    // Validate betCount nằm trong khoảng [minBetCount, maxBetCount] cho mọi board.
    const minBetCount = play.minBetCount;
    const maxBetCount = play.maxBetCount;

    for (const bi of boardInputs) {
      const bc = bi.betCount ?? 1;

      if (bc < minBetCount || bc > maxBetCount) {
        throw AppException.badRequest(
          `betCount ${bc} của board ${bi.boardNo} phải nằm trong [${minBetCount}, ${maxBetCount}].`,
        );
      }
    }

    // ── 4. Build boards (unified: cơ bản + bổ sung) ──
    const builtBoards: Board[] = boardInputs.map((bi) => {
      const isBasic = KENO_BASIC_PLAY_TYPE_SET.has(bi.playType);

      if (isBasic) {
        // Cơ bản (pick1-pick10): playType xác định từ số lượng số chọn.
        // Zod đã đảm bảo numbers tồn tại và đúng length ∈ [1,10].
        const playType = getPlayTypeFromPickCount(bi.numbers!.length);
        return {
          boardNo: bi.boardNo,
          playType,
          numbers: [...bi.numbers!].sort(),
          betCount: bi.betCount,
        };
      }

      // Bổ sung (bigSmall/evenOdd): bet đã validate ở Zod handler.
      return {
        boardNo: bi.boardNo,
        playType: bi.playType,
        bet: bi.bet,
        betCount: bi.betCount,
      };
    });

    // ── 5. Validate tất cả draws – all-or-nothing ──
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

      if (draw.sales?.closeAt && new Date() >= draw.sales.closeAt) {
        throw AppException.badRequest(`Kỳ quay ${drawId} đã hết thời gian nhận cược.`);
      }
    }

    // ── 6. Calculate pricing ──
    const unitPrice = play.unitPrice;
    // selectionsPerDraw = số bets logic (đếm boards, không nhân betCount).
    const selectionsPerDraw = builtBoards.length;
    // betUnitsPerDraw = tổng đơn vị cược thực tế sau khi nhân betCount.
    const betUnitsPerDraw = builtBoards.reduce((sum, b) => sum + b.betCount, 0);
    const amountPerDraw = unitPrice * betUnitsPerDraw;
    const totalAmount = amountPerDraw * drawIds.length;

    const commissionRate = tenantConfig.commissionRate;
    const commissionAmount = Math.round(amountPerDraw * commissionRate);

    // ── 7. Build ticket document ──
    const now = nowVN();
    const { seq, date } = await this.ticketCounter.nextTicketSeq(accountId);
    const ticketNo = buildTicketNo(GameProduct.Keno, date, seq);
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

    // ── 8. Build entry snapshots ──
    // boardSnapshots giữ nguyên fields theo playType — unified cho cả cơ bản và bổ sung.
    const boardSnapshots: EntryBoardSnapshot[] = builtBoards.map((b) => ({
      boardNo: b.boardNo,
      playType: b.playType,
      numbers: b.numbers,
      bet: b.bet,
      betCount: b.betCount,
    }));

    // ── 9. Create entries cho TẤT CẢ draws (all-or-nothing) ──
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
        },
        createdAt: now,
        updatedAt: now,
      });
    }

    // ── 10. Debit player via WAL — ngay trước save để giảm cửa sổ crash ──
    // Ghi WAL (DEBIT_PENDING) → gọi tenant debit → return balance.
    // tx đã generate ở bước 7 và gán vào ticketDoc.tx.
    // Nếu tenant reject (insufficient balance, etc.) → throw AppException (WAL xoá).
    // Nếu tenant unreachable → throw serviceUnavailable (WAL giữ, scheduler xử lý).
    // Nếu WAL insert fail (MongoDB down) → throw serviceUnavailable (chưa debit, an toàn).
    const { balance } = await this.debitService.debit({
      tx,
      tenantId,
      accountId,
      username,
      amount: totalAmount,
      currency: Currency.VND,
      gameId: GameProduct.Keno,
      roundIds: drawIds,
      description: `Đặt cược Keno ${drawCount} kỳ ${drawIds[0]}${drawCount > 1 ? `→${drawIds[drawCount - 1]}` : ""}`,
      metadata: { ticketNo },
    });

    // ── 11. Save ticket + entries atomically ──
    // Nếu crash SAU đây nhưng TRƯỚC markCompleted:
    // Scheduler confirm debit = success → ticket exists → markCompleted (self-heal).
    await this.placeBetStore.saveAtomically(ticketDoc, entryDocs);

    // ── 12. Mark WAL completed ──
    // Nếu crash trước dòng này → scheduler xử lý (ticket exists → markCompleted).
    // Gọi thành công → WAL = COMPLETED → TTL 14 ngày.
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
