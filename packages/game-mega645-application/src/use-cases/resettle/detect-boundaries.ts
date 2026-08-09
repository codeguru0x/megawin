/**
 * Mega 6/45 – Detect Resettle Boundaries Use Case
 *
 * Pre-flight phân tích tác động của việc sửa kết quả kỳ T và phân loại scenario:
 *
 *   TYPE_A       — Winner JP tại T KHÔNG đổi (cũ & mới đều không có winner) + chain
 *                  rỗng/không winner. Tự động hoàn toàn.
 *   TYPE_B1      — Winner JP tại T THAY ĐỔI (xuất hiện mới HOẶC biến mất) + T là kỳ
 *                  settle MỚI NHẤT (không có kỳ settle nào sau T). Auto payout, DBA
 *                  update cycle thủ công.
 *   TYPE_B2      — Kết quả T đổi VÀ có chain kỳ ĐÃ settle sau T (ảnh hưởng nhiều kỳ),
 *                  HOẶC chain sau T có winner. Chain detect XUYÊN CYCLE (theo drawId
 *                  thời gian) → bắt cả trường hợp gỡ winner ở kỳ đóng cycle khiến
 *                  cycle kế phải gộp ngược. CASCADE STEP-WISE: resettle tuần tự từng
 *                  kỳ T→T+1→…→T+n (mỗi kỳ chạy luồng B1: auto payout +
 *                  skipCycleUpdate=true), DBA chốt/tái cấu trúc cycle giữa các bước.
 *   LEDGER_MISSING — Ledger entry của kỳ T null dù đã settled → bất thường data
 *                    integrity (không xảy ra trong vận hành bình thường vì ledger
 *                    writer ghi cho mọi kỳ settle). Dừng, báo kỹ thuật.
 *
 * ── Cross-cycle restructure = TYPE_B2 (KHÔNG chặn) ──────────────────────────────
 * Khi kỳ T từng CÓ winner (đóng cycle #N), kết quả mới GỠ winner, các kỳ đã settle
 * sau T nằm ở cycle #N+1 (hoặc xa hơn). Đúng ra cycle #N KHÔNG đóng → các kỳ đó phải
 * gộp ngược vào cycle #N. Chain detection dùng `findSettledChainAfterDraw(drawId)`
 * (xuyên cycleNo, theo thời gian) nên BẮT được các kỳ này → phân loại TYPE_B2 và
 * cascade tuần tự như mọi B2 khác. DBA tái cấu trúc cycle metadata (gộp/đóng/mở)
 * giữa các bước dựa trên ledger; worker chỉ re-settle entries + payout.
 *
 * ── Khác biệt vs Power 6/55 (SINGLE jackpot) ────────────────────────────────────
 * Mega 6/45 CHỈ có 1 Jackpot (6/6), KHÔNG bonus, KHÔNG JP2, KHÔNG overflow.
 *   - Pre-flight re-match chỉ cần `proposedWinningNumbers` (6 số chính).
 *   - Trạng thái winner CŨ đọc trực tiếp từ `ledgerEntry.hasJpWinner` (1 flag).
 *   - Jackpot winner LUÔN đóng cycle → chain detection đơn giản: chỉ xét `hasJpWinner`.
 *
 * ── Winner JP "thay đổi" theo 2 chiều ───────────────────────────────────────────
 * Cycle bị ảnh hưởng khi winner JP tại T thay đổi theo BẤT KỲ chiều nào:
 *
 *   | # | Kết quả cũ | Kết quả mới | jpWinnerAffected | Scenario (không kỳ sau) |
 *   |---|-----------|------------|:----------------:|------------------------|
 *   | 1 | không có  | CÓ winner  |       true       | TYPE_B1                |
 *   | 2 | CÓ winner | không có   |       true       | TYPE_B1                |
 *   | 3 | CÓ winner | CÓ winner  |       true       | TYPE_B1 (an toàn)      |
 *   | 4 | không có  | không có   |       false      | TYPE_A                 |
 *
 * Lý do gộp cả 4: GỠ một winner cũ (case 2) nguy hiểm NGANG thêm winner mới (case 1).
 * Khi kết quả cũ có winner JP, cycle cũ đã ĐÓNG và JP đã reset về seed; nếu sửa
 * kết quả thành "không winner" mà vẫn auto (TYPE_A), FinalizeSettle chạy với
 * `getActiveCycle()` hiện tại (cycle mới sau khi đóng) → tính sai: jackpot bị reset
 * oan, cycle structure sai. Vì vậy chỉ TYPE_A khi cả cũ lẫn mới đều KHÔNG có winner.
 *
 * Bảng trên áp dụng khi KHÔNG có kỳ settle sau T. Khi CÓ kỳ sau (chain xuyên cycle
 * không rỗng) → leo lên TYPE_B2 cascade (gồm cả case 2 gỡ winner đóng cycle: các kỳ
 * cycle kế chính là chain).
 *
 * Trạng thái winner CŨ đọc trực tiếp từ `ledgerEntry.hasJpWinner` (đã ghi lúc settle
 * trước) — không cần re-match. Trạng thái winner MỚI lấy từ pre-flight re-match
 * (`detectNewJpWinner`).
 *
 * ── Pre-flight re-match ────────────────────────────────────────────────────────
 * Để detect JP winner mới tại T, match selection của tất cả entries (Settled hoặc
 * Scheduled nếu đây là lần thứ 2 resettle) với kết quả đề xuất.
 *
 * Match chạy HOÀN TOÀN server-side qua `EntryRepository.existsJpWinnerForDraw`:
 * 1 query (`$elemMatch` boards có `numbers.$all` = 6 số winning) hit index
 * `{ drawId, status }`. Tránh cursor-loop in-memory để chống API timeout khi kỳ
 * có rất nhiều entries (jackpot game).
 *
 * ── Chain detection (XUYÊN CYCLE) ──────────────────────────────────────────────
 * Dùng `JackpotCycleEntryRepository.findSettledChainAfterDraw(drawId)` để tìm ledger
 * entries của kỳ settle SAU T theo THỜI GIAN (drawId ASC), BẤT KỂ cycleNo. Chain có
 * winner = bất kỳ entry nào có `hasJpWinner`. Detect xuyên cycle là then chốt để bắt
 * trường hợp gỡ winner ở kỳ đóng cycle (chain nằm ở cycle kế).
 *
 * Khi TYPE_B2, output trả `chainDrawIds` (gồm cả T, sorted theo drawId ASC) để
 * staff/DBA biết thứ tự cascade resettle từng kỳ. Resettle PHẢI theo đúng thứ tự
 * này vì opening kỳ sau = closing kỳ trước (theo thời gian, kể cả qua ranh giới cycle).
 */

