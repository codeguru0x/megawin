# Bingo 18 Stats Worker Simplification — Master Plan (00-overview)

> **Nguồn:** `.cursor/analysis/bingo18-stats-worker-simplification.analysis.md` (status `approved`, mọi câu hỏi mở ĐÃ CHỐT 03/08/2026 — §6).
> **Bản chuẩn (đã merge + review):** `.cursor/plans/keno-ops-risk-control/stats-worker-simplification/` — Keno là bản đã "trả phí" cho mọi bug; port này **áp PATTERN Keno**, KHÔNG copy diff mù (guide `p2-01-port-guide-bingo18-max3d-max3dpro.md`).
> **Điều kiện tiên quyết đã có sẵn trong code:**
> - `worker-core` đã tái cấu trúc (`.cursor/plans/worker-core-usecase-restructure/`, `done`): `TickLoopWorker`/`SingleRunWorker` import từ `@megawin/worker-core/workers`; `recordStalledItem`/`clearStalledItem` là API subclass (composition qua `StalledItemTracker`).
> - `system-worker-health/p0-01` (base method) + `p0-02` (Keno gỡ `worker_stuck`) đã merge → Bingo 18 **KHÔNG** hồi sinh `worker_stuck`.

Feature này gộp **2 bước tiến hoá** mà Keno làm rời (p2-01 scale-hardening + simplification) thành 1 lần port cho Bingo 18: chuyển mô hình ghi `$set` full-doc → `$inc` delta, tách worker sync/alert, đóng sổ drained+terminal, normalize shape ở mapper phía đọc, tách `bingo18_draw_account_stats`, dọn code quality. Bingo 18 là **ứng viên sạch nhất** cho hướng này (doc nhỏ 38 bucket cố định, KHÔNG combo/pair, chỉ 1 collection phụ tuỳ chọn) NHƯNG **quay nhanh nhất hệ thống** (~6 phút/kỳ, ~160 kỳ/ngày → D lớn nhất 4 game) nên mọi chi phí per-tick × D phải cân nhắc kỹ.

## Bối cảnh: Bingo 18 = Keno PRE-refactor (analysis §3)

Bingo 18 đang ở mô hình `$set` full-doc + recompute + alert inline. Bằng chứng đối chiếu Keno-đích (analysis §3 bảng H1–H11):

| # | Điểm | Bingo 18 hiện tại | Keno đích |
|---|---|---|---|
| H1 | Ghi | `upsertFull` = `$set` toàn doc mỗi tick | `applyDelta` `$inc` path + `$set lastEntryId` cùng lệnh |
| H2 | Accumulator | `seed()` baseline + cộng dồn full state RAM | Delta-only, KHÔNG seed |
| H3 | Safety-net | `recomputeClosedDraws` + `POST_CLOSE_STATUSES` | XOÁ — 1 thuật toán, đóng sổ drained+terminal |
| H4 | Hàng đợi | `getUnfinishedDraws([SalesOpen])` + recompute status | `findNotFinal()` trên stats doc |
| H5 | Alert | `evaluateDrawAlerts` inline trong `syncOpenDraws` (write path) | Worker `ops-alerts` riêng, cursor `updatedAt` |
| H6 | Tick loop | Copy thủ công `while(deadline)` trong use-case | `extends TickLoopWorker` (worker-core) |
| H7 | try/catch per-draw | KHÔNG — 1 kỳ lỗi sập cả invocation | try/catch per-draw + trần entries/kỳ/tick |
| H8 | repo | Chỉ `getByDrawId`/`getManyByDrawIds`/`upsertFull` | + `findNotFinal`/`applyDelta`/`ensureDocs`/`stampFinal` |
| H9 | Index | `{drawId:1}` unique; thiếu `{updatedAt:1}` | + `{updatedAt:1}` (alert cursor) |
| H10 | `topAccounts` | Field `@deprecated` in-doc → drift | Tách `*_draw_account_stats` `$inc` |
| H11 | handler JSDoc | Nhắc `recomputeFull` (comment stale — method thật `recomputeClosedDraws`) | JSDoc mô tả đúng watermark + đóng sổ |

