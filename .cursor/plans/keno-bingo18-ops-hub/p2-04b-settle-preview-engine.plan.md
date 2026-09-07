# p2-04b — Engine kết sổ thử (dry-settle) — nguồn số liệu cho Auto-Pilot kết sổ

> **Phase:** P2 · **Status:** ⏳ pending · **Phụ thuộc:** `p2-04a` (bắt buộc) · **Chặn:** `p2-04`
> **Tạo 07/09/2026.** Thay thế hoàn toàn cách tiếp cận "chỉ số rủi ro proxy" của bản `p2-01` §3.4 cũ.

## 0. Quyết định thiết kế và lý do

### 0.1 Vấn đề của bản trước

Bản `p2-01` §3.4 (06/09) cho Auto-Pilot quyết định kết sổ dựa trên **chỉ số proxy** đọc từ
`keno_draw_betting_stats`: `exposureRatio`, `maxSingleEntryShare`, `capSetsGuardRatio`. Ba vấn đề:

1. **Proxy là ước lượng xấu nhất, không phải số thật.** `exposure.worstCaseTotal` là nghĩa vụ
   trả thưởng **nếu mọi vé đều trúng đậm** — luôn cao hơn số thật hàng chục lần. Ngưỡng dựa trên
   nó không có ý nghĩa nghiệp vụ trực tiếp, phải hiệu chuẩn bằng phân bố lịch sử.
2. **Không có đáp án đúng để đối chiếu.** Không cách nào biết proxy "đúng" hay "sai" — chỉ biết
   nó cao hay thấp. Không kiểm chứng được ⇒ không có lưới an toàn.
3. **Phải chờ 2 tuần tích luỹ dữ liệu** mới chọn được ngưỡng.

### 0.2 Cách làm mới

Kỳ đã `Published` ⇒ **đã có 20 số trúng**. Keno **100% giải cố định** (12 play type, không jackpot,
không pool chia — xác nhận qua `rules/odds.ts` + `basicPrizes`/`bigSmallPrizes`/`evenOddPrizes`).

Nghĩa là: **số tiền phải trả của kỳ đó tính được CHÍNH XÁC, ngay lập tức, không cần settle.**

Engine này quét entries của kỳ, dùng **cùng hàm** `computeEntryPayout` mà settle thật dùng
(`p2-04a`), cộng dồn, áp cap, ghi kết quả vào collection riêng. Auto-Pilot đọc **số tiền thật**
để quyết định, không đọc proxy nữa.

### 0.3 Ba ràng buộc tuyệt đối

| Ràng buộc | Vì sao |
|---|---|
| **KHÔNG ghi gì vào `keno_ticket_entries`** | Preview không được chạm vào entry. Một `bulkWrite` lạc tay = double-settle. Engine này chỉ ĐỌC entries. |
| **KHÔNG ghi gì vào `keno_draws`** | Không thêm field, không đổi `status`. Preview sống hoàn toàn ở collection riêng. Draw không biết preview tồn tại. |
| **KHÔNG chạm settle pipeline / Step Functions** | Không sửa `settle.asl.json`, không thêm/bớt/đổi thứ tự step. Nhánh độc lập hoàn toàn. |

Ba ràng buộc này là lý do phương án được chọn: **nếu engine này có bug, hậu quả tối đa là
Auto-Pilot quyết định sai — không bao giờ là tiền sai.** Settle thật vẫn chạy đúng như hôm nay.

## 1. Collection mới: `keno_settle_previews`

**File entity:** `packages/game-keno/src/entities/settle-preview.ts`

