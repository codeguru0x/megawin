/**
 * Use Case: Place Bet (Power 6/55)
 *
 * Tạo vé cược cho player. Validate boards, draws, tính giá, tạo ticket + entries.
 *
 * Power 6/55 differences from Lotto 5/35:
 *   - Chỉ có mainNumbers (không có specialNumbers/bonus)
 *   - PlayTypes: Standard (6 số), Bao5 (5 số → 50 lines), Bao7-Bao18 (C(N,6) lines)
 *   - Numbers range: 1-55
 *   - Ticket prefix: "P655"
 *   - 1 kỳ/ngày, quay thứ 3/5/7
 *
 * Flow:
 *   1. Load global config
 *   2. Validate drawIds (đang mở bán, chưa hết hạn)
 *   3. Validate boards (playType, selection, number ranges)
 *   4. Calculate pricing (unitPrice × lines × draws)
 *   5. Load tenant commission
 *   6. Build ticket document
 *   7. Create entries cho tất cả draws (all-or-nothing)
 */

import { AppException } from "@megawin/shared/errors";
import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus, EntryStatus, TicketStatus } from "@megawin/game-core/entities";
import type {
  Board,
  TicketDoc,
  TicketEntryDoc,
  EntrySummary,
} from "@megawin/game-power655/entities";
import { PlayType } from "@megawin/game-power655/entities";
import { getLineCount } from "@megawin/game-power655/rules/play-types";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { PlaceBetStore } from "../../infras/repos/place-bet-store";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { GetTenantConfigInternalUseCase } from "../tenant-config/get-tenant-config-internal";
import { TicketCounterRepository } from "@megawin/game-core-application/repos";
import { buildTicketNo, GameProduct } from "@megawin/game-core/entities";
import { getFinancialDate } from "@megawin/shared/utils/financial-date";
import type { PlaceBetInput, PlaceBetOutput } from "./dto/place-bet.dto";
import { nowVN } from "@megawin/shared/utils/date";
import { newObjectId } from "@megawin/data/mongo";

/**
 * Tạo vé cược Power 6/55.
 * Validate boards/draws, tính giá, tạo ticket + entries (all-or-nothing).
 */
export class PlaceBetUseCase extends ApiGatewayUseCase<PlaceBetInput, PlaceBetOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly placeBetStore = new PlaceBetStore();
  private readonly ticketCounter = new TicketCounterRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();
  private readonly getTenantConfig = new GetTenantConfigInternalUseCase();

  /** @inheritdoc */
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

    // ── 2. Validate drawIds ──
    if (drawIds.length === 0 || drawIds.length > play.maxDrawCount) {
      throw AppException.badRequest(`Số kỳ phải từ 1 đến ${play.maxDrawCount}.`);
    }

    // ── 3. Validate boards ──
    if (boardInputs.length === 0 || boardInputs.length > play.maxBoardsPerTicket) {
      throw AppException.badRequest(`Số board phải từ 1 đến ${play.maxBoardsPerTicket}.`);
    }

    // Validate betCount nằm trong khoảng [minBetCount, maxBetCount]
    const minBetCount = play.minBetCount ?? 1;
    const maxBetCount = play.maxBetCount ?? 10;
    for (const bi of boardInputs) {
      const bc = bi.betCount ?? 1;
      if (bc < minBetCount || bc > maxBetCount) {
        throw AppException.badRequest(
          `betCount ${bc} của board ${bi.boardNo} phải nằm trong khoảng [${minBetCount}, ${maxBetCount}].`,
        );
      }
    }

    const builtBoards: Board[] = [];
    let totalLinesPerDraw = 0;
    let betUnitsPerDraw = 0;

    for (const bi of boardInputs) {
      const playType = bi.playType as PlayType;

      const lineCount = getLineCount(playType);
      const betCount = bi.betCount ?? 1;
      totalLinesPerDraw += lineCount;
      // betUnitsPerDraw = Σ(expandedLines × betCount) — đơn vị cược thực tế tính tiền
      betUnitsPerDraw += lineCount * betCount;

      builtBoards.push({
        boardNo: bi.boardNo as any,
        playType,
        selection: {
          mainNumbers: [...bi.selection.mainNumbers].sort(),
        },
        derived: { expandedLines: lineCount },
        betCount,
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
    // Tiền cược = betUnitsPerDraw × unitPrice (không phải linesPerDraw × unitPrice)
    const amountPerDraw = unitPrice * betUnitsPerDraw;
    const totalAmount = amountPerDraw * drawCount;

    // ── 6. Load tenant commission rate ──
    const tenantConfig = await this.getTenantConfig.run({ tenantId });
    if (!tenantConfig || tenantConfig.isEnabled !== true) {
      throw AppException.unauthorized("Không được phép chơi game. Vui lòng liên hệ admin.");
    }

    const commissionRate = tenantConfig.commissionRate;
    // commissionAmount tính sẵn lúc place-bet: snapshot cứng, không thay đổi dù rate update sau.
    const commissionAmount = Math.round(amountPerDraw * commissionRate);

    // ── 7. Build ticket document ──
    const { seq, date } = await this.ticketCounter.nextTicketSeq(accountId);
    const ticketNo = buildTicketNo(GameProduct.Power655, date, seq);

    const ticketId = newObjectId();
    const ticketDoc: TicketDoc = {
      _id: ticketId,
      ticketNo,
      tenantId,
      accountId,
      username,
      channel,
      ipAddress,
      boards: builtBoards,
      pricing: {
        unitPrice,
        linesPerDraw: totalLinesPerDraw,
        betUnitsPerDraw,
        amountPerDraw,
        totalAmount,
      },
      lineCount: totalLinesPerDraw,
      drawPlan: {
        drawIds,
        drawCount,
      },
      progress: {
        totalDraws: drawCount,
        settledDraws: 0,
      },
      financialDate: getFinancialDate(now),
      status: TicketStatus.Paid as any,
      version: 0,
      createdAt: now,
      updatedAt: now,
    };

    // ── 8. Insert ticket + entries ──

    // ── 9. Create entries cho TẤT CẢ draws (all-or-nothing) ──
    const entrySummary: EntrySummary = {
      ticketNo,
      boards: builtBoards.map((b) => ({
        boardNo: String(b.boardNo),
        playType: b.playType,
        mainNumbers: b.selection.mainNumbers,
        expandedLines: b.derived.expandedLines,
        betCount: b.betCount ?? 1,
      })),
    };

    const entryDocs: Array<Omit<TicketEntryDoc, "_id" | "version">> = [];

    for (let i = 0; i < drawIds.length; i++) {
      const draw = drawMap.get(drawIds[i]!)!;

      entryDocs.push({
        ticketId,
        tenantId,
        accountId,
        username,
        ipAddress,
        drawId: draw.drawId,
        financialDate: draw.financialDate,
        tenant: { commissionRate, commissionAmount },
        status: EntryStatus.Scheduled as any,
        lineCount: totalLinesPerDraw,
        betUnitCount: betUnitsPerDraw,
        amount: amountPerDraw,
        unitPrice,
        entrySummary,
        createdAt: now,
        updatedAt: now,
      });
    }

    await this.placeBetStore.saveAtomically(ticketDoc, entryDocs as any[]);

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
        betUnitsPerDraw,
        amountPerDraw,
        totalAmount,
      },
      boardCount: builtBoards.length,
      entryCount: drawCount,
    };
  }
}
