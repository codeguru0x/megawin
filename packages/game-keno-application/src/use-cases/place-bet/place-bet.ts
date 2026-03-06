/**
 * Use Case: Place Bet (Keno)
 *
 * Đặt cược Keno với tất cả entries tạo ngay (all-or-nothing):
 *   - Player gửi danh sách drawIds đang mở bán
 *   - Server validate tất cả draws → reject nếu 1 draw không hợp lệ
 *   - Tạo entries cho TẤT CẢ draws ngay lập tức
 *
 * Validation:
 *   - Số dạng string "01"-"80" (zero-padded 2 ký tự)
 *   - boards: mỗi board validate theo play type (pick1-pick10)
 *   - sideBets: validate playType + bet value
 *   - Tất cả drawIds phải đang salesOpen + chưa hết hạn
 */

import { AppException } from "@megawin/shared/errors";
import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus, EntryStatus, TicketStatus } from "@megawin/game-core/entities";
import type {
  BasicBoard,
  SideBet,
  TicketDoc,
  TicketEntryDoc,
  EntryBoardSnapshot,
  EntrySideBetSnapshot,
} from "@megawin/game-keno/entities";
import { KenoPlayType, KENO_SIDE_BET_PLAY_TYPES } from "@megawin/game-keno/entities";
import {
  validateBasicSelection,
  getPlayTypeFromPickCount,
} from "@megawin/game-keno/rules/play-types";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { GetTenantConfigInternalUseCase } from "../tenant-config/get-tenant-config-internal";
import { TicketCounterRepository } from "@megawin/game-core-application/repos";
import { buildTicketNo, GameProduct } from "@megawin/game-core/entities";
import type { PlaceBetInput, PlaceBetOutput } from "./dto/place-bet.dto";
import { nowVN } from "@megawin/shared/utils/date";

