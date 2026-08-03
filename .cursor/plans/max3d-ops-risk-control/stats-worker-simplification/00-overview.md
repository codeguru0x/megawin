# Max 3D Stats Worker Simplification — Master Plan (00-overview)

> **Nguồn:** `.cursor/analysis/max3d-stats-worker-simplification.analysis.md` (status `approved` — mọi câu hỏi mở §6 đã chốt 03/08/2026).
> **Bản chuẩn để port:** thư mục Keno `.cursor/plans/keno-ops-risk-control/stats-worker-simplification/` (5 plan P0+P1 đã `done`) + guide `.../p2-01-port-guide-bingo18-max3d-max3dpro.md`.
> **Tiên quyết hạ tầng (đã code xong):**
> - `worker-core` tái cấu trúc (`.cursor/plans/worker-core-usecase-restructure/` — `done`): `SingleRunWorker`, `TickLoopWorker` (import `@megawin/worker-core/workers`), `DistributedMutex` (`@megawin/worker-core/locks`), `StalledItemTracker` (composition) — API `recordStalledItem`/`clearStalledItem` GIỮ NGUYÊN.
> - `system-worker-health` (`.cursor/plans/system-worker-health/p0-01`+`p0-02` — `done`): `worker_locks.stalledItems` + trang BO `/system/workers`. **KHÔNG** khai alert `worker_stuck` ở game nào.

## 0. Bối cảnh — Max 3D KHÁC Keno ở đâu (đọc trước khi port)

Keno khi làm simplification đã port p2-01 (`$set` → `$inc`) TRƯỚC. **Max 3D chưa làm cả hai** → thư mục
này **gộp p2-01 + simplification** trong 1 loạt plan (analysis §1). Hệ quả: code Max 3D hiện tại =
**Keno PRE-refactor** (`upsertFull` `$set` full + `seed()` baseline + `recomputeClosedDraws` + alert inline).

Khác biệt cấu trúc quyết định phạm vi plan (analysis §2–§4.1):

| | Keno (bản chuẩn) | Max 3D |
|---|---|---|
| Chu kỳ | 6–8 phút, D≈120 kỳ/ngày | **3 kỳ/tuần** (T2/4/6 18h), bán **NHIỀU NGÀY**, D≤6 kỳ mở song song |
| Doc nặng nhất | `numberFreq` 80 + `byPlayType` 15 slot | **`tripletStakes` sparse ≤1000 key** (mỗi key 5 field) ≈ 80KB — `$set` rewrite toàn bộ mỗi 30s |
| Collection phụ | combo + combo_accounts + account_stats (đã có) | **CHƯA CÓ** — phải tạo `pair_stats` + `account_stats` (§5.7 analysis) |
| Trọng tâm rủi ro | payout cap bậc 8/9/10 | **exposure + pair liability** — plus ĐB ×100.000 KHÔNG cap kỳ, liability tích luỹ nhiều ngày trước quay |
| `pairKey` | — | **UNORDERED** `"t1,t2"` (đúng plus bipartite) — Max 3D Pro dùng ORDERED, KHÔNG copy chéo |

**ĐÚNG sẵn — GIỮ NGUYÊN (analysis §3):** watermark per-draw; conditional write; `getEntriesForStatsAfter`
loại Void tại nguồn + projection + limit; exposure tính ở tầng đọc (KHÔNG lưu doc); `finalize-void` KHÔNG
chạm stats; `evaluate-alerts` PURE; `tripletStakes` sparse bounded; `pairKey` unordered.

