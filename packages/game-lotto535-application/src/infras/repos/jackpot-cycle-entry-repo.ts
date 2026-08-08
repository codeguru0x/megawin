/**
 * Lotto 5/35 – Jackpot Cycle Entry Repository (Cycle Ledger)
 *
 * Collection: lotto535_jackpot_cycle_entries
 *
 * Lưu lịch sử per-draw trong jackpot cycle — mỗi kỳ quay settle tạo/cập nhật
 * 1 document. Immutable về logic (không xoá, chỉ upsert).
 *
 * ── Mục đích chính ──────────────────────────────────────────────────────────
 * 1. Resettle: `PrepareSettle` đọc `findByDraw(drawId)` lấy opening thay vì
 *    `activeCycle.currentAmount` (không còn đúng sau settle lần đầu).
 * 2. Pre-flight (B2 detection): `findSettledChainAfterDraw(drawId)` → phát hiện
 *    kỳ settle sau T XUYÊN CYCLE (chain impact, kể cả khi tồn tại qua cycle đóng/mở
 *    do JP winner hoặc Split Cycle).
 * 3. Cascade opening: `findClosingBeforeDraw(drawId)` → opening(K) =
 *    closing(kỳ liền trước theo thời gian), bắc cầu qua ranh giới cycle.
 * 4. Audit/đối soát: `listByCycle(cycleNo)` → toàn bộ kỳ trong cycle.
 */

import type { JackpotCycleEntryDoc, JackpotCycleEntryEntity } from "@megawin/game-lotto535/entities";
import { Lotto535Collections } from "@megawin/game-lotto535/entities";

import { JackpotCycleEntryMapper } from "../mappers/jackpot-cycle-entry-mapper";
import { BaseRepo } from "./base-repo";

export class JackpotCycleEntryRepository extends BaseRepo<JackpotCycleEntryEntity, JackpotCycleEntryMapper> {
  constructor() {
    super({
      collName: Lotto535Collections.JackpotCycleEntries,
      dataMapper: new JackpotCycleEntryMapper(),
    });
  }