**ĐÚNG sẵn — GIỮ NGUYÊN khi port** (analysis §3): watermark per-draw (`acc.lastEntryId`); conditional write (chỉ ghi khi có delta); `getEntriesForStatsAfter` loại `status:Void` tại nguồn + projection + limit; exposure 216 tính ở tầng đọc (`computeBingo18Exposure`, KHÔNG lưu doc); `finalize-void` KHÔNG chạm stats; `evaluateBingo18Alerts` là **pure function** (chỉ đổi caller sang worker riêng).

## Bảng trạng thái

Tách 2 cột trạng thái độc lập: **Code** (implement theo mô tả plan, trừ mục "Review & rủi ro") và **Review & rủi ro** (chạy checklist rủi ro + verify của từng plan — task riêng SAU KHI code xong).

| Plan | Phase | Code | Review & rủi ro | Phụ thuộc | Ghi chú |
|---|---|---|---|---|---|
| p0-01-port-inc-model | P0 | ⏳ pending | ⏳ pending | — | `applyDelta` `$inc` 38 bucket + bỏ `seed()` + **xoá `recomputeClosedDraws`** + `findNotFinal`/`ensureDocs`/`stampFinal` + `extends TickLoopWorker` + `recordStalledItem`/`clearStalledItem` + `description`. GỘP luôn "refactor sync worker extends TickLoopWorker" (base đã có sẵn — guide §2). |
| p0-02-split-ops-alerts-worker | P0 | ⏳ pending | ⏳ pending | p0-01 | Worker mới `bingo18:ops-alerts` (cursor `updatedAt`) + `findChangedSince` + index `{updatedAt:1}` + yml 2 function + `description`. Bỏ nhánh combo (Bingo 18 không có). |
| p0-03-account-stats-collection | P0 | ⏳ pending | ⏳ pending | p0-01 (accumulator + writeBatch) | Tách `bingo18_draw_account_stats` (`$inc`, index `{drawId:1, amount:-1}`, TTL 90d) + drain delta per-account + `get-ops-snapshot` derive topAccounts + xoá `topAccounts` khỏi entity. |
| p0-04-minimal-docs-read-defaults | P0 | ⏳ pending | ⏳ pending | p0-01 (enroll cần `beforeLoop`) | `ensureDocs` chỉ `$setOnInsert {final,updatedAt}` + mapper normalize 38 bucket phía đọc + enroll 1 lần/invocation. |
| p1-01-code-quality | P1 | ⏳ pending | ⏳ pending | p0-02 (Q1 rà JSDoc sau tách) | Q1 comment stale (`recomputeFull` ở handler) · Q2 vá `{...rest} as Entity` mapper · Q3 kiểm UI → xoá `byPlayType.*.entries` nếu không render · `tickSeconds` GIỮ 10s (đã chốt). ~~Q4 alert worker_stuck~~ **KHÔNG làm** (dùng `stalledItems` của worker-core). |

Status: ⏳ pending · 🔨 in-progress · ✅ done · ⏸️ blocked.
Cột **Review & rủi ro** chỉ chuyển ✅ sau khi chạy đủ mục "Đánh giá & verify" + "Review code & rủi ro" của plan đó (task riêng, không làm cùng lúc với code).

## Nợ vận hành (KHÔNG phải defect code) — bắt buộc làm TRƯỚC khi deploy