```typescript
/**
 * Kết quả "kết sổ thử" của 1 kỳ — số tiền phải trả tính CHÍNH XÁC từ kết quả đã publish,
 * bằng cùng công thức settle thật dùng, nhưng KHÔNG ghi gì vào entries/draw.
 *
 * 1 doc = 1 draw (unique `drawId`). Upsert overwrite, idempotent.
 *
 * MỤC ĐÍCH: cho Auto-Pilot kết sổ (`p2-04`) quyết định trên SỐ TIỀN THẬT thay vì chỉ số
 * proxy ước lượng. Kèm cơ chế tự kiểm chứng: sau khi settle thật xong, `verification`
 * so preview với `draw.financial` — lệch một lần là bằng chứng engine có bug.
 *
 * KHÔNG phải báo cáo tài chính. Báo cáo tài chính là `keno_settle_draw_reports`
 * (`financial-reporting-system.mdc`) — chỉ ghi sau settle thật, là số liệu chính thức.
 * Preview là số liệu TẠM để ra quyết định, không dùng cho kế toán, không hiển thị như
 * doanh thu đã chốt.
 */
export interface KenoSettlePreviewDoc {
  /** ID kỳ quay. Unique index. */
  drawId: string;

  /**
   * Định danh kết quả mà preview này tính theo: hash của 20 số trúng (đã sort, join).
   *
   * Đây là cơ chế chống dùng preview cũ — thay thế cho việc đo "dữ liệu có cũ quá không"
   * bằng đồng hồ. `VALID_TRANSITIONS` cho phép `Settled → Published` (resettle) và
   * republish có thể đổi kết quả; khi đó fingerprint lệch → preview tự vô hiệu, không có
   * vùng xám thời gian.
   *
   * Auto-Pilot BẮT BUỘC so fingerprint với kết quả hiện tại của draw trước khi dùng.
   */
  resultFingerprint: string;

  /** ─── Tiến độ quét (preview chạy nhiều nhịp cho kỳ nhiều entry) ─── */

  /**
   * Cursor `_id` của entry cuối đã cộng. `null` = chưa quét gì.
   * Nhịp sau tiếp tục từ đây qua `getEntriesForStatsAfter`.
   */
  lastEntryId: string | null;
  /**
   * `true` = đã quét hết entries của kỳ, số liệu ĐỦ để ra quyết định.
   *
   * HARD-CODED: `complete === false` thì Auto-Pilot KHÔNG được dùng doc này, dù mọi
   * ngưỡng đều thoả. Số liệu dở dang luôn nhỏ hơn số thật ⇒ mọi ngưỡng đều "an toàn" ⇒
   * fail-open. Đây là bẫy nguy hiểm nhất của thiết kế này.
   */
  complete: boolean;
  /** Số entries đã cộng vào tally. */
  entriesScanned: number;

  /** ─── Số tiền thật (chỉ có nghĩa khi `complete === true`) ─── */
  financials: KenoSettlePreviewFinancials;
  /** Chi tiết cap 3 bậc 8/9/10. */
  caps: KenoSettlePreviewCaps;
  /** Payout lớn nhất của một entry đơn lẻ (VND) — sau cap. */
  topEntryPayout: number;
  /** `entryId` của entry ở `topEntryPayout` — để staff mở xem ngay. */
  topEntryId: string | null;

  /** ─── Tự kiểm chứng — điền SAU khi settle thật xong ─── */
  verification?: KenoSettlePreviewVerification;

  /** Thời điểm bắt đầu tính (nhịp đầu). */
  startedAt: Date;
  /** Thời điểm cập nhật gần nhất. */
  updatedAt: Date;
  /** Thời điểm `complete` chuyển thành true. */
  completedAt?: Date;
}

/** Số tiền của kỳ, tính từ kết quả đã publish. Mọi giá trị VND. */
export interface KenoSettlePreviewFinancials {
  /** Tổng tiền cược. Σ(entry.amount). Cùng định nghĩa `SettleDrawReport.totalStake`. */
  totalStake: number;
  /** Tổng tiền phải trả, ĐÃ áp cap. Σ(entry payout sau cap). */
  totalPayout: number;
  /** Tổng tiền phải trả TRƯỚC cap — để thấy cap đã cắt bao nhiêu. */
  totalPayoutBeforeCaps: number;
  /** Tổng hoa hồng đại lý. Σ(entry.tenant.commissionAmount). */
  totalCommission: number;
  /** Gross Gaming Revenue = totalStake - totalPayout. CÓ THỂ ÂM. */
  ggr: number;
  /** Lợi nhuận ròng = ggr - totalCommission. CÓ THỂ ÂM. Đây là bottom-line. */
  netProfit: number;
  /**
   * Tỷ lệ trả thưởng = totalPayout / totalStake.
   *
   * Chỉ số ngành trực tiếp (payout ratio / actual RTP của kỳ). Đối chiếu được với RTP lý
   * thuyết tính từ `rules/odds.ts` ⇒ hiệu chuẩn ngưỡng có căn cứ, không phải đoán.
   * `totalStake === 0` → 0 (không chia cho 0).
   */
  payoutRatio: number;
  /** Số entry trúng (payout > 0). */
  winningEntryCount: number;
}

/** Trạng thái cap của 3 bậc cappable. */
export interface KenoSettlePreviewCaps {
  pick8: KenoSettlePreviewCapTier;
  pick9: KenoSettlePreviewCapTier;
  pick10: KenoSettlePreviewCapTier;
}

/** Chi tiết cap 1 bậc. */
export interface KenoSettlePreviewCapTier {
  /**
   * Số BỘ trúng trọn bậc = số BOARD có `matchCount === pickCount`.
   *
   * Đếm theo BOARD, KHÔNG theo `betCount` — khớp `aggregateTopPrizeWinnerCounts`
   * (`entry-repo.ts:435-461`, `$sum: 1` sau `$unwind`). Đếm theo `betCount` sẽ làm
   * `calculateCappedPrize` chia tiền hai lần (xem `p2-04a` §4).
   */
  winnerCount: number;
  /** Σ `betCount` của các board trúng trọn bậc — để nhân lại giải per-unit. */
  betCountSum: number;
  /** Ngưỡng từ config: `payoutCaps.pickNMaxSetsForFixed`. */
  maxSetsForFixed: number;
  /** `true` khi `winnerCount > maxSetsForFixed` ⇒ giải chuyển sang chia đều. */
  capTriggered: boolean;
  /** Giải per-unit áp dụng thực tế (VND): giải cố định, hoặc đã chia đều. */
  effectiveUnitPrize: number;
}

/**
 * Đối chiếu preview với settle thật — LƯỚI AN TOÀN QUAN TRỌNG NHẤT của thiết kế.
 *
 * Mỗi kỳ settle thật xong đều tự động chấm điểm preview. `delta !== 0` MỘT LẦN là bằng
 * chứng engine preview lệch khỏi settle thật ⇒ tắt Auto-Pilot kết sổ ngay, không chờ điều
 * tra xong. Đây là thứ mà cách tiếp cận proxy KHÔNG THỂ có (proxy không có đáp án đúng).
 */
export interface KenoSettlePreviewVerification {
  /** `draw.financial.totalPrizes` sau settle thật (VND). */
  actualTotalPayout: number;
  /** `preview.financials.totalPayout - actualTotalPayout`. PHẢI = 0. */
  delta: number;
  /** `true` khi `delta === 0`. Query index để đếm nhanh số kỳ lệch. */
  matched: boolean;
  /** Thời điểm đối chiếu. */
  verifiedAt: Date;
}

export const KENO_SETTLE_PREVIEWS = "keno_settle_previews";
```

