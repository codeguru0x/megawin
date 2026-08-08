/**
 * Lotto 5/35 – Detect Resettle Boundaries Use Case
 *
 * Pre-flight phân loại TYPE_A / TYPE_B1 / TYPE_B2 / LEDGER_MISSING.
 * Split-affected xử lý như JP-winner-affected (jpOrSplitAffected).
 *
 * ── Quy tắc cascade (QUAN TRỌNG cho Lotto 5/35) ───────────────────────────────
 * Split phụ thuộc pool: `opening(K) = closing(K-1)`, split khi
 * `drawNo === Evening && opening >= splitThreshold && !hasJpWinner`.
 *
 * Khi sửa kết quả kỳ T, `closing(T)` gần như luôn đổi (contribution đổi theo số
 * vé trúng tier), kéo opening toàn chain đổi dây chuyền → một kỳ Evening trong
 * chain có thể vượt/tụt ngưỡng split DÙ số quay của nó không đổi (split "chuyển
 * kỳ"). Không thể tiền-kiểm `closing(T)` mới mà không re-settle.
 *
 * → Nếu kỳ T CÓ chain (`chainLength > 0`) ⇒ LUÔN TYPE_B2, cascade tuần tự để
 *   re-settle tính lại opening/split đúng cho từng kỳ. `jpOrSplitAffected` chỉ còn
 *   phân biệt TYPE_A vs TYPE_B1 khi chain RỖNG.
 *
 * ── Chain XUYÊN CYCLE (cross-cycle B2) ───────────────────────────────────────
 * Chain phát hiện qua `findSettledChainAfterDraw(drawId)` — mọi kỳ settle SAU T
 * theo thời gian, BẤT KỂ cycleNo. Khi kỳ T từng ĐÓNG cycle (hasJpWinner HOẶC
 * didSplit) và kết quả mới GỠ trạng thái đóng đó, các kỳ đã kết sổ ở cycle KẾ nằm
 * trong chain này → cùng vào TYPE_B2, resettle tuần tự T→T+1→…→T+n. DBA tái cấu
 * trúc cycle metadata (đóng/mở/gộp cycleNo) giữa mỗi bước dựa trên ledger; worker
 * chỉ chạy lại entries (skipCycleUpdate=true). KHÔNG còn scenario CHẶN riêng.
 *
 * ── Case table ───────────────────────────────────────────────────────────────
 * | Kỳ T (sau re-match) | Chain sau T (theo drawId) | Scenario |
 * |---|---|---|
 * | Không JP/split mới & cũ cũng roll-over | rỗng | TYPE_A |
 * | Có/gỡ JP winner HOẶC split | rỗng | TYPE_B1 |
 * | Bất kỳ | không rỗng (kể cả xuyên cycle) | TYPE_B2 |
 * | Ledger entry T null | — | LEDGER_MISSING |
 */

import { NextApiUseCase } from "@megawin/next/server";
import { InternalUseCase, AppException } from "@megawin/app-core/use-cases";
import { EntryStatus } from "@megawin/game-core/entities";
import { DrawNo } from "@megawin/game-lotto535/entities";
import { ResettleScenario } from "@megawin/game-lotto535/rules";
import type { ResettleScenario as ResettleScenarioType } from "@megawin/game-lotto535/rules";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { JackpotCycleEntryRepository } from "../../infras/repos/jackpot-cycle-entry-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";

export interface DetectResettleBoundariesInput {
  drawId: string;
  proposedWinningMain: string[];
  proposedWinningSpecial: string;
}

export interface DetectResettleBoundariesOutput {
  drawId: string;
  scenario: ResettleScenarioType;
  message: string;
  hasNewJpWinner: boolean;
  hadOldJpWinner: boolean;
  /** Kết quả mới có kích hoạt split cycle (Evening + opening >= threshold, không JP). */
  newWouldSplit: boolean;
  /** Kỳ cũ đã thực hiện split (`ledger.didSplit`). */
  hadOldSplit: boolean;
  /** Số kỳ đã settle SAU T (theo `drawId`, xuyên cycle) — chain B2. */
  chainLength: number;
  /** `drawId` kỳ cuối trong chain (xa T nhất theo thời gian). */
  lastAffectedDrawId?: string;
  /** Danh sách `drawId` cần resettle tuần tự: `[T, ...chain]`, sort `drawId` ASC (xuyên cycle). */
  chainDrawIds?: string[];
}

