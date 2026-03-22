/**
 * Use Case: Place Bet (Max 3D Pro)
 *
 * Đặt cược Max 3D Pro: validate boards → validate draws → tính giá → tạo ticket + entries.
 *
 * Max 3D Pro khác Max 3D:
 * - Mỗi board có playMode (multiNumber/multiDigit) và playType (straight)
 * - Selection tạo ra các cặp (pairs) hai bộ ba số thay vì single triplets
 * - multiNumber: chọn 3-20 bộ ba số, hệ thống tạo P(n,2) = n×(n-1) ordered pairs
 * - multiDigit: chọn 3 chữ số đầu + 3 chữ số sau, hệ thống expand hoán vị (Cartesian product)
 * - Tối đa 4 boards (A-D), tối đa 6 kỳ
 * - betCount: số lần cược nhân bội per board (≥ 1). Tiền cược = lineCount × betCount × unitPrice.
 */

import { AppException } from "@megawin/shared/errors";
import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus, EntryStatus, TicketStatus } from "@megawin/game-core/entities";
import type {
  Board,
  TicketDoc,
  TicketEntryDoc,
  EntryBoardSnapshot,
} from "@megawin/game-max3dpro/entities";
import { calculateLineCount } from "@megawin/game-max3dpro/rules/play-types";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { PlaceBetStore } from "../../infras/repos/place-bet-store";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { GetTenantConfigInternalUseCase } from "../tenant-config/get-tenant-config-internal";
import { TicketCounterRepository } from "@megawin/game-core-application/repos";
import { buildTicketNo, GameProduct } from "@megawin/game-core/entities";
import type { PlaceBetInput, PlaceBetOutput } from "./dto/place-bet.dto";
import { nowVN } from "@megawin/shared/utils/date";
import { getFinancialDate } from "@megawin/shared/utils/financial-date";
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

    // ── 2. Validate draws count vs config (config có thể thay đổi sau khi Zod validate) ──
    if (drawIds.length > play.maxDrawCount) {
      throw AppException.badRequest(`Số kỳ phải từ 1 đến ${play.maxDrawCount}.`);
    }

    // ── 3. Build boards — validate business logic (multiNumber/multiDigit constraints) ──
    if (boardInputs.length > play.maxBoardsPerTicket) {
      throw AppException.badRequest(`Số board phải từ 1 đến ${play.maxBoardsPerTicket}.`);
    }

    const builtBoards: Board[] = [];
    let totalLinesPerDraw = 0;
    let totalBetUnitsPerDraw = 0;

    for (const bi of boardInputs) {
      // Fallback sang 1 cho safety — Zod .default(1) đã xử lý, nhưng phòng thủ extra cho direct calls.
      const betCount = bi.betCount ?? 1;

      if (betCount < play.minBetCount) {
        throw AppException.badRequest(
          `Board ${bi.boardNo}: betCount ${betCount} nhỏ hơn tối thiểu ${play.minBetCount}.`,
        );
      }

      if (betCount > play.maxBetCount) {
        throw AppException.badRequest(
          `Board ${bi.boardNo}: betCount ${betCount} vượt quá giới hạn ${play.maxBetCount}.`,
        );
      }

      const lineCount = calculateLineCount(bi.playMode, bi.selection);
      totalLinesPerDraw += lineCount;
      // betUnitCount per board = lineCount × betCount — tổng lần cược thực tế tham gia dự thưởng.
      totalBetUnitsPerDraw += lineCount * betCount;

      builtBoards.push({
        boardNo: bi.boardNo,
        playMode: bi.playMode,
        playType: bi.playType,
        selection: {
          triplets: bi.selection.triplets,
          frontDigits: bi.selection.frontDigits,
          backDigits: bi.selection.backDigits,
        },
        derived: {
          lineCount,
          betCount,
        },
      });
    }

    // ── 4. Validate tất cả draws – all-or-nothing ──
    const now = nowVN();
    const draws = await this.drawRepo.getDrawsByIds(drawIds);

    const drawMap = new Map(draws.map((d) => [d.drawId, d]));

    for (const drawId of drawIds) {
      const draw = drawMap.get(drawId);

      if (!draw) {
        throw AppException.badRequest(`Kỳ quay ${drawId} không tồn tại.`);
      }

      if (draw.status !== DrawStatus.SalesOpen) {
        throw AppException.badRequest(
          `Kỳ quay ${drawId} không đang mở bán (status: ${draw.status}).`,
        );
      }

      if (now >= draw.sales.closeAt) {
        throw AppException.badRequest(`Kỳ quay ${drawId} đã hết thời gian nhận cược.`);
      }
    }

    // ── 5. Calculate pricing ──
    const drawCount = drawIds.length;
    const unitPrice = play.unitPrice;
    // amountPerDraw = betUnitsPerDraw × unitPrice (mỗi "bet unit" = 1 pair × 1 lần cược).
    const amountPerDraw = unitPrice * totalBetUnitsPerDraw;
    const totalAmount = amountPerDraw * drawCount;

    // ── 6. Load tenant commission rate ──
    const tenantConfig = await this.getTenantConfig.run({ tenantId });

    if (!tenantConfig || tenantConfig.isEnabled !== true) {
      throw AppException.unauthorized("Không được phép chơi game. Vui lòng liên hệ admin.");
    }

    const commissionRate = tenantConfig.commissionRate;
    const commissionAmount = Math.round(amountPerDraw * commissionRate);

    // ── 7. Build ticket document ──
    const { seq, date } = await this.ticketCounter.nextTicketSeq(accountId);
    const ticketNo = buildTicketNo(GameProduct.Max3dpro, date, seq);

    // ticketId sinh client-side → entries có thể nhúng ticketId trước khi insert.
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
        linesPerDraw: totalLinesPerDraw,
        betUnitsPerDraw: totalBetUnitsPerDraw,
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

    // ── 8. Build entry documents — ticketId đã biết trước, không cần đợi insert ticket ──
    const boardSnapshots: EntryBoardSnapshot[] = builtBoards.map((b) => ({
      boardNo: b.boardNo,
      playMode: b.playMode,
      playType: b.playType,
      triplets: b.selection.triplets,
      frontDigits: b.selection.frontDigits,
      backDigits: b.selection.backDigits,
      lineCount: b.derived.lineCount,
      betCount: b.derived.betCount,
    }));

    const entryDocs: Array<Omit<TicketEntryDoc, "_id" | "version">> = drawIds.map((drawId) => {
      const draw = drawMap.get(drawId)!;
      return {
        tenantId,
        accountId,
        username,
        ipAddress,
        ticketId,
        drawId: draw.drawId,
        financialDate: draw.financialDate,
        tenant: { commissionRate, commissionAmount },
        status: EntryStatus.Scheduled,
        lineCount: totalLinesPerDraw,
        betUnitCount: totalBetUnitsPerDraw,
        amount: amountPerDraw,
        unitPrice,
        entrySummary: {
          ticketNo,
          boards: boardSnapshots,
        },
        createdAt: now,
        updatedAt: now,
      };
    });

    // ── 9. Insert ticket + entries trong 1 transaction (atomic) ──
    // ticketId sinh client-side → entries đã có sẵn ticketId trước khi insert.
    // Nếu bất kỳ insert nào fail → cả 2 collections đều rollback.
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
        linesPerDraw: totalLinesPerDraw,
        betUnitsPerDraw: totalBetUnitsPerDraw,
        amountPerDraw,
        totalAmount,
      },
      boardCount: builtBoards.length,
      entryCount: drawCount,
    };
  }
}