### 1.1 Index

| Index | Mục đích |
|---|---|
| `{ drawId: 1 }` **unique** | Upsert theo kỳ, đọc 1 doc |
| `{ complete: 1, updatedAt: 1 }` | Worker tìm preview dở dang cần tiếp tục |
| `{ "verification.matched": 1, updatedAt: -1 }` | Đếm/alert kỳ lệch (sparse — chỉ doc đã verify) |

**Không TTL.** Preview là bằng chứng đối chiếu, giữ lại để chứng minh engine đúng qua thời gian.
Doc rất nhỏ (~1KB), một năm Keno ~35k doc ⇒ không đáng lo. Nếu cần dọn thì làm ở plan riêng sau
khi có số liệu thật về dung lượng.

## 2. `ComputeSettlePreviewUseCase` — tính, resume được, không ghi entries

**File:** `packages/game-keno-application/src/use-cases/operations/compute-settle-preview.ts`

```typescript
/**
 * Tính "kết sổ thử" cho 1 kỳ đã Published — số tiền phải trả CHÍNH XÁC, KHÔNG ghi entries.
 *
 * CHỈ ĐỌC entries. Ghi duy nhất vào `keno_settle_previews`. Không chạm `keno_ticket_entries`,
 * không chạm `keno_draws`, không gọi settle pipeline.
 *
 * RESUME-ABLE: kỳ nhiều entry cần nhiều nhịp Lambda. Cursor `lastEntryId` + tally luỹ tiến
 * lưu ngay trong preview doc ⇒ nhịp sau tiếp tục, không tính lại từ đầu.
 *
 * IDEMPOTENT theo `resultFingerprint`: kết quả kỳ đổi (republish) → fingerprint lệch → xoá
 * tally cũ, tính lại từ đầu. Cùng fingerprint → cộng tiếp, không cộng trùng (cursor `_id`
 * là watermark tin cậy vì entries insert-only).
 *
 * DETERMINISTIC: cùng entries + cùng kết quả + cùng config → cùng số tiền. Không random,
 * không phụ thuộc thứ tự batch (phép cộng giao hoán; cap tính ở bước chốt từ 2 con số luỹ tiến).
 */
export class ComputeSettlePreviewUseCase extends UseCase<ComputeSettlePreviewInput, ComputeSettlePreviewOutput>
```