**PHẢI XOÁ khi port (analysis §7, guide §5 bẫy #6 — "API sót từ mô hình `$set`"):** `upsertFull`,
`recomputeClosedDraws`, `Max3dDrawStatsAccumulator.seed()`, band-aid `Math.max(baselineAccounts, set.size)`,
const `POST_CLOSE_STATUSES`, `RECOMPUTE_PAGE_SIZE`, `topPairs`/`topAccounts` in-doc. Không giữ "cho chắc" —
với `$inc` chúng cộng đôi / che drift.

## Bảng trạng thái

Tách 2 cột trạng thái độc lập: **Code** (implement theo mô tả plan, trừ mục "Review & rủi ro") và
**Review & rủi ro** (chạy checklist rủi ro + verify của plan — task riêng SAU KHI code xong). Quy ước như
thư mục Keno.

| Plan | Phase | Code | Review & rủi ro | Phụ thuộc | Ghi chú |
|---|---|---|---|---|---|
| p0-01-port-inc-model | P0 | ⏳ pending | ⏳ pending | — | Gộp p2-01 + tick-loop: `applyDelta` (`$inc` totals+byPlayType+`tripletStakes.<t>` sparse) + `findNotFinal`/`ensureDocs`/`stampFinal` + `listUnfinishedDrawIds` + `extends TickLoopWorker` + `recordStalledItem`/`clearStalledItem` + `description`. **XOÁ** `upsertFull`/`recomputeClosedDraws`/`seed()`/band-aid. `tripletStakes` sparse = phần ăn tiền lớn nhất (khỏi rewrite 80KB/tick). |
| p0-02-split-ops-alerts-worker | P0 | ⏳ pending | ⏳ pending | p0-01 | Worker mới `max3d:ops-alerts` (cursor `updatedAt` → `findChangedSince` → `evaluateMax3dAlerts`) + index `{updatedAt:1}` + yml + handler + `description`. Dọn alert khỏi sync worker. KHÔNG có combo collection kiểu Keno → evaluator chỉ đọc stats + pair_stats (p0-03). |
| p0-03-pair-account-stats-collections | P0 | ⏳ pending | ⏳ pending | p0-01 | Tách `max3d_draw_pair_stats` (unordered pairKey) + `max3d_draw_account_stats`; drain delta per-pair/per-account → `bulkUpsertDelta`; eval/snapshot đọc top-K từ collection phụ; **xoá `topPairs`/`topAccounts`** khỏi entity + accumulator. |
| p0-04-minimal-docs-read-defaults | P0 | ⏳ pending | ⏳ pending | p0-01 (enroll cần `beforeLoop`) | `ensureDocs` chỉ seed `{final, updatedAt}` + `BettingStatsMapper` normalize phía đọc + enroll 1 lần/invocation. |
| p1-01-code-quality | P1 | ⏳ pending | ⏳ pending | p0-02 (Q1 rà JSDoc sau tách) | Q1 comment stale (JSDoc nhắc `recomputeFull`/`recomputeClosedDraws`) · Q2 lỗ type cast · Q3 kiểm UI → xoá `byPlayType.*.entries` per-slot nếu không render (analysis §4.1 + §6 Q4). |

Status: ⏳ pending · 🔨 in-progress · ✅ done · ⏸️ blocked.
Cột **Review & rủi ro** chỉ ✅ sau khi chạy đủ "Đánh giá & verify" + "Review code & rủi ro" của plan đó
(task riêng, không cùng lúc với code).

## Thứ tự phụ thuộc

```
p0-01 (port $inc + tick-loop + stalled-item — GATE cho mọi thứ)
  ├──► p0-02 (alert worker extends TickLoopWorker + findChangedSince)
  ├──► p0-03 (pair/account collections — drain delta trong writeBatch của p0-01)
  └──► p0-04 (enroll 1 lần/invocation cần hook beforeLoop của base)

p1-01 sau p0-02 (Q1 rà JSDoc cả 2 use case sau tách) — Q2/Q3 độc lập
```

Khuyến nghị merge: **p0-01 → p0-03 → p0-02 → p0-04 → p1-01**. Lý do đặt **p0-03 trước p0-02**: evaluator
tách (p0-02) đọc top-K pair từ `pair_stats` (p0-03) — nếu p0-02 merge trước, evaluator vẫn tạm đọc
`stats.topPairs` in-doc rồi p0-03 đổi nguồn → 2 lần sửa cùng chỗ. Làm p0-03 trước thì p0-02 viết đúng nguồn
1 lần. (Khác thứ tự Keno vì Keno đã có sẵn combo collection trước simplification.)

MỖI plan = 1 PR riêng (guide §3.1 + analysis rủi ro: refactor phải diff-review từng phần). KHÔNG gộp.

## Nguyên tắc chung (áp cho MỌI plan — kế thừa 00-overview Keno §"Nguyên tắc chung")

1. **KHÔNG mở lại K1–K8** (analysis §3–§4): delta-only accumulator, watermark per-doc, hàng đợi `final:false`,
   loại void tại nguồn, `$set` tuyệt đối cho counter phái sinh (`accountCount` qua `upsertedCount`),
   1 thuật toán duy nhất, trần + try/catch trong vòng đọc, projection thin. Phá 1 trong 8 = quay lại bug
   p2-01 đã trả giá.
2. **KHÔNG thêm cơ chế kiểm/đối chiếu khi đóng sổ** (analysis §5.4): drained + terminal (`Settled`/`Void`)
   → `final`. Không count-check, không rebuild, không alert mismatch. Số CHÍNH THỨC kỳ đóng lấy từ
   `DrawDoc.financial`, KHÔNG từ stats doc. KHÔNG `resetFinal` (guide §5 bẫy #6 — no-op + nguy hiểm nếu ai
   "sửa" bằng reset watermark → cộng đôi cả kỳ).
3. **`final` CHỈ stamp ở `Settled`/`Void`** (analysis §6 Q1): `SalesClosed → SalesOpen` là transition hợp lệ
   (kiểm `draw-repo.ts` `VALID_TRANSITIONS`) → `SalesClosed` KHÔNG terminal. Đặt cờ "xong" trên trạng thái
   tạm = mất dữ liệu ghi sau đó (`mongodb.mdc` §8.5).
4. **Đường ghi không đổi HÀNH VI** — p0-01 gộp p2-01 nên CÓ đổi mô hình ghi (`$set`→`$inc`), nhưng
   `addEntry`/`applyBoard`/`toPairKey`/exposure/matching **giữ nguyên từng dòng logic nghiệp vụ**. Diff trên
   các phần này ngoài phạm vi "đổi cách GHI" là red flag khi review.
5. **`pairKey` UNORDERED cho Max 3D** (analysis §5.7): `"t1,t2"` với t1≤t2 sort tăng — đúng luật plus
   bipartite. Max 3D **Pro** dùng ORDERED. Port sang Pro (sau) KHÔNG copy `toPairKey` của Max 3D.
6. Tuân `mongodb.mdc` (docPath, repo-only query, §8 checklist write-amplification), `entity-typesafe-mongodb.mdc`,
   `code-quality-standards.mdc` (JSDoc, §5.3 const-as-const, §5.4 không indexed-access, §6 curly, §7 import
   đầu file), plans README (không xoá plan, cập nhật bảng trạng thái).
7. **Verify tối thiểu mỗi plan:** `pnpm --filter <package> check-types` cho MỌI package chạm tới + grep dead
   code/import sót + mục "Review & rủi ro" của chính plan đó thực hiện đủ.

## Nợ vận hành (KHÔNG phải defect code) — bắt buộc làm TRƯỚC khi deploy

- **Index `{updatedAt:1}`** (`idx_updatedAt`) trên `max3d_draw_betting_stats`: tạo THỦ CÔNG trên Atlas theo
  `MAX3D_INDEXES` (repo không có runner) **TRƯỚC** khi deploy function `ops-alerts`. Deploy trước khi tạo
  index ⇒ COLLSCAN mỗi tick (p0-02 rủi ro #1).
- **Index cho 2 collection mới** (p0-03): `max3d_draw_pair_stats` `{drawId:1}`+`{pairKey:1}` unique +
  `{drawId:1, units:-1}` + TTL `{createdAt:1}` 90d; `max3d_draw_account_stats` `{drawId:1, accountId:1}`
  unique + `{drawId:1, amount:-1}` + TTL 90d. Tạo trên Atlas TRƯỚC deploy worker ghi 2 collection này.
- **KHÔNG có dữ liệu Mongo thật mang tên field cũ** (dự án chưa deploy Max 3D stats ra production): mọi
  rename/xoá field làm TRỰC TIẾP, KHÔNG cần lớp tương thích/migration (bài học Keno p1-01 §Q5 "Migration doc
  đang mở — HUỶ"). Trước khi viết bất kỳ lớp "đọc chịu lỗi" nào, hỏi: *"field này đã từng được worker ghi
  vào Mongo thật chưa?"*
- **`worker_stuck` KHÔNG port** (guide §7): Max 3D hiện grep 0 match (analysis §5.6). Dùng
  `recordStalledItem`/`clearStalledItem` của base — KHÔNG thêm member `Max3dOpsAlertType`, KHÔNG thêm key
  `enabled`, KHÔNG label `ops-constants.ts`, KHÔNG nhánh render `alerts-panel.tsx`.

## Verify chưa chạy được ở bước review code (cần môi trường dev/staging + dữ liệu thật)

Mỗi plan có checklist verify riêng đòi môi trường: p0-01 smoke test 1 invocation + so số liệu; p0-02 hành vi
cursor + explain Atlas + so 24h; p0-03 luồng dọc pair/account + click-through Operations; p0-04 doc tối giản
trên Compass + UI kỳ chưa cược; p1-01 UI + grep. Đây là danh sách phải chạy ở stage deploy, không phải mục
bị bỏ qua.

## Định nghĩa "Done" cho toàn bộ thư mục (Max 3D)

- `sync-betting-stats.ts` chỉ còn 1 câu chuyện: *lấy hàng đợi (`findNotFinal`) → hút delta (`$inc`
  `applyDelta` + drain pair/account) → đóng dấu final* — không còn `evaluateDrawAlerts`/`recomputeClosedDraws`/
  `upsertFull`/`seed()`.
- Worker `max3d:ops-alerts` chạy độc lập; alert xuất hiện ≤ ~60s sau cược (2 tick 30s), lỗi evaluator không
  ảnh hưởng nhịp sync và ngược lại.
- `tripletStakes.<t>` ghi bằng `$inc` path sparse (chỉ triplet có delta) — hết rewrite 80KB/tick.
- `max3d_draw_pair_stats` + `max3d_draw_account_stats` là nguồn top-K chính xác (hết drift `topPairs`/
  `topAccounts`); entity `betting-stats.ts` KHÔNG còn 2 field đó.
- `ensureDocs` chỉ seed `{final, updatedAt}`; mọi reader nhận entity full-shape qua mapper normalize; thêm
  field mới = sửa entity + 1 dòng default mapper, KHÔNG migration.
- Vòng lặp tick sống ở `worker-core` (`TickLoopWorker`); Max 3D có 2 subclass chỉ chứa `runTick` + `beforeLoop`.
- Sức khoẻ 2 worker hiển thị ở `/system/workers` qua `worker_locks.stalledItems` + `description`; KHÔNG có
  alert `worker_stuck`.
- KPI/exposure trang Operations render đúng cho kỳ chưa cược (toàn 0, không crash), kỳ có cược, kỳ settled/void.

## Sau khi hoàn thành

- Cập nhật bảng "Plans phái sinh" (§7) trong analysis nguồn `max3d-stats-worker-simplification.analysis.md`
  (đổi status) + `.../00-overview.md` feature max3d-ops-risk-control (thêm dòng trỏ tới thư mục này).
- Cập nhật bảng p2-01 trong overview thư mục Keno (ghi chú "max3d đã port").
- Chạy production ổn ~1 tuần → port Max 3D **Pro** (analysis §6 Q5 thứ tự: bingo18 → max3d → max3dpro;
  max3dpro copy gần nguyên max3d nhưng `pairKey` ORDERED — diff 2 accumulator trước khi copy, guide §5 bẫy #4).