export class DetectResettleBoundariesInternalUseCase extends InternalUseCase<
  DetectResettleBoundariesInput,
  DetectResettleBoundariesOutput
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly cycleEntryRepo = new JackpotCycleEntryRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(input: DetectResettleBoundariesInput): Promise<DetectResettleBoundariesOutput> {
    const { drawId, proposedWinningMain, proposedWinningSpecial } = input;

    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${drawId} không tồn tại.`);
    }

    if (!draw.settledAt) {
      throw AppException.businessRuleViolation(`Kỳ quay ${drawId} chưa từng settle — không cần resettle.`);
    }

    const ledgerEntry = await this.cycleEntryRepo.findByDraw(drawId);
    if (!ledgerEntry) {
      return {
        drawId,
        scenario: ResettleScenario.LEDGER_MISSING,
        message: `Kỳ ${drawId} không có ledger entry dù đã settled. Liên hệ đội kỹ thuật.`,
        hasNewJpWinner: false,
        hadOldJpWinner: false,
        newWouldSplit: false,
        hadOldSplit: false,
        chainLength: 0,
      };
    }

    const globalConfig = await this.getGlobalConfig.run();
    const splitThreshold = globalConfig?.jackpot.splitThreshold;

    // Re-match JP winner (5 main + special) với kết quả MỚI đề xuất — match theo
    // selection vé (`entrySummary.boards`, bất biến từ lúc đặt cược), KHÔNG phụ
    // thuộc payout/outcome đã settle.
    //
    // Quét CẢ `Settled` LẪN `Scheduled` — CÓ CHỦ ĐÍCH, không nhầm:
    //   - Pre-flight (DBA gọi qua BO API trước khi resettle): entries còn ở
    //     `Settled` → match `Settled`.
    //   - Re-detect trong trigger-resettle khi RETRY (draw đã `Settling`): phiên
    //     trước đã chạy PrepareResettle → `resetEntriesForResettle` đưa entries về
    //     `Scheduled` (xoá payout/outcome/result). Nếu chỉ match `Settled` sẽ bỏ
    //     sót toàn bộ entries → hasNewJpWinner=false SAI → phân loại scenario sai
    //     (TYPE_A thay vì TYPE_B1).
    // Các status khác (Cancelled/Voided/Pending) bị loại đúng — vé huỷ/void không
    // tính là winner. Đồng bộ với Power 6/55 `detectNewJpWinner`.
    const hasNewJpWinner = await this.entryRepo.existsJpWinnerForDraw(
      drawId,
      proposedWinningMain,
      proposedWinningSpecial,
      [EntryStatus.Settled, EntryStatus.Scheduled],
    );

    const hadOldJpWinner = ledgerEntry.hasJpWinner;
    const hadOldSplit = ledgerEntry.didSplit;

    const newWouldSplit = draw.drawNo === DrawNo.Evening && ledgerEntry.opening >= splitThreshold && !hasNewJpWinner;

    const jpOrSplitAffected = hasNewJpWinner || hadOldJpWinner || newWouldSplit || hadOldSplit;

    // Chain XUYÊN CYCLE: mọi kỳ settle SAU T theo thời gian (drawId), bất kể cycleNo.
    // Bắt trọn cả kỳ ở cycle kế khi T từng đóng cycle (hasJpWinner/didSplit) và kết
    // quả mới gỡ trạng thái đóng đó → các kỳ đó cùng vào B2 cascade.
    const chain = await this.cycleEntryRepo.findSettledChainAfterDraw(drawId);
    const chainLength = chain.length;
    const lastAffectedDrawId = chainLength > 0 ? chain[chain.length - 1]!.drawId : undefined;
    const chainHasWinnerOrSplit = chain.some((e) => e.hasJpWinner || e.didSplit);

    // ── Cascade khi có chain: LUÔN TYPE_B2 (kể cả xuyên cycle) ────────────────
    // Split Lotto 5/35 phụ thuộc `opening = closing(kỳ trước)`. Sửa kết quả kỳ T
    // gần như luôn đổi `closing(T)` (contribution đổi theo số vé trúng tier),
    // kéo theo opening toàn chain đổi dây chuyền → split CÓ THỂ chuyển kỳ (một kỳ
    // Evening vượt/tụt ngưỡng dù số quay không đổi). Không thể tiền-kiểm closing(T)
    // mới mà không re-settle, nên mọi heuristic buffer đều rủi ro biên.
    // → Có chain (theo drawId, xuyên cycle) = bắt buộc cascade tuần tự để tính lại
    // split đúng. DBA tái cấu trúc cycle metadata giữa mỗi bước (đóng/mở/gộp cycleNo).
    // jpOrSplitAffected chỉ còn dùng phân biệt TYPE_A vs TYPE_B1 khi chain rỗng.
    if (chainLength > 0) {
      const chainDrawIds = [drawId, ...chain.map((e) => e.drawId)];
      return {
        drawId,
        scenario: ResettleScenario.TYPE_B2,
        message: buildB2Message(
          drawId,
          hasNewJpWinner,
          hadOldJpWinner,
          newWouldSplit,
          hadOldSplit,
          chainLength,
          chainHasWinnerOrSplit,
        ),
        hasNewJpWinner,
        hadOldJpWinner,
        newWouldSplit,
        hadOldSplit,
        chainLength,
        lastAffectedDrawId,
        chainDrawIds,
      };
    }

    // Tới đây chainLength === 0 (nhánh chain > 0 đã return ở trên).
    // Không có kỳ settle sau T (kể cả xuyên cycle) → chỉ kỳ T bị ảnh hưởng.

    if (jpOrSplitAffected) {
      return {
        drawId,
        scenario: ResettleScenario.TYPE_B1,
        message: buildB1Message(drawId, hasNewJpWinner, hadOldJpWinner, newWouldSplit, hadOldSplit),
        hasNewJpWinner,
        hadOldJpWinner,
        newWouldSplit,
        hadOldSplit,
        chainLength: 0,
      };
    }

    return {
      drawId,
      scenario: ResettleScenario.TYPE_A,
      message: `Kết quả mới không thay đổi Jackpot/Split state (cũ & mới đều roll-over) và không có kỳ settle sau. Có thể resettle tự động.`,
      hasNewJpWinner,
      hadOldJpWinner,
      newWouldSplit,
      hadOldSplit,
      chainLength: 0,
    };
  }
}

export class DetectResettleBoundariesUseCase extends NextApiUseCase<
  DetectResettleBoundariesInput,
  DetectResettleBoundariesOutput
> {
  private readonly internal = new DetectResettleBoundariesInternalUseCase();

  protected async execute(input: DetectResettleBoundariesInput): Promise<DetectResettleBoundariesOutput> {
    return this.internal.run(input);
  }
}

function buildB1Message(
  drawId: string,
  hasNewJpWinner: boolean,
  hadOldJpWinner: boolean,
  newWouldSplit: boolean,
  hadOldSplit: boolean,
): string {
  const parts: string[] = [];
  if (hasNewJpWinner && !hadOldJpWinner) {
    parts.push(`Kết quả mới phát sinh người trúng Jackpot tại kỳ ${drawId}`);
  } else if (!hasNewJpWinner && hadOldJpWinner) {
    parts.push(`Kết quả mới gỡ bỏ người trúng Jackpot cũ tại kỳ ${drawId}`);
  } else if (newWouldSplit && !hadOldSplit) {
    parts.push(`Kết quả mới kích hoạt Split Cycle tại kỳ ${drawId}`);
  } else if (!newWouldSplit && hadOldSplit) {
    parts.push(`Kết quả mới gỡ bỏ Split Cycle cũ tại kỳ ${drawId}`);
  } else {
    parts.push(`Kết quả mới thay đổi trạng thái Jackpot/Split tại kỳ ${drawId}`);
  }
  parts.push(
    "Payout reversal tự động, nhưng BẮT BUỘC Quản trị hệ thống cập nhật jackpot cycle thủ công sau re-settle.",
  );
  return parts.join(". ");
}

function buildB2Message(
  drawId: string,
  hasNewJpWinner: boolean,
  hadOldJpWinner: boolean,
  newWouldSplit: boolean,
  hadOldSplit: boolean,
  chainLength: number,
  chainHasWinnerOrSplit: boolean,
): string {
  const parts: string[] = [`Kỳ ${drawId} cần resettle cascade (TYPE_B2).`];
  if (hasNewJpWinner || hadOldJpWinner) {
    parts.push("Thay đổi liên quan Jackpot winner.");
  }
  if (newWouldSplit || hadOldSplit) {
    parts.push("Thay đổi liên quan Split Cycle.");
  }
  if (chainLength > 0) {
    parts.push(`Có ${chainLength} kỳ settle sau (theo thời gian, có thể tồn tại qua nhiều cycle).`);
  }
  if (chainHasWinnerOrSplit) {
    parts.push("Chain sau có winner hoặc split — pool/split cần tính lại.");
  }
  // Cascade thuần do lan truyền pool: kỳ T không đổi winner/split nhưng vẫn có chain.
  // Sửa kết quả đổi contribution → closing(T) đổi → opening chain đổi → split có thể
  // chuyển kỳ. Phải cascade dù chain hiện chưa winner/split.
  if (!hasNewJpWinner && !hadOldJpWinner && !newWouldSplit && !hadOldSplit) {
    parts.push(
      "Kết quả mới đổi contribution kỳ này → opening các kỳ sau đổi dây chuyền, Split có thể chuyển kỳ — bắt buộc cascade để tính lại.",
    );
  }
  parts.push("Resettle tuần tự từng kỳ; Quản trị hệ thống chốt cycle giữa mỗi bước.");
  return parts.join(" ");
}