### 2.1 Luồng

```
1. Đọc draw. Không phải Published → return { skipped: "NotPublished" }
2. fingerprint = hashResult(draw.result.winningNumbers)
3. Đọc preview hiện có:
     - không có                     → tạo mới, tally = 0, cursor = null
     - có, fingerprint KHỚP, complete → return { skipped: "AlreadyComplete" }
     - có, fingerprint KHỚP, dở dang  → nạp tally + cursor, tiếp tục
     - có, fingerprint LỆCH           → RESET: tally = 0, cursor = null, fingerprint mới
4. Đọc GameConfig (bảng giải + payoutCaps) — 1 lần, dùng cho cả phiên
5. WHILE còn thời gian VÀ còn entries:
     entries = getEntriesForStatsAfter(drawId, cursor, 500)
     nếu rỗng → complete = true, break
     mỗi entry:
       tally.totalStake      += entry.amount
       tally.totalCommission += entry.tenant.commissionAmount ?? 0
       comp = computeEntryPayout(entry.entrySummary.boards, result, prizes)   ← p2-04a
       tally.payoutBeforeCaps += comp.winAmount
       cho mỗi cb của comp.cappableBoards:
         tally.caps[cb.pickCount].winnerCount += 1              ← đếm BOARD
         tally.caps[cb.pickCount].betCountSum += cb.betCount
         tally.caps[cb.pickCount].uncappedSum += fixedPrize × cb.betCount
       theo dõi topEntry (winAmount trước cap + entryId)
       nếu comp.winAmount > 0 → tally.winningEntryCount += 1
     cursor = _id entry cuối
     ghi tally + cursor vào preview doc (upsert)        ← crash-safe từng batch
6. Nếu complete → applyCapsToTally() → tính financials → ghi doc với complete = true
```

### 2.2 Áp cap từ tally — 1 lượt quét là đủ

Ban đầu tưởng phải quét 2 lần (lượt 1 đếm `winnerCount`, lượt 2 điều chỉnh từng board). Không cần:
`calculateCappedPrize` trả giải **per-unit** giống nhau cho mọi bộ trúng cùng bậc, nên tổng tiền
bậc đó chỉ cần **2 con số luỹ tiến**.

```typescript
/**
 * Chốt cap từ tally luỹ tiến. PURE.
 *
 * Với mỗi bậc N ∈ {8,9,10}:
 *   winnerCount ≤ maxSetsForFixed → giải per-unit = fixedPrize (không cap)
 *   winnerCount > maxSetsForFixed → giải per-unit = calculateCappedPrize(...)
 *   tổng tiền bậc N = effectiveUnitPrize × betCountSum
 *
 * `× betCountSum` (không phải `× winnerCount`) vì `calculateCappedPrize` trả per-unit rồi
 * mới nhân `betCount` — đúng như `apply-payout-caps.ts:169-176` làm cho từng board.
 *
 * totalPayout = payoutBeforeCaps - Σ(uncappedSum bậc bị cap) + Σ(tiền mới bậc bị cap)
 */
function applyCapsToTally(tally: PreviewTally, config: CapConfig): CapResult;
```

`uncappedSum` (Σ `fixedPrize × betCount` của các board trúng trọn) được cộng dồn trong lượt quét
để bước chốt biết **trừ ra bao nhiêu** khỏi `payoutBeforeCaps` — không cần đọc lại entries.

> **Chỗ dễ sai:** `topEntryPayout` theo dõi trong lượt quét là **trước cap**. Nếu bậc đó bị cap,
> giá trị này cao hơn thực tế. Xử lý: khi `capTriggered` ở bất kỳ bậc nào, đặt
> `topEntryPayout = null` kèm `capTriggered = true` — và hard-code Auto-Pilot **luôn chờ người**
> khi có cap (§5). Không cố ước lượng lại top entry sau cap; kỳ có cap là kỳ bất thường, để người xem.

### 2.3 Vì sao dùng `getEntriesForStatsAfter`, KHÔNG dùng `getScheduledEntries`

