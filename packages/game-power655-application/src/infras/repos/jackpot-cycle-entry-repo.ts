/**
 * Power 6/55 – Jackpot Cycle Entry Repository (Cycle Ledger)
 *
 * Collection: power655JackpotCycleEntries
 *
 * Lưu lịch sử per-draw trong jackpot cycle — mỗi kỳ quay settle tạo/cập nhật
 * 1 document trong collection này. Immutable về logic (không xoá, chỉ upsert
 * khi resettle Type A cho phép cập nhật cycle).
 *
 * ── Mục đích chính ──────────────────────────────────────────────────────────
 * 1. Resettle: `PrepareSettle` đọc `findByDraw(drawId)` để lấy openingJp1/2
 *    thay vì `activeCycle.jackpot*CurrentAmount` (không còn đúng sau settle lần đầu).
 * 2. DBA restore (B2): DBA đọc `findByDraw(T)` để lấy openingJp1/2 + (seq-1)
 *    → restore activeCycle về trạng thái ngay trước kỳ T.
 * 3. Pre-flight (B2 detection): `findSettledChainAfterDraw(drawId)` → phát hiện
 *    kỳ settle sau T XUYÊN CYCLE (chain impact, kể cả khi tồn tại qua cycle đóng/mở).
 * 4. Audit/đối soát: `listByCycle(cycleNo)` → danh sách toàn bộ kỳ trong cycle.
 *
 * ── Index đề xuất ───────────────────────────────────────────────────────────
 *   { cycleNo: 1, seq: 1 } unique — sort chronological trong cycle.
 *   { drawId: 1 } unique — lookup nhanh theo kỳ.
 *
 * ── KHÔNG backfill kỳ cũ ────────────────────────────────────────────────────
 * Ledger chỉ ghi từ kỳ settle TỪ NAY về sau (sản phẩm mới).
 * Kỳ settle trước khi ledger đưa vào sản xuất không có entry trong collection.
 * `findByDraw` trả null cho kỳ cũ → caller phải guard và chuyển về DBA thủ công.
 */

import type { JackpotCycleEntryDoc, JackpotCycleEntryEntity } from "@megawin/game-power655/entities";
import { Power655Collections } from "@megawin/game-power655/entities";
import { BaseRepo } from "./base-repo";
import { JackpotCycleEntryMapper } from "../mappers/jackpot-cycle-entry-mapper";

/**
 * Repository cho Cycle Ledger Power 6/55.
 * Chỉ thực hiện DB operations — mọi business logic tính toán ở use-case layer.
 */
export class JackpotCycleEntryRepository extends BaseRepo<JackpotCycleEntryEntity, JackpotCycleEntryMapper> {
  constructor() {
    super({
      collName: Power655Collections.JackpotCycleEntries,
      dataMapper: new JackpotCycleEntryMapper(),
    });
  }

