# Max 3D Pro — Stats Worker Simplification — Master Plan (00-overview)

> **Nguồn:** `.cursor/analysis/max3dpro-stats-worker-simplification.analysis.md` (status `approved`, mọi câu hỏi mở
> đã CHỐT 03/08/2026 — §6).
> **Analysis song sinh:** `.cursor/analysis/max3d-stats-worker-simplification.analysis.md` — Pro = khung Max 3D
> + delta **ordered pair**. Bản chuẩn (Keno): `.cursor/plans/keno-ops-risk-control/stats-worker-simplification/`.
> **Quan hệ:** kế thừa `../p2-01-stats-worker-scale-hardening.plan.md` (Pro CHƯA làm — gộp p2-01 + simplification
> trong bộ plan này). Không mở lại K1–K8 (analysis §3): đây là refactor **cấu trúc + đổi mô hình ghi**, KHÔNG
> phải sửa correctness của công thức exposure/matching.
> **Worker-core:** đã tái cấu trúc (`.cursor/plans/worker-core-usecase-restructure/` — `done`). Dùng tên canonical:
> `TickLoopWorker`/`SingleRunWorker` (import `@megawin/worker-core/workers`), `DistributedMutex`
> (`@megawin/worker-core/locks`). API stalled-items: `recordStalledItem`/`clearStalledItem` (đã implement).

Bộ plan này đưa worker stats Max 3D Pro từ **`$set` full doc + recompute + alert inline** (= Keno PRE-refactor,
copy byte-for-byte khung Max 3D) về kiến trúc `$inc` delta-only + 2 worker tách vai + tick-loop dùng chung, **cộng
với** giải quyết điểm nặng nhất của 4 game: **áp lực RAM ordered-pair key space 10⁶** (mỗi pairKey giữ 1
`Set<accountId>` trong accumulator + map pairs 10⁶ trong `recomputeClosedDraws`).

Pro là game **CUỐI CÙNG** trong 3 game port (sau Bingo 18 → Max 3D). Điểm KHÁC Max 3D duy nhất về bản chất:
**pairKey ORDERED `"first>second"` — TUYỆT ĐỐI KHÔNG sort/normalize** ((A,B) ăn ĐB 2 tỷ, (B,A) ăn phụ ĐB 400tr là
2 outcome khác nhau). Vì ordered nên key space gấp đôi Max 3D (10⁶ vs ~5·10⁵) → tách `pair_stats` là **ưu tiên
#1 riêng của Pro** (đảo thứ tự so với Max 3D nơi pair_stats là p0-03).

## Bảng trạng thái

Tách 2 cột trạng thái độc lập: **Code** (implement theo mô tả plan, trừ mục "Review & rủi ro") và **Review & rủi
ro** (chạy checklist rủi ro + verify — task riêng SAU KHI code xong, đúng như bộ Keno).

| Plan | Phase | Code | Review & rủi ro | Phụ thuộc | Ghi chú |
|---|---|---|---|---|---|
| p0-01-pair-account-stats-collections | P0 | ⏳ pending | ⏳ pending | — | **Ưu tiên #1 & nặng nhất của Pro.** Tách `max3dpro_draw_pair_stats` (ORDERED `"first>second"`) + `max3dpro_draw_account_stats`; bỏ `Set<accountId>` per-pair khỏi RAM; eval/snapshot đọc top-K từ collection phụ; xoá `topPairs`/`topAccounts` khỏi entity. |
| p0-02-port-inc-model | P0 | ⏳ pending | ⏳ pending | p0-01 (accumulator drain đã đổi) | `applyDelta` `$inc` (`totals`+`byPlayType`+`tripletStakes.<t>` sparse+`byTenant`); bỏ `seed()`/band-aid/`recomputeClosedDraws`; `findNotFinal`/`ensureDocs`/`stampFinal`; extends `TickLoopWorker`; `recordStalledItem`/`clearStalledItem` + `description`. |
| p0-03-split-ops-alerts-worker | P0 | ⏳ pending | ⏳ pending | p0-02 (`TickLoopWorker` + `findNotFinal`) | Worker mới `max3dpro:ops-alerts` (cursor `updatedAt`) + `findChangedSince` + index `{updatedAt:1}` + yml + dọn alert khỏi sync worker + `description`. |
| p0-04-minimal-docs-read-defaults | P0 | ⏳ pending | ⏳ pending | p0-02 (`beforeLoop`) | `ensureDocs` 2 field + `BettingStatsMapper` normalize tường minh (thay spread mù) + enroll 1 lần/invocation. |
| p1-01-code-quality | P1 | ⏳ pending | ⏳ pending | p0-03 (Q1 rà JSDoc sau tách) | Q1 comment stale (recomputeFull/seed) · Q2 vá cast `{...rest} as Entity` (đã làm ở p0-04, xác nhận) · Q3 kiểm UI → xoá `byPlayType.*.entries`. KHÔNG có `worker_stuck` (Pro chưa từng có). |

