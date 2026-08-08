/**
 * Power 6/55 – Detect Resettle Boundaries Use Case
 *
 * Pre-flight phân tích tác động của việc sửa kết quả kỳ T và phân loại scenario:
 *
 *   TYPE_A       — Winner JP tại T KHÔNG đổi (cũ & mới đều không có winner) + chain
 *                  rỗng/không winner. Tự động hoàn toàn.
 *   TYPE_B1      — Winner JP tại T THAY ĐỔI (xuất hiện mới HOẶC biến mất) + T là kỳ
 *                  mới nhất trong cycle. Auto payout, DBA update cycle thủ công.
 *   TYPE_B2      — Kết quả T đổi VÀ có chain kỳ ĐÃ settle sau T (ảnh hưởng nhiều kỳ),
 *                  HOẶC chain sau T có winner. CASCADE STEP-WISE XUYÊN CYCLE:
 *                  resettle tuần tự từng kỳ T→T+1→…→T+n (mỗi kỳ chạy luồng B1: auto
 *                  payout + skipCycleUpdate=true), DBA chốt/tái cấu trúc cycle giữa
 *                  các bước. Chain phát hiện theo `drawId` (thời gian) nên BẮC CẦU
 *                  được qua ranh giới cycle: kể cả khi gỡ JP1 winner ở kỳ đóng cycle
 *                  và các kỳ sau đã settle ở cycle kế, toàn bộ vẫn vào 1 chuỗi B2.
 *   LEDGER_MISSING — Ledger entry của kỳ T null dù đã settled → bất thường data
 *                    integrity (không xảy ra trong vận hành bình thường vì ledger
 *                    writer ghi cho mọi kỳ settle). Dừng, báo kỹ thuật.
 *
 * ── Cross-cycle gỡ JP1 winner: đưa vào B2, KHÔNG chặn ──────────────────────────
 * Khi kỳ T từng CÓ JP1 winner (đóng cycle #N) và kết quả mới GỠ winner đó, các kỳ
 * đã settle ở cycle #N+1 (hoặc xa hơn) nằm SAU T theo thời gian → `findSettledChain
 * AfterDraw(drawId)` bắt trọn chúng → phân loại TYPE_B2. Cascade resettle TUẦN TỰ
 * từng kỳ xuyên cycle; DBA tái cấu trúc cycle metadata (đóng/mở/gộp cycleNo trong
 * `jackpot_cycles` + ledger) giữa mỗi bước dựa trên dữ liệu ledger. KHÔNG còn chặn
 * bằng scenario riêng — chỉ cần DBA can thiệp tối thiểu ở cycle.
 *
 * ── Winner JP "thay đổi" theo 2 chiều ───────────────────────────────────────────
 * Cycle bị ảnh hưởng khi winner JP tại T thay đổi theo BẤT KỲ chiều nào:
 *
 *   | # | Kết quả cũ | Kết quả mới | jpWinnerAffected | Scenario (không kỳ sau) |
 *   |---|-----------|------------|:----------------:|----------------------|
 *   | 1 | không có  | CÓ winner  |       true       | TYPE_B1              |
 *   | 2 | CÓ winner | không có   |       true       | TYPE_B1              |
 *   | 3 | CÓ winner | CÓ winner  |       true       | TYPE_B1 (an toàn)    |
 *   | 4 | không có  | không có   |       false      | TYPE_A               |
 *
 * (Có kỳ settle SAU T theo thời gian, hoặc chain có winner → nâng lên TYPE_B2.)
 *
 * Lý do gộp cả 4: GỠ một winner cũ (case 2) nguy hiểm NGANG thêm winner mới (case 1).
 * Khi kết quả cũ có winner JP1, cycle cũ đã ĐÓNG và JP1 đã reset về seed; nếu sửa
 * kết quả thành "không winner" mà vẫn auto (TYPE_A), FinalizeSettle chạy với
 * `getActiveCycle()` hiện tại (cycle mới sau khi đóng) → tính sai: jackpot bị reset
 * oan, cycle structure sai. Vì vậy chỉ TYPE_A khi cả cũ lẫn mới đều KHÔNG có winner.
 *
 * Trạng thái winner CŨ đọc trực tiếp từ `ledgerEntry.hasJp1Winner/hasJp2Winner`
 * (đã ghi lúc settle trước) — không cần re-match. Trạng thái winner MỚI lấy từ
 * pre-flight re-match (`detectNewJpWinner`).
 *
 * ── Pre-flight re-match ────────────────────────────────────────────────────────
 * Để detect JP winner mới tại T, use case cần match selection của tất cả entries
 * (đang ở status=Settled hoặc status=Scheduled nếu đây là lần thứ 2 resettle) với
 * kết quả đề xuất (`proposedWinningMain`, `proposedBonusNumber`).
 *
 * Match chạy HOÀN TOÀN server-side qua `EntryRepository.existsJpWinnerForDraw`:
 * 1 aggregation (`$unwind` boards → `$setIntersection` → `$match` JP1/JP2 →
 * `$limit: 1`) hit index `{ drawId, status }`. Tránh cursor-loop in-memory để
 * chống API timeout khi kỳ có rất nhiều entries (jackpot game).
 *
 * Nếu tồn tại ít nhất 1 board trúng JP1/JP2 theo kết quả đề xuất → có winner mới.
 *
 * ── Chain detection (XUYÊN CYCLE) ──────────────────────────────────────────────
 * Dùng `JackpotCycleEntryRepository.findSettledChainAfterDraw(drawId)` để tìm mọi
 * ledger entry của kỳ settle SAU T theo thời gian (`drawId` ASC), BẤT KỂ cycleNo.
 * Nhờ đó bắt được cả chain tồn tại qua ranh giới cycle (kỳ T đóng cycle, kỳ sau ở cycle
 * kế) — điểm mấu chốt để gỡ JP1 winner ở kỳ đóng cycle vẫn vào đúng TYPE_B2.
 *
 * Chain có winner = bất kỳ entry nào trong chain có `hasJp1Winner=true` hoặc
 * `hasJp2Winner=true` → TYPE_B2.
 *
 * Không có kỳ settle nào sau T và T đổi winner → TYPE_B1.
 *
 * Khi TYPE_B2, output trả `chainDrawIds` (gồm cả T, sorted theo `drawId` ASC =
 * thời gian) để staff/DBA biết thứ tự cascade resettle từng kỳ. Resettle PHẢI theo
 * đúng thứ tự này vì opening kỳ sau phụ thuộc closing/seed kỳ trước.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { InternalUseCase, AppException } from "@megawin/app-core/use-cases";
import { EntryStatus } from "@megawin/game-core/entities";
import { ResettleScenario } from "@megawin/game-power655/rules";
import type { ResettleScenario as ResettleScenarioType } from "@megawin/game-power655/rules";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { JackpotCycleEntryRepository } from "../../infras/repos/jackpot-cycle-entry-repo";

export interface DetectResettleBoundariesInput {
  drawId: string;
  /** Kết quả đề xuất sau sửa — dùng để re-match phát hiện JP winner mới. */
  proposedWinningMain: string[];
  proposedBonusNumber: string;
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
   * `ledgerEntry.hasJp1Winner/hasJp2Winner`. Dùng để phát hiện trường hợp "gỡ
   * winner cũ" (case 2: có → không), nguy hiểm ngang "thêm winner mới".
   * `false` khi LEDGER_MISSING.
   */
  hadOldJpWinner: boolean;
  /**
   * Số entries trong chain settle sau T (theo thời gian, xuyên cycle).
   * 0 khi TYPE_A hoặc LEDGER_MISSING.
   */
  chainLength: number;
  /** Kỳ cuối trong chain bị ảnh hưởng (nếu có). */
  lastAffectedDrawId?: string;
  /**
   * Danh sách drawId cần cascade resettle theo thứ tự (gồm cả T), sorted theo
   * `drawId` ASC = thời gian. Chỉ có giá trị khi TYPE_B2 — staff/DBA resettle tuần
   * tự theo đúng thứ tự này (opening kỳ sau phụ thuộc closing/seed kỳ trước, có
   * thể tồn tại qua nhiều cycle đóng/mở).
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
    const { drawId, proposedWinningMain, proposedBonusNumber } = input;

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
    // Không thể biết opening JP1/2 → DBA thủ công toàn bộ.
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
    // Scan entries của kỳ T (status: Settled hoặc Published nếu đang chờ resettle).
    // Load boards → matchLine vs proposed result → check tier = Jackpot1 | Jackpot2.
    const hasNewJpWinner = await this.detectNewJpWinner(drawId, proposedWinningMain, proposedBonusNumber);

    // Trạng thái winner CŨ — đọc trực tiếp từ ledger (ghi lúc settle trước),
    // KHÔNG cần re-match. Dùng để bắt case 2 (gỡ winner cũ: có → không).
    const hadOldJpWinner = ledgerEntry.hasJp1Winner || ledgerEntry.hasJp2Winner;

    // Cycle tại T bị ảnh hưởng khi winner JP thay đổi theo BẤT KỲ chiều nào:
    // thêm mới (case 1), gỡ bỏ (case 2), hoặc giữ winner (case 3, an toàn).
    // Chỉ KHÔNG ảnh hưởng khi cả cũ lẫn mới đều không có winner (case 4).
    const jpWinnerAffected = hasNewJpWinner || hadOldJpWinner;

    // ── Step 4: Chain detection — kỳ settle sau T (theo thời gian, XUYÊN CYCLE) ─
    // findSettledChainAfterDraw(drawId) lấy mọi kỳ settle có drawId > T, BẤT KỂ
    // cycleNo, sort drawId ASC = thời gian. Bắt trọn chain kể cả khi tồn tại qua ranh
    // giới cycle (kỳ T đóng cycle, kỳ sau ở cycle kế). KHÔNG cap: chainDrawIds cần
    // đủ mọi kỳ để cascade trọn chuỗi; thực tế số kỳ nhỏ.
    const chain = await this.cycleEntryRepo.findSettledChainAfterDraw(drawId);

    const chainLength = chain.length;
    const lastAffectedDrawId = chainLength > 0 ? chain[chain.length - 1]!.drawId : undefined;

    // Kiểm tra chain có JP winner không (ảnh hưởng cycle structure của các kỳ sau).
    const chainHasWinner = chain.some((e) => e.hasJp1Winner || e.hasJp2Winner);

    // ── Step 5: Phân loại scenario ───────────────────────────────────────────
    //
    // TYPE_B2: kết quả T đổi VÀ có kỳ đã settle sau T (theo thời gian, xuyên cycle),
    //   HOẶC chain có winner. CASCADE STEP-WISE XUYÊN CYCLE: resettle tuần tự
    //   T→T+1→…→T+n, mỗi kỳ chạy luồng B1 (auto payout + skipCycleUpdate=true), DBA
    //   chốt/tái cấu trúc cycle giữa các bước.
    //   Lý do cascade an toàn: sửa T chỉ đổi POOL tích lũy, KHÔNG đổi kết quả số
    //   của các kỳ sau → danh sách winner giữ nguyên, chỉ số tiền tính lại đúng
    //   theo opening mới (PrepareSettle đọc opening từ ledger đã được DBA chốt).
    //   Cross-cycle (gỡ JP1 winner ở kỳ đóng cycle): các kỳ ở cycle kế nằm trong
    //   chain này → cùng được resettle tuần tự, DBA gộp cycle metadata giữa bước.
    if ((jpWinnerAffected && chainLength > 0) || chainHasWinner) {
      // chainDrawIds = [T, T+1, …, T+n] theo drawId ASC (thời gian) để hướng dẫn
      // thứ tự cascade. T đứng đầu; chain đã sorted drawId ASC từ repo.
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

    // TYPE_B1: Winner JP tại T thay đổi (thêm/gỡ) VÀ không có kỳ settle nào sau T.
    //   Auto payout OK — entries/reversals chạy tự động.
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

    // TYPE_A: Winner JP tại T KHÔNG đổi (cũ & mới đều không winner) VÀ không có kỳ
    //   sau/không winner. Tự động hoàn toàn — FinalizeSettle cập nhật cycle bình thường.
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
   * Phát hiện kỳ T có JP winner mới (JP1/JP2) với kết quả đề xuất hay không.
   *
   * Delegate hoàn toàn cho `EntryRepository.existsJpWinnerForDraw` — match
   * server-side bằng 1 aggregation + `$limit: 1` (xem JSDoc method đó cho luật
   * match JP1/JP2 và cách xử lý Bao N). Tránh cursor-loop in-memory để chống
   * timeout khi kỳ có rất nhiều entries.
   *
   * Quét cả entries Settled (resettle lần đầu) và Scheduled (entries đã bị
   * PrepareResettle reset nhưng chưa re-settle — retry detection).
   */
  private async detectNewJpWinner(
    drawId: string,
    proposedWinningMain: string[],
    proposedBonusNumber: string,
  ): Promise<boolean> {
    // Toàn bộ logic match chạy server-side trong 1 aggregation + $limit:1.
    // Xem JSDoc EntryRepository.existsJpWinnerForDraw cho luật match JP1/JP2.
    return this.entryRepo.existsJpWinnerForDraw(drawId, proposedWinningMain, proposedBonusNumber, [
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
    parts.push(`Có ${chainLength} kỳ settle sau (chain) bị ảnh hưởng pool — có thể tồn tại qua nhiều cycle.`);
  }

  if (chainHasWinner) {
    parts.push(`Chain sau kỳ này đã có người trúng Jackpot — số tiền trúng cần tính lại theo pool mới.`);
  }

  parts.push(
    `Hệ thống resettle TUẦN TỰ từng kỳ (auto hoàn tiền + kết sổ lại payout); Quản trị hệ thống chốt jackpot cycle giữa mỗi bước.`,
  );

  return parts.join(" ");
}
