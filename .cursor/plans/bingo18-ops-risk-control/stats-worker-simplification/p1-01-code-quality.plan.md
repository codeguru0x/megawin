# p1-01 — Code quality (dọn stale comment, type cast, dead field)

> **Feature:** bingo18-ops-risk-control / stats-worker-simplification
> **Phase:** P1 · **Phụ thuộc:** p0-02 (Q1 rà JSDoc CẢ 2 use case sau tách)
> **Nguồn:** analysis §5.7-5.8 · **Bản chuẩn Keno:** `keno-.../p1-01-keno-stats-code-quality`
> **Trạng thái:** Code ⏳ · Review & rủi ro ⏳

## 1. Mục tiêu 1 câu

Dọn sạch tàn dư mô hình cũ trong comment/type/field sau khi P0 đổi kiến trúc — KHÔNG đổi hành vi; đảm bảo comment mô tả ĐÚNG code mới (comment sai còn tệ hơn không có — code-quality §4).

## 2. Danh mục việc (Q1-Q3) — KHÔNG có Q4

Keno p1-01 có Q4 "gỡ alert `worker_stuck`". **Bingo 18 KHÔNG có Q4** — grep xác nhận `worker_stuck` KHÔNG tồn tại trong `packages/game-bingo18*` (chưa từng thêm). Sức khoẻ worker dùng `stalledItems` của worker-core (đã ADD ở p0-01/p0-02 `recordStalledItem`/`clearStalledItem`). KHÔNG hồi sinh alert type mới (overview §4).

| # | Việc | File | Bản chất |
|---|---|---|---|
| Q1 | Comment stale `recomputeFull`/`seed`/`recompute...` | handler + accumulator + sync/alert worker JSDoc | mô tả mô hình cũ đã xoá |
| Q2 | `{...rest} as Entity` mapper | `betting-stats-mapper.ts` | đã vá ở p0-04 I2 — Q2 chỉ VERIFY |
| Q3 | `byPlayType.*.entries` nếu UI không render | kiểm UI → cân nhắc giữ/xoá | field xấp xỉ có thể dead |

## 3. Chi tiết

### Q1 — comment stale (rà sau p0-02)

Grep `recomputeFull|recomputeClosedDraws|POST_CLOSE|seed lại|salesClosed.*recompute|recompute.*chính xác` trong:
- `apps/worker-bingo18/src/handlers/stats/stats-sync.ts` dòng 12-13 ("seed lại và tiếp tục. `recomputeFull` lúc salesClosed sửa chính xác tuyệt đối") → thay bằng mô tả watermark per-doc + đóng sổ terminal+drained. (Nếu p0-01 F6 đã sửa → Q1 chỉ verify.)
- `stats-accumulator.ts` — JSDoc đầu file (dòng 7-14 "Vì sao cộng dồn RAM + overwrite thay vì `$inc`", dòng 12-14 "recomputeFull lúc salesClosed") — viết lại cho mô hình delta-only.
- 2 use case worker (`sync-betting-stats.ts` + `evaluate-ops-alerts.ts`) — JSDoc mô tả đúng: hàng đợi `final:false`, delta `$inc`, tách alert. (Đa phần đã viết mới ở p0-01/p0-02 — Q1 rà lại tổng thể sau khi CẢ 2 tồn tại.)

> **Ngoại lệ review #Q1-a — KHÔNG chỉ xoá, phải SỬA cho khớp code mới (code-quality §4):** comment mô tả hành vi cũ mà xoá trắng = mất ngữ cảnh; viết lại mô tả hành vi mới. Reviewer đọc từng JSDoc đối chiếu code.

> **Ngoại lệ review #Q1-b — rà SAU p0-02:** cả 2 use case phải tồn tại mới rà chéo được (sync trỏ "alert ở EvaluateOpsAlertsUseCase", alert trỏ "sync ở SyncBettingStatsUseCase"). Làm Q1 trước p0-02 = mô tả nửa vời.