Status: ⏳ pending · 🔨 in-progress · ✅ done · ⏸️ blocked.
Cột **Review & rủi ro** chỉ chuyển ✅ sau khi chạy đủ mục "Đánh giá & verify" + "Review code & rủi ro" của plan đó.

## Thứ tự phụ thuộc

```
p0-01 (pair_stats ORDERED + account_stats — đổi accumulator drain interface, xoá Set RAM)
  │  Ưu tiên #1: hạ RAM 10⁶ + hết drift; các plan sau dựa trên accumulator ĐÃ bỏ Set/topPairs/topAccounts
  ▼
p0-02 (applyDelta $inc + xoá seed/recompute + TickLoopWorker + stalled-item)
  ├──► p0-03 (worker ops-alerts extends TickLoopWorker, đọc pair_stats cho pair_liability/combo_concentration)
  └──► p0-04 (enroll 1 lần/invocation cần beforeLoop của base; mapper normalize sau khi doc ghi tối thiểu)

p1-01 sau p0-03 (Q1 rà JSDoc cả 2 use case sau khi tách)
```

Khuyến nghị thứ tự merge: **p0-01 → p0-02 → p0-03 → p0-04 → p1-01**. MỖI plan là 1 PR riêng (refactor phải
diff-review được từng phần — analysis §8 rủi ro #1).

**Vì sao p0-01 đứng TRƯỚC p0-02 (khác Max 3D):** ở Pro, `Set<accountId>` per-pair với key space 10⁶ là điểm RAM
nặng nhất; và `recomputeClosedDraws` giữ map pairs 10⁶ + Set trong RAM. Tách `pair_stats` trước → accumulator
drain interface đổi hẳn (không còn Set, không còn topPairs/topAccounts in-doc) → p0-02 port `$inc` cho phần
CÒN LẠI trên interface đã sạch, không phải sửa 2 lần. Ở Max 3D thứ tự ngược được vì unordered nhẹ hơn, giữ-doc
còn khả thi tạm thời; Pro thì không.

## Nguyên tắc chung (áp cho MỌI plan trong thư mục)

1. **KHÔNG mở lại K1–K8** (analysis §3): delta-only accumulator, watermark per-doc, hàng đợi `final:false`, loại
   void tại nguồn, counter phái sinh `$set` tuyệt đối, 1 thuật toán duy nhất, trần + extendLock trong vòng đọc,
   projection thin. Phá 1 trong 8 = quay lại bug p2-01 đã trả giá.
2. **pairKey ORDERED tuyệt đối** — `toOrderedPairKey(first, second)` = `"first>second"`, KHÔNG sort/normalize ở
   BẤT KỲ đâu (ghi + đọc + eval + snapshot + collection phụ). (A,B)≠(B,A) là bản chất giải ĐB/phụ ĐB. Audit mỗi
   plan chạm pair: `rg "sort\(|\.sort|normalize|Math.min.*Math.max" ` quanh chỗ build pairKey → 0 match. Đây là
   rủi ro số 1 khi port từ Max 3D (unordered) — người port DỄ "tiện tay" sort để dedupe.
3. **KHÔNG thêm cơ chế kiểm/đối chiếu khi đóng sổ** (chốt analysis §5.5): drained + terminal (`Settled`/`Void`) →
   `final`. Không count-check, không rebuild, không alert mismatch. Rủi ro tồn dư watermark CHẤP NHẬN CÓ CHỦ ĐÍCH
   (ops-only; số chính thức từ `DrawDoc.financial`). KHÔNG `resetFinal` — xem defect #10 Keno overview.
4. **Đường ghi không đổi HÀNH VI** — công thức accumulator (`applyBoard`/`addEntry`), exposure
   (`computeMax3dproExposure`/`computeProPairLiabilities`), matching KHÔNG đổi. Mọi diff trên các hàm này ngoài
   phạm vi plan tương ứng là **red flag** khi review. Plan chỉ đổi *nơi lưu* (doc chính vs collection phụ) và *cách
   ghi* (`$set` full → `$inc` path).
5. Tuân `mongodb.mdc` (docPath, repo-only query, §8 checklist scale, §7 TTL), `entity-typesafe-mongodb.mdc`
   (named interface embedded doc, format 1 field/dòng), `code-quality-standards.mdc` (JSDoc §1, const-as-const §5.3,
   curly §6, import đầu file §7), plans README (không xoá plan, cập nhật bảng trạng thái).
6. **Verify tối thiểu mỗi plan:** `pnpm --filter <package> check-types` cho MỌI package chạm tới + grep dead
   code/import sót + mục "Review & rủi ro" của chính plan đó.

## Nợ vận hành (KHÔNG phải defect code) — bắt buộc làm TRƯỚC khi deploy

- **Index thủ công trên Atlas TRƯỚC khi deploy worker** (repo khai index trong `packages/game-max3dpro/src/indexes/index.ts`
  nhưng KHÔNG có runner — xem comment đầu `MAX3D_PRO_INDEXES`, chỉ là source of truth để DBA copy):
  - `max3dpro_draw_pair_stats`: `{drawId:1, pairKey:1}` unique · `{drawId:1, units:-1}` · `{createdAt:1}` TTL 90d (p0-01).
  - `max3dpro_draw_account_stats`: `{drawId:1, accountId:1}` unique · `{drawId:1, amount:-1}` · `{createdAt:1}` TTL 90d (p0-01).
  - `max3dpro_draw_betting_stats`: `{updatedAt:1}` (`idx_updatedAt`) — worker ops-alerts (p0-03). Deploy trước khi
    tạo index ⇒ COLLSCAN mỗi tick.
- **`worker_stuck`:** Pro **CHƯA TỪNG** có alert này (grep 0). KHÔNG thêm. Sức khoẻ worker đi qua
  `worker_locks.stalledItems` (`worker-core`, đã ship) — trang BO `/system/workers` tự hiện. Xem
  `.cursor/plans/system-worker-health/`. Đây là lý do bộ Pro **không** có plan `worker_stuck` nào.

**Verify chưa chạy được ở bước review code** (cần dev/staging + dữ liệu thật): smoke test tick loop, explain index
pair_stats/account_stats/updatedAt trên Atlas, so sánh top-K trước/sau tách, click-through trang Operations
(KPI/heatmap/pair panel/liability) — danh sách cụ thể ở mục "Đánh giá & verify" từng plan.

## Định nghĩa "Done" cho toàn bộ thư mục (Max 3D Pro)

- `sync-betting-stats.ts` chỉ còn 1 câu chuyện: *lấy hàng đợi → hút delta (`$inc` per-doc + drain pair/account) →
  đóng dấu final* (không còn `upsertFull`, `recomputeClosedDraws`, `seed()`, `evaluateDrawAlerts`, `AlertContext`).
- `max3dpro_draw_pair_stats` (ORDERED) + `max3dpro_draw_account_stats` là nguồn top-K lúc đọc; accumulator KHÔNG
  còn `Set<accountId>` per-pair, KHÔNG còn `pairs`/`accounts` map top-K seed cross-invocation. RAM/invocation
  không còn tỷ lệ với key space 10⁶.
- Worker `max3dpro:ops-alerts` chạy độc lập; `pair_liability`/`combo_concentration` đọc `pair_stats` (GIỮ ordered
  forward/reverse); lỗi evaluator không ảnh hưởng nhịp sync và ngược lại.
- `ensureDocs` chỉ seed `{final, updatedAt}`; mọi reader nhận entity full-shape qua `BettingStatsMapper` normalize
  tường minh (không còn `{...rest} as Entity`).
- Vòng lặp tick sống ở `worker-core` (1 bản); Pro có 2 subclass chỉ chứa `runTick`.
- `topPairs`/`topAccounts` KHÔNG còn trong `Max3dproDrawBettingStatsDoc`; `topCombosK`/`topAccountsK` giữ (số cắt
  lúc đọc từ collection phụ).
- Index `{updatedAt:1}` + 6 index 2 collection phụ đã tạo trên Atlas TRƯỚC khi deploy.

## Sau khi hoàn thành

- Cập nhật bảng "Plans phái sinh" (§7) trong analysis nguồn (đổi trạng thái các plan).
- Cập nhật `../00-overview.md` (feature max3dpro-ops-risk-control) — thêm dòng trỏ tới thư mục này.
- Đây là game cuối trong 3 game port → sau khi Pro ổn, toàn bộ guide p2-01 Keno coi như đã port đủ 4 game.