| Method | Dùng được? |
|---|---|
| `getScheduledEntries` (`entry-repo.ts:85`) | **KHÔNG.** Chỉ có `limit`, **không cursor**. Settle thật tiến được vì mỗi batch đổi `status` sang `settled`. Preview không ghi DB ⇒ gọi lặp trả **cùng batch mãi mãi** ⇒ vòng lặp vô tận, Lambda cháy timeout. |
| `getEntriesForStatsAfter` (`entry-repo.ts:118`) | **CÓ.** Cursor `_id`, sort `_id: 1`, index `idx_draw_id` (`{ drawId: 1, _id: 1 }`) index-only. Projection đã có **đúng đủ**: `amount`, `tenant.commissionAmount`, `entrySummary.boards`. Loại `status: Void` tại nguồn. |

**Không cần thêm repo method đọc nào.** Chỉ cần thêm repo cho collection preview.

Lưu ý khác biệt phạm vi cần ghi vào JSDoc: `getEntriesForStatsAfter` loại `Void` nhưng **không**
lọc theo `status: Scheduled` — nó lấy cả `Settled`. Với preview điều này **đúng và cần thiết**: kỳ
đã settled vẫn tính được preview (dùng cho backfill §7). Số tiền không phụ thuộc `status`.

## 3. Chi phí và giới hạn

`stats-accumulator` có `MAX_ENTRIES_PER_DRAW_PER_TICK = 20_000` ⇒ quy mô entry/kỳ có thể lớn.

| Hạng mục | Con số |
|---|---|
| Batch | 500 entries (giống settle thật) |
| 20k entries | 40 round-trip, projection mỏng, index-only ⇒ trong tầm 1 nhịp Lambda |
| Time budget | `MAX_EXECUTION_MS = 3 phút` (ngắn hơn settle vì đây là job nền, không gấp) |
| Ghi DB | 1 upsert / batch (~40 write cho kỳ 20k) — nhỏ |

Hết budget → ghi tally + cursor, `complete = false`, return. Nhịp cron sau tiếp tục.

## 4. Worker: cron riêng, độc lập với settle

**File:** `apps/worker-keno/src/handlers/operations/compute-settle-previews.ts`

```
EventBridge cron (mỗi 2 phút)
   ↓
Lambda: computeSettlePreviewsHandler
   ↓
1. Tìm kỳ cần preview:
     - status = Published
     - CHƯA có preview complete với fingerprint hiện tại
   ↓ (tối đa N kỳ/nhịp, ưu tiên preview dở dang trước kỳ mới)
2. Mỗi kỳ: ComputeSettlePreviewUseCase
```

**`serverless.yml`:** `cron(*/2 * * * ? *)`, timeout 300s, **không** đặt trong `settle.yml` — file
riêng `previews.yml` để rõ ràng đây không phải phần của settle pipeline.

**Distributed lock per-draw** khi tính preview: hai nhịp cron chồng nhau trên cùng kỳ sẽ cộng trùng
(cả hai đọc cùng cursor, cả hai cộng cùng batch). Dùng cùng cơ chế lock mà `p2-02` auto-open dùng.

> **Chọn nhịp 2 phút, không 10 phút:** preview phải sẵn sàng **trước** khi Auto-Pilot kết sổ chạy.
> Nếu preview chậm hơn `settleDelayMinutes` thì Auto-Pilot luôn thấy `complete = false` và bỏ qua
> mọi kỳ ⇒ Auto-Pilot không bao giờ hoạt động. **Ràng buộc phải kiểm khi hiệu chuẩn:**
> `settleDelayMinutes` phải lớn hơn thời gian preview hoàn tất ở kỳ đông nhất (p95), có margin.

## 5. Vòng tự kiểm chứng — phần giá trị nhất

### 5.1 Đối chiếu tự động sau settle thật

**KHÔNG chèn vào settle pipeline** (ràng buộc §0.3). Làm bằng worker riêng:

**File:** `apps/worker-keno/src/handlers/operations/verify-settle-previews.ts`, cron mỗi 5 phút.

```
1. Tìm preview có complete = true, verification = null, mà draw đã Settled
2. Đọc draw.financial.totalPrizes  (settle thật đã ghi)
3. delta = preview.financials.totalPayout - actualTotalPayout
4. Ghi verification { actualTotalPayout, delta, matched: delta === 0, verifiedAt }
5. delta !== 0  →  tạo ops alert severity Critical
```