export class PlaceBetUseCase extends ApiGatewayUseCase<PlaceBetInput, PlaceBetOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly ticketRepo = new TicketRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly ticketCounter = new TicketCounterRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();
  private readonly getTenantConfig = new GetTenantConfigInternalUseCase();

  protected async execute(input: PlaceBetInput): Promise<PlaceBetOutput> {
    const {
      tenantId,
      accountId,
      username,
      channel,
      drawIds,
      boards: boardInputs,
      sideBets: sideBetInputs,
    } = input;

    // ── 1. Load game config ──
    const globalConfig = await this.getGlobalConfig.run();
    const { play } = globalConfig;

    // ── 2. Validate drawIds ──
    if (drawIds.length === 0 || drawIds.length > play.maxDrawCount) {
      throw AppException.badRequest(`Số kỳ phải từ 1 đến ${play.maxDrawCount}.`);
    }
    if (new Set(drawIds).size !== drawIds.length) {
      throw AppException.badRequest("Danh sách kỳ quay chứa drawId trùng lặp.");
    }

    // ── 3. Validate boards + sideBets ──
    if (boardInputs.length === 0 && sideBetInputs.length === 0) {
      throw AppException.badRequest("Phải có ít nhất 1 board cơ bản hoặc 1 side bet.");
    }

    if (boardInputs.length > play.maxBasicBoardsPerTicket) {
      throw AppException.badRequest(`Số board cơ bản tối đa là ${play.maxBasicBoardsPerTicket}.`);
    }

    const builtBoards: BasicBoard[] = [];
    for (const bi of boardInputs) {
      const playType = getPlayTypeFromPickCount(bi.numbers.length);
      if (!playType) {
        throw AppException.badRequest(
          `Board ${bi.boardNo}: số lượng số ${bi.numbers.length} không hợp lệ (1-10).`,
        );
      }
      const valResult = validateBasicSelection(playType, bi.numbers);
      if (!valResult.valid) {
        throw AppException.badRequest(`Board ${bi.boardNo}: ${valResult.errors.join("; ")}`);
      }

      builtBoards.push({
        boardNo: bi.boardNo,
        playType,
        numbers: [...bi.numbers].sort(),
      });
    }

    const builtSideBets: SideBet[] = [];
    for (const si of sideBetInputs) {
      const pt =
        si.playType === KenoPlayType.BigSmall ? KenoPlayType.BigSmall : KenoPlayType.EvenOdd;

      if (!KENO_SIDE_BET_PLAY_TYPES.includes(pt)) {
        throw AppException.badRequest(`Side bet playType "${si.playType}" không hợp lệ.`);
      }

      builtSideBets.push({
        playType: pt as any,
        bet: si.bet,
      });
    }

    // ── 4. Validate tất cả draws – all-or-nothing ──
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
      if (draw.sales?.closeAt && new Date() >= draw.sales.closeAt) {
        throw AppException.badRequest(`Kỳ quay ${drawId} đã hết thời gian nhận cược.`);
      }
    }

    // ── 5. Load commission rate + tính commission amount ──
    const tenantConfig = await this.getTenantConfig.run({ tenantId });
    const commissionRate = tenantConfig?.commissionRate ?? globalConfig.rates.defaultCommissionRate;

    // ── 6. Calculate pricing ──
    const unitPrice = play.unitPrice;
    const betsPerDraw = builtBoards.length + builtSideBets.length;
    const amountPerDraw = unitPrice * betsPerDraw;
    const totalAmount = amountPerDraw * drawIds.length;
    const commissionAmount = Math.round(amountPerDraw * commissionRate);

    // ── 7. Build ticket document ──
    const now = nowVN();
    const { seq, date } = await this.ticketCounter.nextTicketSeq(accountId);
    const ticketNo = buildTicketNo(GameProduct.Keno, date, seq);
    const drawCount = drawIds.length;

    const ticketDoc: Omit<TicketDoc, "_id"> = {
      tenantId,
      accountId,
      username,
      ticketNo,
      channel,
      drawPlan: {
        drawIds,
        drawCount,
      },
      pricing: {
        unitPrice,
        betsPerDraw,
        amountPerDraw,
        totalAmount,
      },
      tenant: { commissionRate },
      boards: builtBoards,
      sideBets: builtSideBets,
      progress: {
        totalDraws: drawCount,
        settledDraws: 0,
      },
      status: TicketStatus.Paid as any,
      version: 0,
      createdAt: now,
      updatedAt: now,
    };

    // ── 8. Insert ticket ──
    const ticketId = await this.ticketRepo.insertOne(ticketDoc as any);

    // ── 9. Create entries cho TẤT CẢ draws (all-or-nothing) ──
    const boardSnapshots: EntryBoardSnapshot[] = builtBoards.map((b) => ({
      boardNo: b.boardNo,
      playType: b.playType,
      numbers: b.numbers,
    }));

    const sideBetSnapshots: EntrySideBetSnapshot[] = builtSideBets.map((s) => ({
      playType: s.playType,
      bet: s.bet,
    }));

    const entryDocs: Array<Omit<TicketEntryDoc, "_id" | "version">> = [];

    for (const drawId of drawIds) {
      const draw = drawMap.get(drawId)!;
      entryDocs.push({
        tenantId,
        accountId,
        username,
        ticketId,
        drawId: draw.drawId,
        drawDate: draw.drawDate,
        financialDate: draw.financialDate,
        tenant: { commissionRate, commissionAmount },
        status: EntryStatus.Scheduled,
        betCount: betsPerDraw,
        amount: amountPerDraw,
        unitPrice,
        entrySummary: {
          ticketNo,
          boards: boardSnapshots,
          sideBets: sideBetSnapshots,
        },
        createdAt: now,
        updatedAt: now,
      });
    }

    try {
      await this.entryRepo.insertEntries(entryDocs);
    } catch (err) {
      throw AppException.internal(
        "Không thể tạo entries cho các kỳ quay đã chọn. Vui lòng thử lại.",
      );
    }

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
        betsPerDraw,
        amountPerDraw,
        totalAmount,
      },
      boardCount: builtBoards.length,
      sideBetCount: builtSideBets.length,
      entryCount: drawCount,
    };
  }
}