### Q2 — mapper cast (verify)

p0-04 I2 đã thay `{...rest} as Entity` → field-explicit `satisfies`. Q2 chỉ VERIFY: grep `as Bingo18DrawBettingStatsEntity` + `\.\.\.rest` trong mapper → 0. Nếu p0-04 chưa làm (đảo thứ tự) → làm ở đây.

### Q3 — `byPlayType.*.entries` (kiểm UI)

`Bingo18BucketStat.entries` là xấp xỉ (mỗi board-hit +1, comment betting-stats.ts dòng 49). Kiểm UI ops có render `entries` per-bucket không:
- `rg "\.entries" apps/backoffice/src/app/\(main\)/games/bingo18/operations` + adapters.
- Nếu KHÔNG render → cân nhắc xoá field `entries` khỏi `Bingo18BucketStat` (giảm `$inc` 1 path/bucket × D). NHƯNG: `evaluate-alerts.ts` bucket_concentration payload có `entries: bucket.entries` (dòng 166) → CÒN dùng. **Kết luận sơ bộ: GIỮ `entries`** (alert payload cần). Q3 chỉ xác nhận không dead, KHÔNG xoá nếu còn dùng.

> **Ngoại lệ review #Q3-a — `entries` CÒN dùng ở alert payload:** đừng vội xoá theo mẫu Keno. Bingo 18 `bucket_concentration` đính `entries` vào payload. Chỉ xoá nếu grep chứng minh 0 consumer (UI + alert + dto). Mặc định GIỮ.

## 4. `tickSeconds` GIỮ 10s (đã chốt)

User chốt §6 Q4: KHÔNG giảm `tickSeconds`. Bingo 18 kỳ 6 phút, alert trễ ≤2 tick ≈20s thừa an toàn. p1-01 KHÔNG đụng `DEFAULT_BINGO18_CONFIG.ops.stats.tickSeconds`. Ghi ở đây để reviewer không "tối ưu" giảm xuống.

## 5. Đánh giá & verify

1. `pnpm --filter @megawin/game-bingo18-application check-types` + worker-bingo18 + backoffice.
2. Grep stale: `rg "recomputeFull|recomputeClosedDraws|POST_CLOSE|upsertFull|\.seed\(" packages/game-bingo18* apps/worker-bingo18` → 0 (trừ file plan).
3. Grep `worker_stuck` trong bingo18 → 0 (xác nhận KHÔNG thêm mới).
4. Grep `as Bingo18DrawBettingStatsEntity` mapper → 0.
5. Đọc "Ngoại lệ review Q1/Q3".

## 6. Review code & rủi ro

- [ ] **#1 — comment khớp code:** mọi JSDoc mô tả đúng mô hình `$inc`/tách alert? KHÔNG còn "recompute/seed/salesClosed"?
- [ ] **#2 — KHÔNG đổi hành vi:** Q1-Q3 thuần dọn — 0 thay đổi logic. Diff chỉ comment/type/dead field.
- [ ] **#3 — KHÔNG thêm worker_stuck:** dùng stalledItems worker-core (đã có p0-01/02)?
- [ ] **#4 — entries không xoá nhầm:** còn dùng ở alert payload → GIỮ?
- [ ] **#5 — tickSeconds 10s:** KHÔNG đổi?
- [ ] **#6 — mapper explicit:** `satisfies`, không `as`/spread?

## 7. Sau khi hoàn thành

- Cập nhật `00-overview.md` (p1-01 done).
- Cập nhật analysis nguồn §7 "Plans phái sinh" (mọi plan done).
- Cập nhật `../00-overview.md` (feature bingo18-ops-risk-control) trỏ tới thư mục này.
- Cập nhật p2-01 guide Keno (ghi Bingo 18 đã port).
- Chạy ổn ~1 tuần → port Max 3D → Max 3D Pro (analysis §6 Q5).