### 5.2 Alert type mới

Thêm vào `KenoOpsAlertType` (`game-keno/entities/enums.ts`, theo `code-quality-standards.mdc` §5.3
— `const object as const`):

```typescript
/** Kết sổ thử lệch khỏi settle thật. Bằng chứng engine preview có bug. */
SettlePreviewMismatch: "settle_preview_mismatch",
```

Severity **Critical**, hardcoded, **không cấu hình được**, **không** nằm trong `exemptTypes` của
`alertPolicy`. Lý do: alert này không nói "kỳ này rủi ro" — nó nói "**máy đang tính sai tiền**".
Không có lý do hợp lệ nào để miễn trừ nó.

### 5.3 Kill switch tự động

**`p2-04` PHẢI hard-code:** có bất kỳ `SettlePreviewMismatch` chưa `Resolved` trong 7 ngày gần nhất
⇒ Auto-Pilot kết sổ **dừng toàn bộ**, không phụ thuộc `config.enabled`.

Đây là điều kiện hard-coded, không phải ngưỡng cấu hình. Preview lệch một lần nghĩa là **mọi**
quyết định trước đó cũng đáng nghi.

> **Ranh giới cần hiểu rõ:** `delta === 0` chứng minh preview **khớp settle thật**, không chứng minh
> **settle thật đúng**. Nếu `computeEntryPayout` sai thì cả hai sai giống nhau và delta vẫn 0. Vòng
> kiểm chứng này bắt lỗi **lệch giữa hai đường** (cap tính sai, bỏ sót entry, cộng trùng, đọc thiếu
> tenant) — chứ không bắt lỗi công thức gốc. Đúng công thức gốc là việc của test `p2-04a` §5.

## 6. Điều kiện dùng preview — hard-coded ở `p2-04`

Kể cả khi mọi ngưỡng đều thoả, Auto-Pilot **KHÔNG** được settle nếu:

| Điều kiện | Lý do |
|---|---|
| Không có preview doc | Chưa tính ⇒ không có căn cứ |
| `complete === false` | Số dở dang luôn **nhỏ hơn** số thật ⇒ mọi ngưỡng đều "an toàn" ⇒ **fail-open**. Bẫy nguy hiểm nhất. |
| `resultFingerprint` ≠ hash kết quả hiện tại của draw | Preview tính theo kết quả cũ (đã republish) |
| Bất kỳ `caps[*].capTriggered === true` | Nhánh cap là nhánh logic rủi ro nhất, và kỳ có cap là kỳ bất thường ⇒ luôn để người xem |
| Có `SettlePreviewMismatch` chưa resolved trong 7 ngày | §5.3 |
| `financials.totalStake === 0` | Kỳ không có cược ⇒ không cần tự động, để người xử lý |

Sáu điều kiện này **không có công tắc tắt**. Chúng ở tầng khác với ngưỡng cấu hình.

## 7. Backfill — hiệu chuẩn ngưỡng trong ~1 ngày thay vì 2 tuần

Preview chạy được trên **kỳ đã settled trong quá khứ**: kết quả có, entries có (`status: Settled`,
`getEntriesForStatsAfter` không lọc theo status — §2.3), `draw.financial` có sẵn làm đáp án.

**Script:** `apps/worker-keno/src/scripts/backfill-settle-previews.ts` (chạy tay, không cron).

Chạy trên 30 ngày lịch sử cho **hai kết quả cùng lúc**:

**(a) Chứng minh engine đúng.** `delta === 0` trên hàng nghìn kỳ thật, đủ mọi hình thái cược, là
bằng chứng mạnh hơn nhiều so với vài chục test case viết tay. Bất kỳ `delta ≠ 0` nào **phải điều
tra xong trước khi** `p2-04` được merge — không được bỏ qua như "ngoại lệ lịch sử".

**(b) Phân bố `payoutRatio` thật ngay lập tức.** Có p50/p90/p95/p99/max thật ⇒ chọn
`maxPayoutRatio` có căn cứ. Đối chiếu thêm với RTP lý thuyết tính từ `rules/odds.ts` — nếu p50 lệch
xa RTP lý thuyết thì hoặc bảng giải cấu hình khác thiết kế, hoặc engine sai; cả hai đều phải hiểu
trước khi bật.