  /**
   * Upsert ledger entry cho 1 kỳ quay trong 1 cycle.
   *
   * Key upsert: `{ cycleNo, drawId }` (unique). Idempotent — gọi lại không tạo duplicate.
   *
   * **Quy ước modifier:**
   * - `$setOnInsert` cho field bất biến sau initial settle: `cycleNo`, `drawId`,
   *   `drawNo`, `seq`, và (mặc định) `openingJp1/2`.
   * - `$set` cho field cập nhật mỗi lần settle (kể cả resettle Type A): contribution,
   *   closing, winner flags, `settledAt`, `updatedAt`.
   *
   * **`allowOpeningUpdate`** (cascade B2): khi `true`, `openingJp1/2` chuyển từ
   * `$setOnInsert` sang `$set` để GHI ĐÈ. Cần thiết vì opening kỳ T+n = closing kỳ
   * T+n-1 (vừa đổi do resettle kỳ trước trong chuỗi). Mặc định `false`: opening bất
   * biến — đúng cho settle lần đầu + resettle Type A/B1 (opening kỳ T không đổi).
   *
   * FinalizeSettle gọi method này MỖI SETTLE (kể cả resettle Type A/B).
   *
   * @param entry - Dữ liệu đầy đủ của ledger entry (mọi field trừ `_id` và `updatedAt`).
   * @param allowOpeningUpdate - `true` (cascade B2): ghi đè `openingJp1/2` dù entry đã
   *   tồn tại. Mặc định `false`: opening bất biến qua `$setOnInsert`.
   */
  async upsertEntry(entry: Omit<JackpotCycleEntryDoc, "_id" | "updatedAt">, allowOpeningUpdate = false): Promise<void> {
    // Tách opening ra khỏi rest: rest luôn nằm trong $set (cập nhật mỗi settle);
    // identity (cycleNo/drawId/drawNo/seq) luôn $setOnInsert.
    const { cycleNo, drawId, drawNo, seq, openingJp1, openingJp2, ...mutable } = entry;
    const opening = { openingJp1, openingJp2 };

    await this.updateOne(
      { cycleNo, drawId },
      {
        $setOnInsert: {
          cycleNo,
          drawId,
          drawNo,
          seq,
          // Cascade B2: opening đi vào $set (ghi đè); ngược lại bất biến ở $setOnInsert.
          ...(allowOpeningUpdate ? {} : opening),
        },
        $set: {
          ...(allowOpeningUpdate ? opening : {}),
          ...mutable,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
  }

  /**
   * Tìm ledger entry theo drawId.
   *
   * Trả `null` nếu:
   *   - Kỳ chưa settle lần nào.
   *   - Kỳ settle trước khi ledger đưa vào sản xuất (không backfill).
   *
   * Caller phải guard `null` → nếu null: không thể tự động resettle → DBA thủ công.
   */
  async findByDraw(drawId: string): Promise<JackpotCycleEntryEntity | null> {
    return this.findOne({ drawId });
  }

  /**
   * Phát hiện chain impact XUYÊN CYCLE: tìm mọi ledger entry của kỳ settle SAU
   * `drawId` (theo thời gian), BẤT KỂ cycleNo.
   *
   * ── Vì sao không dùng `(cycleNo, seq)` ───────────────────────────────────────
   * Khi kỳ T từng CÓ JP1 winner (đóng cycle #N), các kỳ sau T đã settle ở cycle
   * #N+1 (hoặc xa hơn). Query theo `{ cycleNo: N, seq > targetSeq }` KHÔNG thấy
   * chúng (mang cycleNo khác) → bỏ sót chain cross-cycle → phân loại sai. Dùng
   * `drawId` (format `YYYY-MM-DD.NNN`, lexicographic = chronological) để bắt TRỌN
   * chain thật sự sau T, kể cả khi tồn tại qua nhiều cycle đóng/mở.
   *
   * Dùng trong `DetectResettleBoundariesUseCase` để phát hiện **Type B2** (cascade
   * step-wise xuyên cycle). KHÔNG dùng để phát hiện winner tại chính kỳ drawT —
   * caller phải pre-flight re-match riêng cho kỳ drawT (xem detect-boundaries.ts).
   *
   * @param drawId - Kỳ T (tìm entries có drawId > T theo thứ tự thời gian).
   * @returns Danh sách entries sau T (mọi cycle), sorted by drawId ASC = chronological.
   */
  async findSettledChainAfterDraw(drawId: string): Promise<JackpotCycleEntryEntity[]> {
    return this.findMany(
      {
        drawId: { $gt: drawId },
      },
      {
        sort: { drawId: 1 },
        // Chain SAU T thực tế nhỏ (số kỳ ảnh hưởng), nhưng phải bỏ cap mặc định 500
        // của findMany để KHÔNG cắt mất chain → cascade sót kỳ (correctness). 10_000
        // lớn hơn nhiều lần mọi cascade thực tế nhưng vẫn chặn runaway nếu drawId T
        // sai; IXSCAN {drawId:1} chỉ duyệt từ T trở đi (∝ độ dài chain, không full scan).
        limit: 100,
        // Chỉ lấy field detect-boundaries cần: drawId (thứ tự + chainDrawIds) và 2
        // winner flag (chainHasWinner). Giảm payload mạng + bytes đọc khi chain dài.
        projection: { drawId: 1, hasJp1Winner: 1, hasJp2Winner: 1 },
      },
    );
  }

  /**
   * Lấy "trạng thái closing" (closing JP1/2 + winner flags) của kỳ settle LIỀN
   * TRƯỚC `drawId` theo thời gian, BẤT KỂ cycleNo. Trả `null` nếu `drawId` là kỳ
   * settle đầu tiên trong ledger (không có kỳ trước).
   *
   * ── Vì sao cần (khác việc tìm theo `(cycleNo, seq-1)`) ───────────────────────
   * Trong cascade cross-cycle, kỳ T+n có thể nằm ở cycle KHÁC kỳ T+n-1 (ranh giới
   * cycle bị xoá khi gỡ winner). "Kỳ liền trước theo thời gian" mới là nguồn đúng
   * để resolve opening(T+n). Tìm theo `(cycleNo, seq)` khoá trong 1 cycleNo nên
   * không bắc cầu được qua ranh giới cycle. Dùng `drawId < T` lấy max.
   *
   * ── Vì sao trả ENTITY (khác `findClosingJpBeforeDraw` của Mega/Lotto) ────────
   * Power 6/55 DUAL jackpot: `resolveOpening` cần đọc ĐỒNG THỜI `closingJp1`,
   * `closingJp2`, `hasJp1Winner`, `hasJp2Winner` để áp luật per-jackpot (JP1 đóng
   * cycle vs JP2 reset-only — xem JSDoc resolveOpening). KHÔNG rút gọn về 1 số như
   * single-jackpot, nên trả entity (projection thu xuống đúng 5 field cần).
   *
   * @param drawId - Kỳ đang resettle (tìm entry có drawId < T lớn nhất).
   * @returns Entity kỳ liền trước (chỉ field closing JP1/2 + winner flags), hoặc `null`.
   */
  async findClosingStateBeforeDraw(drawId: string): Promise<JackpotCycleEntryEntity | null> {
    return this.findOne(
      {
        drawId: { $lt: drawId },
      },
      {
        sort: { drawId: -1 },
        // findOne áp limit(1) + IXSCAN {drawId:1}: seek thẳng tới boundary < T, lấy
        // đúng 1 doc — KHÔNG quét kỳ cũ. Projection chỉ field resolveOpening cần:
        // closing JP1/2 + winner flags để suy ra opening kỳ kế (per-jackpot).
        projection: {
          drawId: 1,
          closingJp1: 1,
          closingJp2: 1,
          hasJp1Winner: 1,
          hasJp2Winner: 1,
        },
      },
    );
  }

  /**
   * Lấy toàn bộ ledger entries của 1 cycle, sorted by seq ASC.
   *
   * Dùng cho:
   * - DBA: xem lịch sử tích luỹ đầy đủ của cycle để đối soát.
   * - Audit: verify opening/closing chain liên tục.
   * - Backoffice API: hiển thị timeline jackpot cycle.
   *
   * @param cycleNo - Số cycle cần liệt kê
   */
  async listByCycle(cycleNo: number): Promise<JackpotCycleEntryEntity[]> {
    return this.findMany({ cycleNo }, { sort: { seq: 1 } });
  }

  /**
   * Lấy ledger entry gần nhất của 1 cycle (entry có seq lớn nhất).
   *
   * Dùng trong `FinalizeSettle` để tính seq cho entry mới:
   *   nextSeq = (latestEntry?.seq ?? 0) + 1.
   *
   * @param cycleNo - Số cycle cần tìm entry cuối
   */
  async findLatestInCycle(cycleNo: number): Promise<JackpotCycleEntryEntity | null> {
    return this.findOne({ cycleNo }, { sort: { seq: -1 } });
  }
}
