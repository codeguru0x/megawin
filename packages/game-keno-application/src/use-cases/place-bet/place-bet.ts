/**
 * Use Case: Place Bet (Keno)
 *
 * Đặt cược Keno với tất cả entries tạo ngay (all-or-nothing):
 *   - Player gửi danh sách drawIds đang mở bán
 *   - Server validate tất cả draws → reject nếu 1 draw không hợp lệ
 *   - Tạo entries cho TẤT CẢ draws ngay lập tức
 *
 * boards[] chứa cả cơ bản (pick1-pick10) và bổ sung (bigSmall/evenOdd),
 * phân biệt qua playType. Validation chi tiết ở Zod handler (discriminated union).
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
} from "@megawin/game-keno/entities";
import { KENO_BASIC_PLAY_TYPE_SET } from "@megawin/game-keno/entities";
import { getPlayTypeFromPickCount } from "@megawin/game-keno/rules";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { PlaceBetStore } from "../../infras/repos/place-bet-store";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { GetTenantConfigInternalUseCase } from "../tenant-config/get-tenant-config-internal";
import { TicketCounterRepository } from "@megawin/game-core-application/repos";
import { buildTicketNo, GameProduct } from "@megawin/game-core/entities";
import type { PlaceBetInput, PlaceBetOutput } from "./dto/place-bet.dto";
import { nowVN, getFinancialDate } from "@megawin/shared/utils";
import { ObjectId } from "mongodb";

export class PlaceBetUseCase extends ApiGatewayUseCase<PlaceBetInput, PlaceBetOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly placeBetStore = new PlaceBetStore();
  private readonly ticketCounter = new TicketCounterRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();
  private readonly getTenantConfig = new GetTenantConfigInternalUseCase();

  protected async execute(input: PlaceBetInput): Promise<PlaceBetOutput> {
    const {
      tenantId,
      accountId,
      username,
      channel,
      ipAddress,
      drawIds,
      boards: boardInputs,
    } = input;

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

    await this.placeBetStore.saveAtomically(ticketDoc, entryDocs);

    return {
      ticketId,
      ticketNo,
      status: TicketStatus.Paid,
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