Đây là điều **cách proxy không làm được**: proxy không có đáp án đúng nên buộc phải quan sát tiến
về phía trước 2 tuần. Số tiền thật đối chiếu ngược được về quá khứ.

**Backfill KHÔNG được ghi `verification` với `matched: false` mà không tạo alert** — dùng cùng đường
§5.1 để mọi lệch đều nổi lên, không im lặng nằm trong DB.

## 8. Test

**File:** `packages/game-keno-application/src/use-cases/operations/compute-settle-preview.test.ts`

### 8.1 Đúng số tiền

| Case | Kỳ vọng |
|---|---|
| 3 entry, không ai trúng | `totalPayout: 0`, `payoutRatio: 0`, `ggr = totalStake`, `winningEntryCount: 0` |
| Kỳ có vé trúng nhiều bậc + side bet | `totalPayout` = Σ tay tính ra; `payoutRatio` đúng |
| `totalStake = 0` (không cược) | `payoutRatio: 0`, **không** NaN/Infinity |
| `payout > stake` (kỳ lỗ) | `ggr` ÂM, `netProfit` ÂM, **không** clamp về 0 |
| `tenant.commissionAmount` thiếu ở vài entry | Coi 0, không NaN |

### 8.2 Cap — nhóm dễ sai nhất

| Case | Kỳ vọng |
|---|---|
| pick8: 50 bộ (= `maxSetsForFixed`) | `capTriggered: false`, per-unit = giải cố định |
| pick8: 51 bộ (vượt 1) | `capTriggered: true`, per-unit = `calculateCappedPrize(...)`; `totalPayout` = `payoutBeforeCaps - uncappedSum + newSum` |
| pick8 bị cap, pick9 không | Chỉ bậc 8 đổi; bậc 9 nguyên giải cố định |
| Board trúng trọn có `betCount = 3` | `winnerCount += 1` (**không** += 3), `betCountSum += 3`; tiền = per-unit × 3 |
| 1 entry có 2 board pick8 đều trúng trọn | `winnerCount += 2` |
| Bậc bị cap | `topEntryPayout: null`, không cố ước lượng lại |
| So sánh chéo | Với cùng dữ liệu, `winnerCount` khớp **chính xác** `aggregateTopPrizeWinnerCounts` |

### 8.3 Resume và fingerprint

| Case | Kỳ vọng |
|---|---|
| Ngắt sau batch 1, gọi lại | Tổng cuối **bằng** chạy liền một hơi (không cộng trùng, không thiếu) |
| Gọi lại khi `complete = true`, fingerprint khớp | Skip, **không** tính lại, số không đổi |
| Kết quả đổi (republish) | Reset sạch tally, tính lại từ đầu, fingerprint mới |
| Batch cuối < `BATCH_SIZE` | `complete = true`, `completedAt` được set |
| Kỳ 0 entry | `complete = true` ngay, mọi số = 0 |
| Hai lần chạy song song (không lock) | Test này **phải fail** nếu thiếu lock ⇒ chứng minh lock cần thật |

### 8.4 Ràng buộc "không ghi đâu khác" — bắt buộc có

| Case | Kỳ vọng |
|---|---|
| Sau khi chạy preview | `keno_ticket_entries` **không đổi 1 byte** (so snapshot trước/sau) |
| Sau khi chạy preview | `keno_draws` **không đổi**, `status` vẫn `Published` |
| Kỳ đang `Settling` (settle thật đang chạy) | Preview đọc được, **không** cản, **không** ghi gì vào entries |

Ba test này là **hàng rào cuối** cho ràng buộc §0.3. Không có chúng thì không có gì ngăn một
`bulkWrite` lạc tay lọt vào tương lai.

### 8.5 Verification

| Case | Kỳ vọng |
|---|---|
| Preview khớp settle thật | `delta: 0`, `matched: true`, **không** alert |
| Preview lệch | `matched: false`, alert `SettlePreviewMismatch` severity Critical |
| Draw chưa Settled | Không verify, `verification` vẫn null |
| Verify 2 lần cùng kỳ | Idempotent, không tạo alert trùng (dedupeKey theo drawId) |

## 9. Checklist