  /**
   * Upsert ledger entry theo `{ cycleNo, drawId }`.
   *
   * `opening` mặc định `$setOnInsert` (bất biến). Cascade B2: `allowOpeningUpdate=true`
   * chuyển `opening` sang `$set` để ghi đè sau khi closing kỳ trước đổi.
   */
  async upsertEntry(entry: Omit<JackpotCycleEntryDoc, "_id" | "updatedAt">, allowOpeningUpdate = false): Promise<void> {
    const { cycleNo, drawId, drawNo, seq, opening, ...mutable } = entry;

    await this.updateOne(
      { cycleNo, drawId },
      {
        $setOnInsert: {
          cycleNo,
          drawId,
          drawNo,
          seq,
          ...(allowOpeningUpdate ? {} : { opening }),
        },
        $set: {
          ...(allowOpeningUpdate ? { opening } : {}),
          ...mutable,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
  }

  async findByDraw(drawId: string): Promise<JackpotCycleEntryEntity | null> {
    return this.findOne({ drawId });
  }

  /**
   * Phát hiện chain impact XUYÊN CYCLE: tìm mọi ledger entry của kỳ settle SAU
   * `drawId` (theo thời gian), BẤT KỂ cycleNo.
   *
   * ── Vì sao không dùng `(cycleNo, seq)` ───────────────────────────────────────
   * Lotto 5/35 đóng cycle khi `hasJpWinner` HOẶC `didSplit`. Khi kỳ T từng đóng
   * cycle #N, các kỳ sau T đã settle ở cycle #N+1 (hoặc xa hơn). Query theo
   * `{ cycleNo: N, seq > targetSeq }` KHÔNG thấy chúng (mang cycleNo khác) → bỏ
   * sót chain cross-cycle → phân loại sai. Dùng `drawId` (format `YYYY-MM-DD.NNN`,
   * lexicographic = chronological) để bắt TRỌN chain thật sau T, kể cả khi tồn tại qua
   * nhiều cycle đóng/mở.
   *
   * Dùng trong `DetectResettleBoundariesUseCase` để phát hiện **Type B2** (cascade
   * step-wise xuyên cycle). KHÔNG dùng để phát hiện winner/split tại chính kỳ T —
   * caller pre-flight re-match riêng cho kỳ T.
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
        limit: 10_000,
        // Chỉ lấy field detect-boundaries cần: drawId (thứ tự + chainDrawIds) và 2
        // flag đóng cycle (winner HOẶC split). Giảm payload mạng + bytes đọc khi chain dài.
        projection: { drawId: 1, hasJpWinner: 1, didSplit: 1 },
      },
    );
  }

  /**
   * Lấy `closing` (jackpot cuối kỳ, VND) của kỳ settle LIỀN TRƯỚC `drawId` theo
   * thời gian, BẤT KỂ cycleNo. Trả `null` nếu `drawId` là kỳ settle đầu tiên trong
   * ledger (không có kỳ trước).
   *
   * ── Vì sao cần (khác việc tìm theo `(cycleNo, seq-1)`) ───────────────────────
   * Trong cascade cross-cycle, kỳ T+n có thể nằm ở cycle KHÁC kỳ T+n-1 (ranh giới
   * cycle bị xoá khi gỡ JP winner/Split). "Kỳ liền trước theo thời gian" mới là
   * nguồn đúng cho opening(T+n) = closing(kỳ trước). Tìm theo `(cycleNo, seq)` khoá
   * trong 1 cycleNo nên không bắc cầu được qua ranh giới cycle. Dùng `drawId < T` lấy max.
   *
   * ── Vì sao trả thẳng `closing` (không phải entity) ───────────────────────────
   * Caller duy nhất (`TriggerResettle.resolveOpening`) chỉ cần `closing` làm opening
   * kỳ kế (bất biến ledger: opening(K) = closing(K-1)). `closing` đã phản ánh split
   * reset (split → closing = seed). Trả thẳng số tránh map entity + thu projection
   * xuống đúng 1 field → payload tối thiểu.
   *
   * @param drawId - Kỳ đang resettle (tìm entry có drawId < T lớn nhất).
   * @returns `closing` của kỳ liền trước (VND), hoặc `null` nếu không có kỳ trước.
   */
  async findClosingBeforeDraw(drawId: string): Promise<number | null> {
    const prev = await this.findOne(
      {
        drawId: { $lt: drawId },
      },
      {
        sort: { drawId: -1 },
        // findOne áp limit(1) + IXSCAN {drawId:1}: seek thẳng tới boundary < T, lấy
        // đúng 1 doc — KHÔNG quét kỳ cũ. Projection đúng 1 field cần (closing).
        projection: { drawId: 1, closing: 1 },
      },
    );
    return prev?.closing ?? null;
  }

  async listByCycle(cycleNo: number): Promise<JackpotCycleEntryEntity[]> {
    return this.findMany({ cycleNo }, { sort: { seq: 1 } });
  }

  /**
   * Tổng `contribution` của các kỳ TRƯỚC `seq` trong cùng cycle (VND).
   *
   * Dùng cho resettle: `cycleContributionBefore` = Σ contribution(seq' < seq).
   * Aggregate `$sum` server-side — chỉ trả 1 số, không load toàn bộ document như
   * `listByCycle`. Lấy contribution THỰC TẾ từng kỳ (không suy từ `opening - seed`
   * vì split cycle reset closing làm gãy bất biến số học đó).
   *
   * Cross-cycle (cascade B2): trước khi resettle kỳ T+n, DBA đã tái cấu trúc ledger
   * (đổi `cycleNo`/`seq` của T+n về cycle gốc đã reopen). Do đó `cycleNo`/`seq` truyền
   * vào LUÔN là giá trị thật sau restructure → aggregate đúng phạm vi cycle.
   *
   * @returns tổng contribution; 0 nếu không có kỳ trước (seq=1).
   */
  async sumContributionBefore(cycleNo: number, seq: number): Promise<number> {
    const rows = await this.aggregate([
      { $match: { cycleNo, seq: { $lt: seq } } },
      { $group: { _id: null, total: { $sum: "$contribution" } } },
    ]);

    return (rows[0]?.total as number | undefined) ?? 0;
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
