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
import { TicketCounterRepository } from "@megawin/game-core-application/repos";
import { DebitPlayerService, type DebitPlayerInput } from "@megawin/game-core-application/services";
import { buildTicketNo, DrawStatus, EntryStatus, GameProduct, TicketStatus } from "@megawin/game-core/entities";
import {
  KENO_BASIC_PLAY_TYPE_SET,
  type Board,
  type DrawEntity,
  type EntryBoardSnapshot,
  type TicketDoc,
  type TicketEntryDoc,
} from "@megawin/game-keno/entities";
import { getPlayTypeFromPickCount } from "@megawin/game-keno/rules";
import { APP_ERROR_CODES, AppException } from "@megawin/shared/errors";
import { Currency } from "@megawin/shared/types";
import { getFinancialDate, nowVN } from "@megawin/shared/utils";
import { ObjectId } from "mongodb";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { PlaceBetStore } from "../../infras/repos/place-bet-store";
import { TicketRepository } from "../../infras/repos/ticket-repo";
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
  private readonly ticketRepo = new TicketRepository();

  protected async execute(input: PlaceBetInput): Promise<PlaceBetOutput> {
    const { tenantId, accountId, username, channel, ipAddress, idempotencyKey, drawIds, boards: boardInputs } = input;

    // ── 1. Load game config ──
    const globalConfig = await this.getGlobalConfig.run();
    const { play } = globalConfig;

    // ── 2. Validate tenant ──
    const tenantConfig = await this.getTenantConfig.run({ tenantId });
    if (tenantConfig?.isEnabled !== true) {
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
      const bc = bi.betCount;

      if (bc < minBetCount || bc > maxBetCount) {
        throw AppException.badRequest(
          `betCount ${bc} của board ${bi.boardNo} phải nằm trong [${minBetCount}, ${maxBetCount}].`,
        );
      }
    }

    // ── 4. Build boards (unified: cơ bản + bổ sung) ──
    const builtBoards: Board[] = boardInputs.map((bi) => {
      if (KENO_BASIC_PLAY_TYPE_SET.has(bi.playType)) {
        // Cơ bản (pick1-pick10): playType xác định từ số lượng số chọn.
        // Zod đã đảm bảo numbers tồn tại và đúng length ∈ [1,10] — check lại để
        // narrow type (không dùng `!`) và reject nếu caller bỏ qua Zod.
        const { numbers } = bi;
        if (numbers == null) {
          throw AppException.badRequest(`Board ${bi.boardNo} thiếu danh sách số.`);
        }
        const playType = getPlayTypeFromPickCount(numbers.length);
        return {
          boardNo: bi.boardNo,
          playType,
          numbers: [...numbers].sort(),
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
    // nowVN() 1 lần: so sánh closeAt + timestamp ticket/entry dùng cùng instant.
    // DrawSales.closeAt là Date bắt buộc (DrawDoc.sales: DrawSales) — không optional-chain.
    const now = nowVN();
    const draws = await this.drawRepo.getDrawsByIds(drawIds);
    const drawMap = new Map(draws.map((d) => [d.drawId, d]));
    const validatedDraws: DrawEntity[] = [];

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

      validatedDraws.push(draw);
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
    const { seq, date } = await this.ticketCounter.nextTicketSeq(accountId);
    const ticketNo = buildTicketNo(GameProduct.Keno, date, seq);
    const drawCount = drawIds.length;

    // tx từ Idempotency-Key: cùng input → cùng tx, unique WAL chặn trùng.
    const tx = this.debitService.deriveTx(accountId, idempotencyKey);

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

    for (const draw of validatedDraws) {
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
    // tx đã derive ở bước build ticket và gán vào ticketDoc.tx.
    // Nếu tenant reject (insufficient balance, etc.) → throw AppException (WAL xoá).
    // Nếu tenant unreachable → throw serviceUnavailable (WAL giữ, scheduler xử lý).
    // Nếu WAL insert trùng `{tx}` (11000) → IDEMPOTENCY_CONFLICT → đọc phase (COMPLETED replay / còn lại 409).
    // Nếu WAL insert fail khác (MongoDB down) → throw serviceUnavailable (chưa debit, an toàn).
    const debitInput = {
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
    };

    let balance: number;
    try {
      const result = await this.debitService.debit(debitInput);
      balance = result.balance;
    } catch (error) {
      if (!(error instanceof AppException) || error.code !== APP_ERROR_CODES.IDEMPOTENCY_CONFLICT) {
        throw error;
      }
      return await this.replayCompletedBet(tx, debitInput);
    }

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

  /**
   * Replay place-bet khi WAL đã COMPLETED — `replayCompletedDebit` đã xử lý phần
   * "được replay không" (throw 409 nếu không), ở đây chỉ còn lấy vé cũ theo `tx`
   * để build lại đúng response ban đầu.
   */
  private async replayCompletedBet(tx: string, debitInput: DebitPlayerInput): Promise<PlaceBetOutput> {
    const { balance } = await this.debitService.replayCompletedDebit(debitInput);

    const ticket = await this.ticketRepo.findByTx(tx);
    if (!ticket) {
      throw new AppException(APP_ERROR_CODES.IDEMPOTENCY_CONFLICT, "Không tìm thấy vé của giao dịch trước.");
    }

    return {
      ticketId: ticket.id,
      ticketNo: ticket.ticketNo,
      status: ticket.status,
      balance,
      drawPlan: ticket.drawPlan,
      pricing: ticket.pricing,
      boardCount: ticket.boards.length,
      entryCount: ticket.drawPlan.drawCount,
    };
  }
}