- [ ] **`p2-04a` đã merge** (`computeEntryPayout` tồn tại) — không bắt đầu trước điều này
- [ ] Entity `settle-preview.ts` + export barrel; JSDoc đủ mọi field (đơn vị VND, công thức)
- [ ] 3 index §1.1; **không** TTL
- [ ] Repo `settle-preview-repo.ts` — upsert overwrite, **không** `$inc` (`financial-reporting-system.mdc` §P2)
- [ ] `ComputeSettlePreviewUseCase` dùng `getEntriesForStatsAfter`, **không** `getScheduledEntries` (§2.3)
- [ ] `applyCapsToTally` là hàm **pure**, có test riêng
- [ ] Đếm `winnerCount` theo **BOARD** (`+= 1`), `betCountSum` riêng
- [ ] `capTriggered` bất kỳ bậc → `topEntryPayout = null`
- [ ] Ghi tally + cursor **mỗi batch** (crash-safe), không dồn đến cuối
- [ ] Distributed lock per-draw (§4)
- [ ] Worker cron 2 phút, file `previews.yml` riêng, **không** vào `settle.yml`
- [ ] Worker verify cron 5 phút; alert type `SettlePreviewMismatch` (Critical, không cấu hình)
- [ ] Script backfill; chạy 30 ngày; **mọi `delta ≠ 0` điều tra xong** trước khi merge `p2-04`
- [ ] Ghi lại phân bố `payoutRatio` (p50/p90/p95/p99/max) + đối chiếu RTP lý thuyết vào `p2-01`
- [ ] Đo thời gian preview hoàn tất ở kỳ p95 → chốt sàn cho `settleDelayMinutes` (§4)
- [ ] Test đủ 5 nhóm §8, **đặc biệt §8.4**
- [ ] Xác nhận bằng code review: **không** dòng nào ghi vào `keno_ticket_entries`/`keno_draws`
- [ ] **Không** sửa `settle.asl.json` / step function nào
- [ ] `pnpm check-types` + `pnpm lint` sạch

## 10. Rủi ro

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| **Dùng preview dở dang** (`complete: false`) ⇒ số nhỏ hơn thật ⇒ mọi ngưỡng "an toàn" ⇒ **fail-open** | **Cao nhất** | Hard-code §6; test §8.3; `complete` là field riêng biệt, không suy diễn từ `entriesScanned` |
| Cộng trùng do 2 nhịp cron chồng nhau | Cao | Lock per-draw; cursor `_id`; test §8.3 (chạy song song phải fail khi thiếu lock) |
| `winnerCount` đếm theo `betCount` ⇒ cap chia tiền 2 lần | Cao | JSDoc nói thẳng; test đối chiếu `aggregateTopPrizeWinnerCounts`; `p2-04a` §4 |
| Preview khớp settle nhưng **cả hai đều sai** công thức gốc | Trung bình | Ghi rõ ranh giới ở §5.3; đúng công thức gốc là việc của test `p2-04a` §5; backfill + đối chiếu RTP lý thuyết là lớp thứ hai |
| Preview chậm hơn `settleDelayMinutes` ⇒ Auto-Pilot không bao giờ chạy | Trung bình | Đo p95 và chốt sàn (§4); alert nếu preview tồn `complete: false` quá lâu |
| Có ai đó thêm ghi vào entries "cho tiện" trong tương lai | Trung bình | Test §8.4 so snapshot trước/sau; checklist review |
| `resultFingerprint` sai cách hash (không sort, hoặc gồm cả `bigCount`) ⇒ lệch giả | Thấp | Hàm hash pure có test; hash **chỉ** từ 20 số đã sort |
| Chi phí đọc entries mỗi 2 phút | Thấp | Chỉ đọc kỳ chưa complete; xong là dừng; projection mỏng index-only |
| Preview bị hiểu là số liệu tài chính chính thức | Thấp | JSDoc §1 ghi rõ; Hub UI phải nhãn "TẠM TÍNH", không đặt cạnh doanh thu đã chốt |

## 11. Phạm vi KHÔNG làm ở plan này

- **Không** đưa preview vào settle pipeline hay Step Functions.
- **Không** thêm `DrawStatus` mới, không sửa `VALID_TRANSITIONS`.
- **Không** dùng preview cho báo cáo tài chính (`keno_settle_draw_reports` vẫn là số chính thức).
- **Không** port sang Bingo 18 (đánh giá ở `p1-04`).
- **Không** tự sửa lệch `capSets` ở `stats-accumulator.ts` (backlog `p2-04a` §4).
- **Không** định nghĩa ngưỡng auto-settle ở đây — đó là `p2-01` §3.4, và rule engine là `p2-04`.