import { AppException, InternalUseCase } from "@megawin/app-core/use-cases";
import { EntryStatus } from "@megawin/game-core/entities";
import type { ResettleScenario as ResettleScenarioType } from "@megawin/game-mega645/rules";
import { ResettleScenario } from "@megawin/game-mega645/rules";
import { NextApiUseCase } from "@megawin/next/server";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { JackpotCycleEntryRepository } from "../../infras/repos/jackpot-cycle-entry-repo";

export interface DetectResettleBoundariesInput {
  drawId: string;
  /** Kết quả đề xuất sau sửa — 6 số chính, dùng để re-match phát hiện JP winner mới. */
  proposedWinningNumbers: string[];
}

export interface DetectResettleBoundariesOutput {
  drawId: string;
  /** Scenario phát hiện. */
  scenario: ResettleScenarioType;
  /** Mô tả ngắn gọn cho UI. */
  message: string;
  /**
   * Kết quả ĐỀ XUẤT có phát sinh JP winner hay không (pre-flight re-match).
   * `false` khi LEDGER_MISSING (không thể xác định).
   */
  hasNewJpWinner: boolean;
  /**
   * Kết quả CŨ (đã settle trước) có JP winner hay không — đọc từ
   * `ledgerEntry.hasJpWinner`. Dùng để phát hiện trường hợp "gỡ winner cũ"
   * (case 2: có → không), nguy hiểm ngang "thêm winner mới".
   * `false` khi LEDGER_MISSING.
   */
  hadOldJpWinner: boolean;
  /**
   * Số entries trong chain sau T.
   * 0 khi TYPE_A hoặc LEDGER_MISSING.
   */
  chainLength: number;
  /** Kỳ cuối trong chain bị ảnh hưởng (nếu có). */
  lastAffectedDrawId?: string;
  /**
   * Danh sách drawId cần cascade resettle theo thứ tự (gồm cả T), sorted theo
   * `drawId` ASC (thời gian, XUYÊN CYCLE). Chỉ có giá trị khi TYPE_B2 — staff/DBA
   * resettle tuần tự theo đúng thứ tự này (opening kỳ sau = closing kỳ trước).
   * undefined khi TYPE_A / TYPE_B1 / LEDGER_MISSING.
   */
  chainDrawIds?: string[];
}