- **Tạo index `{ updatedAt: 1 }`** (`idx_updatedAt`) trên `bingo18_draw_betting_stats` **thủ công trên Atlas** (repo khai trong `packages/game-bingo18/src/indexes/index.ts` nhưng KHÔNG có runner — xem comment `mongodb.mdc` §7.4) rồi mới deploy function `ops-alerts`. Deploy trước khi tạo index ⇒ COLLSCAN mỗi tick (p0-02 rủi ro #1).
- **Tạo index `{ drawId: 1, accountId: 1 }` unique + `{ drawId: 1, amount: -1 }` + TTL `{ createdAt: 1 }` 90d** trên `bingo18_draw_account_stats` (p0-03) TRƯỚC khi deploy worker sync bản mới ghi collection này.
- `topAccounts` (analysis H10) xoá THẬT ở p0-03: doc kỳ cũ mang mảng top-K tự hết hạn (không backfill), kỳ mới dùng collection phụ.

## Thứ tự phụ thuộc

```
p0-01 (port $inc model — gate cho mọi thứ)
  ├──► p0-02 (alert worker mới extends TickLoopWorker; cần findChangedSince + updatedAt bump)
  ├──► p0-03 (drain account delta trong writeBatch; cần accumulator delta-only của p0-01)
  └──► p0-04 (enroll 1 lần/invocation cần hook beforeLoop; mapper normalize cần ensureDocs tối giản)

p1-01 sau p0-02 (Q1 rà JSDoc cả 2 use case sau khi tách)
```

Khuyến nghị thứ tự merge: **p0-01 → p0-02 → p0-03 → p0-04 → p1-01**. MỖI plan là 1 PR riêng (guide §3.1: refactor phải diff-review được từng phần; KHÔNG gộp).

> **Lưu ý thứ tự p0-03 vs p0-04:** p0-03 (account-stats) và p0-04 (minimal docs) đều nhánh con của p0-01, độc lập nhau về file (p0-03 chạm accumulator/writeBatch/get-ops-snapshot/entity/index; p0-04 chạm ensureDocs/mapper/beforeLoop). Có thể đảo, nhưng khuyến nghị p0-03 trước để p0-04 mapper normalize viết theo entity ĐÃ bỏ `topAccounts` (đỡ đá diff).

## Nguyên tắc chung (áp cho MỌI plan trong thư mục)

1. **KHÔNG mở lại K1–K8** (analysis §4, guide §5): delta-only accumulator, watermark per-doc, hàng đợi `final:false`, loại void tại nguồn, `$set` tuyệt đối cho counter phái sinh, 1 thuật toán duy nhất, trần + extendLock trong vòng đọc, projection thin. Mọi "đơn giản hoá" phá 1 trong 8 = quay lại bug p2-01 Keno đã trả giá.
2. **KHÔNG thêm cơ chế kiểm/đối chiếu khi đóng sổ** (analysis §5.4): drained + terminal → `final`. Không count-check, không rebuild, không alert mismatch. Rủi ro tồn dư watermark đã CHẤP NHẬN CÓ CHỦ ĐÍCH (2 bet cùng giây, `_id` ≠ thứ tự commit) — ghi trong analysis §5.4, không ai "phát hiện lại". Số chính thức kỳ đã đóng lấy từ `DrawDoc.financial`/`DrawDoc.stats` (JOIN lúc đọc), không từ stats doc ops.
3. **API PHẢI XOÁ khi đổi mô hình ghi** (analysis §7, guide §5.6 + §3.3 checklist): `upsertFull`, `recomputeClosedDraws`, `seed()`, `POST_CLOSE_STATUSES`, `RECOMPUTE_PAGE_SIZE`, `topAccounts` in-doc. Với `$inc`, recompute rescan-từ-đầu **cộng đôi** — KHÔNG "giữ cho chắc". Bingo 18 hiện KHÔNG có `resetFinal` — ĐỪNG thêm (guide §5.6, Keno defect #10). Mỗi method public repo phải trả lời "còn nghĩa gì trong mô hình `$inc`?" trước khi merge.
4. **Sức khoẻ worker dùng base class, KHÔNG khai alert type mới** (analysis §5.6/§5.8, guide §7): Bingo 18 hiện chưa có `worker_stuck` (grep 0) → thuần ADD 2 dòng `recordStalledItem`/`clearStalledItem` per worker + `description`. KHÔNG thêm member `Bingo18OpsAlertType`, KHÔNG thêm key `enabled`, KHÔNG label `ops-constants.ts`, KHÔNG nhánh `alerts-panel.tsx`.
5. **Đường ghi không đổi HÀNH VI** — p0-01 chuyển mô hình ghi (đây là đổi correctness có chủ đích, khác Keno p0-01 chỉ di chuyển code — vì Bingo 18 gộp cả p2-01). Nhưng phân nhánh board→bucket + tính exposure + potentialWin **giữ nguyên logic** accumulator hiện có; mọi diff trên các hàm này ngoài phạm vi "đổi từ full-state sang delta" là red flag.
6. Tuân `mongodb.mdc` (docPath `f`, repo-only query, §8 checklist write-amplification), `code-quality-standards.mdc` (JSDoc, §5.3 const-as-const, §5.4 không indexed-access, §6 curly, §7 import đầu file), `entity-typesafe-mongodb.mdc`, plans README (không xoá plan, cập nhật bảng trạng thái).
7. **Verify tối thiểu mỗi plan:** `pnpm --filter <package> check-types` cho MỌI package chạm tới + grep dead code/import sót + mục "Review & rủi ro" của chính plan đó.
8. **Nguyên tắc port (guide §2):** mỗi chỗ code mẫu Keno ghi `keno`/`pick8`/`KENO_`/`combo`/`numberFreq`/`capSets` phải TRA LẠI cho Bingo 18 (`bingo18`/38 bucket/`Bingo18*`/KHÔNG combo/KHÔNG numberFreq/KHÔNG capSets). Plan còn nguyên chữ Keno trong code mẫu = chưa đạt.

## Đặc thù Bingo 18 làm port DỄ hơn Keno (analysis §4.1)

- **Doc nhỏ, shape cố định 38 bucket** → `$inc` path sạch, KHÔNG có `numberFreq` 80 path / combo array. `applyDelta` chỉ đụng bucket có cược trong tick.
- **KHÔNG combo/pair** → KHÔNG `combo_stats`/`combo_accounts`/`findConcentrated` — bỏ toàn bộ nhóm rủi ro combo của Keno. Worker alert Bingo 18 CHỈ đọc stats doc (không repo phụ), gọn hơn Keno. Chỉ 1 collection phụ (`account_stats` cho topAccounts).
- **KHÔNG capSets / payout caps** → `applyDelta` không có nhánh `exposure.capSets.*`; exposure là output thuần từ 38 bucket ở tầng đọc.
- **Alert pure sẵn** (`evaluateBingo18Alerts`) → tách worker chỉ là đổi caller, không viết lại logic.

## Đặc thù Bingo 18 làm port CẦN CHÚ Ý hơn Keno

- **Quay nhanh nhất (6 phút, ~160 kỳ/ngày → D lớn nhất).** Mọi chi phí per-tick × D. Projection thin (`findNotFinal` 2 field) + enroll 1 lần/invocation là **bắt buộc**, không "để sau".
- **Vé multi-draw tối đa 20 kỳ** → kỳ `Scheduled`/`SalesOpen` xa vẫn nhận entry; hàng đợi phải là `final:false` (không suy từ status), như Keno.
- **`tickSeconds` GIỮ 10s** (user chốt §6 Q4) — KHÔNG giảm. Alert trễ ~2 tick ≈ 20s vẫn thừa an toàn cho kỳ 6 phút.

## Định nghĩa "Done" cho toàn bộ thư mục (Bingo 18)

- `sync-betting-stats.ts` chỉ còn 1 câu chuyện: *lấy hàng đợi → hút delta → đóng dấu final* (không còn `evaluateDrawAlerts`, `recomputeClosedDraws`, `POST_CLOSE_STATUSES`, `seed()`).
- Worker `bingo18:ops-alerts` chạy độc lập, alert xuất hiện ≤ ~20s sau cược (2 tick), lỗi evaluator không ảnh hưởng nhịp sync và ngược lại.
- `ensureDocs` chỉ seed `{final, updatedAt}`; mọi reader nhận entity full-shape (38 bucket) qua mapper normalize; thêm field mới = sửa entity + 1 dòng default mapper, KHÔNG migration.
- Vòng lặp tick sống ở `worker-core` (đã có), Bingo 18 có 2 subclass chỉ chứa `runTick`.
- `bingo18_draw_account_stats` là nguồn `topAccounts` (derive `sort limit` lúc đọc) + `uniquePlayers` (`countDocuments`); entity `Bingo18DrawBettingStatsDoc` KHÔNG còn field `topAccounts`.
- `stalledItems` trên lock doc `bingo18:stats-sync` / `bingo18:ops-alerts` báo kỳ kẹt; trang BO `/system/workers` hiển thị 2 worker Bingo 18 với `description`. KHÔNG có alert `worker_stuck`.
- Index `{updatedAt:1}` (betting_stats) + account_stats (3 index) đã tạo trên Atlas TRƯỚC khi deploy.

## Sau khi hoàn thành

- Cập nhật bảng "Plans phái sinh" (§7) trong analysis nguồn (đổi status).
- Cập nhật `../00-overview.md` (feature bingo18-ops-risk-control) — thêm dòng trỏ tới thư mục này.
- Cập nhật bảng trạng thái p2-01 guide Keno (ghi chú Bingo 18 đã port xong).
- Chạy ổn ~1 tuần → port tiếp Max 3D → Max 3D Pro (analysis §6 Q5).