/**
 * Internal use case chứa toàn bộ logic phân tích scenario — trả về output
 * THUẦN (`DetectResettleBoundariesOutput`), KHÔNG bọc `NextResponse`.
 *
 * Dùng bởi:
 *   - `DetectResettleBoundariesUseCase` (NextApiUseCase) — wrapper cho BO API.
 *   - `TriggerResettleUseCase` — cần đọc trực tiếp `scenario` để build resettleContext.
 *
 * Tách internal/wrapper vì NextApiUseCase.run() trả `NextResponse` không dùng
 * được trong use-case backend khác.
 */
export class DetectResettleBoundariesInternalUseCase extends InternalUseCase<
  DetectResettleBoundariesInput,
  DetectResettleBoundariesOutput
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly cycleEntryRepo = new JackpotCycleEntryRepository();

  protected async execute(input: DetectResettleBoundariesInput): Promise<DetectResettleBoundariesOutput> {
    const { drawId, proposedWinningNumbers } = input;

    // ── Step 1: validate draw tồn tại + đã settle ────────────────────────────
    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${drawId} không tồn tại.`);
    }

    if (!draw.settledAt) {
      throw AppException.businessRuleViolation(`Kỳ quay ${drawId} chưa từng settle — không cần resettle.`);
    }

    // ── Step 2: kiểm tra ledger entry của kỳ T ───────────────────────────────
    // Ledger entry null → kỳ cũ settle trước khi ledger ra production.
    // Không thể biết opening JP → DBA thủ công toàn bộ.
    const ledgerEntry = await this.cycleEntryRepo.findByDraw(drawId);
    if (!ledgerEntry) {
      return {
        drawId,
        scenario: ResettleScenario.LEDGER_MISSING,
        message: `Kỳ ${drawId} không có ledger entry dù đã settled — bất thường về data integrity, không xảy ra trong vận hành bình thường. Liên hệ đội kỹ thuật kiểm tra trước khi resettle.`,
        hasNewJpWinner: false,
        hadOldJpWinner: false,
        chainLength: 0,
      };
    }

    // ── Step 3: Pre-flight re-match — phát hiện JP winner MỚI tại T ─────────
    // Scan entries của kỳ T (status: Settled hoặc Scheduled nếu đang chờ resettle).
    // Match boards vs proposed result → check 6/6.
    const hasNewJpWinner = await this.detectNewJpWinner(drawId, proposedWinningNumbers);

    // Trạng thái winner CŨ — đọc trực tiếp từ ledger (ghi lúc settle trước),
    // KHÔNG cần re-match. Dùng để bắt case 2 (gỡ winner cũ: có → không).
    const hadOldJpWinner = ledgerEntry.hasJpWinner;

    // Cycle tại T bị ảnh hưởng khi winner JP thay đổi theo BẤT KỲ chiều nào:
    // thêm mới (case 1), gỡ bỏ (case 2), hoặc giữ winner (case 3, an toàn).
    // Chỉ KHÔNG ảnh hưởng khi cả cũ lẫn mới đều không có winner (case 4).
    const jpWinnerAffected = hasNewJpWinner || hadOldJpWinner;

    // ── Step 4: Chain detection XUYÊN CYCLE — kỳ settle sau T (theo thời gian) ─
    // findSettledChainAfterDraw(drawId) lấy TOÀN BỘ kỳ settle sau T theo drawId ASC,
    // BẤT KỂ cycleNo → bắt cả chain ở cycle kế (trường hợp gỡ winner đóng cycle).
    // Không cap limit: chainDrawIds cần đủ mọi kỳ để cascade trọn chuỗi; số kỳ thực
    // tế nhỏ (giới hạn bởi các kỳ đã settle sau T).
    const chain = await this.cycleEntryRepo.findSettledChainAfterDraw(drawId);

    const chainLength = chain.length;
    const lastAffectedDrawId = chainLength > 0 ? chain[chain.length - 1]!.drawId : undefined;

    // Kiểm tra chain có JP winner không (ảnh hưởng cycle structure của các kỳ sau).
    const chainHasWinner = chain.some((e) => e.hasJpWinner);

    // ── Step 5: Phân loại scenario ───────────────────────────────────────────
    //
    // TYPE_B2: kết quả T đổi VÀ có chain kỳ đã settle sau T (xuyên cycle), HOẶC
    //   chain có winner. CASCADE STEP-WISE: resettle tuần tự T→T+1→…→T+n, mỗi kỳ
    //   chạy luồng B1 (auto payout + skipCycleUpdate=true), DBA chốt/tái cấu trúc
    //   cycle giữa các bước. Lý do cascade an toàn: sửa T chỉ đổi POOL tích lũy +
    //   ranh giới cycle, KHÔNG đổi kết quả số của các kỳ sau → danh sách winner giữ
    //   nguyên, chỉ số tiền tính lại đúng theo opening mới (PrepareSettle đọc opening
    //   từ ledger đã được DBA chốt). Cross-cycle (gỡ winner đóng cycle) cũng rơi vào
    //   đây vì chain detect xuyên cycle thấy các kỳ ở cycle kế.
    if ((jpWinnerAffected && chainLength > 0) || chainHasWinner) {
      // chainDrawIds = [T, T+1, …, T+n] theo drawId ASC (thời gian) để hướng dẫn thứ
      // tự cascade. T đứng đầu (resettle trước), chain entries đã sorted drawId ASC
      // từ findSettledChainAfterDraw — đúng thứ tự kể cả khi tồn tại qua nhiều cycle.
      const chainDrawIds = [drawId, ...chain.map((e) => e.drawId)];
      return {
        drawId,
        scenario: ResettleScenario.TYPE_B2,
        message: buildB2Message(drawId, hasNewJpWinner, hadOldJpWinner, chainLength, chainHasWinner),
        hasNewJpWinner,
        hadOldJpWinner,
        chainLength,
        lastAffectedDrawId,
        chainDrawIds,
      };
    }

    // TYPE_B1: Winner JP tại T thay đổi (thêm/gỡ) VÀ không có kỳ settle nào sau T
    //   (T là kỳ mới nhất đã settle). Auto payout OK — entries/reversals chạy tự động.
    //   Nhưng jackpot cycle cần DBA update thủ công (skipCycleUpdate = true).
    if (jpWinnerAffected && chainLength === 0) {
      return {
        drawId,
        scenario: ResettleScenario.TYPE_B1,
        message: buildB1Message(drawId, hasNewJpWinner, hadOldJpWinner),
        hasNewJpWinner,
        hadOldJpWinner,
        chainLength: 0,
      };
    }

    // TYPE_A: Winner JP tại T KHÔNG đổi (cũ & mới đều không winner) VÀ chain
    //   rỗng/không winner. Tự động hoàn toàn — FinalizeSettle cập nhật cycle bình thường.
    return {
      drawId,
      scenario: ResettleScenario.TYPE_A,
      message: `Kết quả mới không thay đổi người trúng Jackpot (cũ & mới đều không có). Có thể resettle tự động.`,
      hasNewJpWinner: false,
      hadOldJpWinner: false,
      chainLength,
    };
  }

  /**
   * Phát hiện kỳ T có JP winner mới (6/6) với kết quả đề xuất hay không.
   *
   * Delegate hoàn toàn cho `EntryRepository.existsJpWinnerForDraw` — match
   * server-side bằng 1 query + `$limit: 1` (xem JSDoc method đó). Tránh
   * cursor-loop in-memory để chống timeout khi kỳ có rất nhiều entries.
   *
   * Quét cả entries Settled (resettle lần đầu) và Scheduled (entries đã bị
   * PrepareResettle reset nhưng chưa re-settle — retry detection).
   */
  private async detectNewJpWinner(drawId: string, proposedWinningNumbers: string[]): Promise<boolean> {
    return this.entryRepo.existsJpWinnerForDraw(drawId, proposedWinningNumbers, [
      EntryStatus.Settled,
      EntryStatus.Scheduled,
    ]);
  }
}

/**
 * Wrapper cho BO API `/resettle-preflight` — bọc internal use case thành
 * `NextResponse` qua `NextApiUseCase`. Logic nằm hoàn toàn ở internal.
 */
export class DetectResettleBoundariesUseCase extends NextApiUseCase<
  DetectResettleBoundariesInput,
  DetectResettleBoundariesOutput
> {
  private readonly internal = new DetectResettleBoundariesInternalUseCase();

  protected async execute(input: DetectResettleBoundariesInput): Promise<DetectResettleBoundariesOutput> {
    return this.internal.run(input);
  }
}

/**
 * Build message cho TYPE_B1 — phân biệt rõ winner xuất hiện mới, biến mất, hay giữ.
 */
function buildB1Message(drawId: string, hasNewJpWinner: boolean, hadOldJpWinner: boolean): string {
  let reason: string;
  if (hasNewJpWinner && !hadOldJpWinner) {
    // Case 1: chưa có → có.
    reason = `Kết quả mới phát sinh người trúng Jackpot tại kỳ ${drawId}`;
  } else if (!hasNewJpWinner && hadOldJpWinner) {
    // Case 2: có → không. Gỡ winner cũ → cycle cũ đáng lẽ không đóng.
    reason = `Kết quả mới GỠ BỎ người trúng Jackpot cũ tại kỳ ${drawId} (cycle cũ đã đóng/reset sai)`;
  } else {
    // Case 3: có → vẫn có.
    reason = `Kết quả mới vẫn có người trúng Jackpot tại kỳ ${drawId} (có thể khác số người/pool)`;
  }
  return `${reason}. Payout reversal tự động, nhưng BẮT BUỘC báo Quản trị hệ thống cập nhật jackpot cycle thủ công sau khi re-settle xong.`;
}

/** Build message cho TYPE_B2 (cascade step-wise). */
function buildB2Message(
  drawId: string,
  hasNewJpWinner: boolean,
  hadOldJpWinner: boolean,
  chainLength: number,
  chainHasWinner: boolean,
): string {
  const parts: string[] = [`Kỳ ${drawId} cần resettle theo chuỗi (TYPE_B2 — cascade step-wise).`];

  if (hasNewJpWinner && !hadOldJpWinner) {
    parts.push(`Kết quả mới phát sinh người trúng Jackpot tại kỳ này — ảnh hưởng đến cycle.`);
  } else if (!hasNewJpWinner && hadOldJpWinner) {
    parts.push(`Kết quả mới gỡ bỏ người trúng Jackpot cũ tại kỳ này — cycle cũ đáng lẽ không đóng.`);
  } else if (hasNewJpWinner && hadOldJpWinner) {
    parts.push(`Kết quả mới vẫn có người trúng Jackpot tại kỳ này — cấu trúc cycle có thể đổi.`);
  }

  if (chainLength > 0) {
    parts.push(`Có ${chainLength} kỳ settle sau (chain, có thể tồn tại qua nhiều cycle) bị ảnh hưởng pool.`);
  }

  if (chainHasWinner) {
    parts.push(`Chain sau kỳ này đã có người trúng Jackpot — số tiền trúng cần tính lại theo pool mới.`);
  }

  parts.push(
    `Hệ thống resettle TUẦN TỰ từng kỳ (auto hoàn tiền + kết sổ lại payout); Quản trị hệ thống chốt jackpot cycle giữa mỗi bước.`,
  );

  return parts.join(" ");
}
