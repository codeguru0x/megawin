# Max 3D — Stats Worker Simplification (Analysis)

> **Status:** `approved` (mọi câu hỏi mở đã chốt — §6) · **Ngày:** 02/08/2026 (cập nhật 03/08/2026 — worker-health + chốt quyết định)
> **Nguồn tham chiếu:**
> - Analysis mẫu (Keno): `.cursor/analysis/keno-stats-worker-simplification.analysis.md` — khuôn §5 + §7 port
> - Worker health (đã ship): `.cursor/analysis/system-worker-health.analysis.md` (§5.7 — `recordStalledItem`/`clearStalledItem` thay `worker_stuck`) + `.cursor/plans/system-worker-health/`
> - Analysis gốc: `.cursor/analysis/max3d-max3dpro-operations-risk-control.analysis.md` (1 analysis chung 2 game)
> - Plan scale-hardening: `.cursor/plans/max3d-ops-risk-control/p2-01-stats-worker-scale-hardening.plan.md`
> - Source đã đọc (02/08/2026): `apps/worker-max3d/src/handlers/stats/stats-sync.ts`, `functions/stats.yml`,
>   `packages/game-max3d-application/src/use-cases/operations/{sync-betting-stats,stats-accumulator,evaluate-alerts}.ts`,
>   `packages/game-max3d-application/src/infras/repos/{betting-stats,entry}-repo.ts`, `use-cases/void/finalize-void.ts`,
>   `packages/game-max3d/src/entities/betting-stats.ts`, `packages/game-max3d/src/indexes/index.ts`
> - **Worker-core đã tái cấu trúc (03/08/2026 — `done`, xem `.cursor/plans/worker-core-usecase-restructure/`):**
>   `LockedWorkerUseCase → SingleRunWorker`, `TickLoopWorkerUseCase → TickLoopWorker`,
>   `BusinessLockCoordinator → DistributedMutex`. Machinery stalled-items tách `StalledItemTracker` bằng
>   composition — **API `recordStalledItem`/`clearStalledItem` GIỮ NGUYÊN**. Import subpath PHÂN TẦNG:
>   `extends TickLoopWorker` từ **`@megawin/worker-core/workers`**; `DistributedMutex` từ
>   `@megawin/worker-core/locks`. Doc này DÙNG tên canonical mới. Xem
>   `.cursor/plans/worker-core-usecase-restructure/00-overview.md`. Doc này viết trước khi đổi tên.

## 1. Bối cảnh & mục tiêu

Keno đã hoàn tất p2-01 (scale `$inc`) + simplification (tách worker, tick-loop, đóng sổ, mapper normalize). Max 3D **chưa làm cả hai** → analysis này định nghĩa đường port **gộp 2 bước**, dùng Keno làm chuẩn.

Ràng buộc Max 3D: quay **3 kỳ/tuần (T2/4/6 18h)**, bán **NHIỀU NGÀY**, tối đa ~6 kỳ mở song song → D nhỏ (khác Keno/Bingo18) NHƯNG **doc nặng nhất về write amplification**: `tripletStakes` Record ≤1000 key (mỗi key `straightUnits/combo3Units/combo6Units/amount/boards`) ≈ **80KB** bị `$set` ghi lại toàn bộ mỗi 30s. Trọng tâm rủi ro số 1 (analysis gốc): **exposure + pair liability** — ĐB plus ×100.000 KHÔNG cap kỳ, liability tích luỹ nhiều ngày trước quay.

**Kết luận trước:** kiến trúc dữ liệu ĐÚNG, giữ nguyên (gồm exposure tính ở tầng đọc, pairKey **unordered** `"t1,t2"` — đúng với plus bipartite, KHÔNG đổi). Cái cần đổi: `$set` full → `$inc` (đặc biệt `tripletStakes.<t>` sparse — **ăn tiền lớn nhất** vì tránh rewrite 80KB) + tách alert + DRY tick-loop.

## 2. Vòng đời 1 kỳ Max 3D — dòng dữ liệu thật

```
Scheduled ──► SalesOpen (nhiều ngày) ──► SalesClosed ──► Published ──► Settling ──► Settled (TERMINAL)
              ▲                              │                                        hoặc
              └──────────────────────────────┘ (mở bán lại — kiểm open-sales.ts)  Voiding ──► Void
```

3 sự thật:
1. **Entries đến rải nhiều ngày** — vé multi-draw, kỳ `Scheduled` xa vẫn nhận entry. D nhỏ (~6) nhưng mỗi kỳ tích luỹ lâu → **doc lớn dần trong nhiều ngày** = `$set` càng đắt.
2. **`SalesClosed` KHÔNG terminal** (kiểm `open-sales.ts`). Chỉ `Settled`/`Void`.
3. **Kỳ nhảy status** → hàng đợi `final:false`.

Dòng dữ liệu ops:
```
place-bet ──insert──► max3d_ticket_entries (insert-only, _id = watermark)
                            │  loại status:Void tại nguồn
                            ▼
              ┌─ max3d_draw_betting_stats  (totals, byPlayType 4 nhóm, tripletStakes ≤1000, topPairs unordered)
   $inc +     ├─ max3d_draw_pair_stats     (MỚI? — topPairs tích lũy chính xác, thay topPairs in-doc drift)
   watermark  └─ max3d_draw_account_stats  (MỚI? — topAccounts chính xác)
                            │  (đọc; exposure basic greedy + pair liability + plus tail proxy — ở tầng đọc)
                            ▼
              evaluateAlerts (pure) ──► max3d_ops_alerts ──► badge/panel
```

## 3. Hiện trạng — code thật 02/08/2026

Max 3D = **`$set` full + recompute + alert inline = Keno PRE-refactor**. Bằng chứng:

| # | Điểm | Hiện trạng | Keno đích |
|---|---|---|---|
| H1 | Mô hình ghi | `upsertFull` `$set` full doc (~80KB) mỗi tick | `applyDelta` `$inc` path |
| H2 | Accumulator | `seed()` baseline + band-aid `Math.max(baselineAccounts, set.size)` cho pair `accounts` (`units`/`amount` vẫn drift) | Delta-only |
| H3 | Safety-net | `recomputeClosedDraws` (full RAM, cursor undefined) + `POST_CLOSE_STATUSES` gồm `Voiding` | XOÁ |
| H4 | Hàng đợi | `getUnfinishedDraws([SalesOpen])` + recompute | `findNotFinal()` |
| H5 | Alert | `evaluateDrawAlerts` inline trong `syncOpenDraws` | Worker `ops-alerts` riêng |
| H6 | Tick loop | Copy thủ công | `TickLoopWorker` (import `@megawin/worker-core/workers`) |
| H7 | try/catch per-draw | **KHÔNG** | có + trần |
| H8 | repo methods | 3 method, `getManyByDrawIds` không projection | + `findNotFinal`/`applyDelta`/… |
| H9 | Index | chỉ `{drawId:1}` unique | + `{final:1}` + `{updatedAt:1}` |
| H10 | `topAccounts` | `@deprecated` in-doc drift; `topPairs` cũng tích lũy drift | Tách `account_stats`/`pair_stats` |
| H11 | handler JSDoc | Nhắc `recomputeFull` (stale) | Mô tả đúng |

**ĐÚNG sẵn — giữ:** watermark per-draw; conditional write; `getEntriesForStatsAfter` loại Void + projection + limit; exposure tính ở tầng đọc (KHÔNG lưu doc); `finalize-void` KHÔNG chạm stats; `evaluate-alerts` PURE; `tripletStakes` sparse bounded; pairKey **unordered** (đúng cho plus).

## 4. Phân tích — K1–K8 áp cho Max 3D + đặc thù

| Keno | Max 3D hiện tại | Việc phải làm |
|---|---|---|
| **K1** Delta-only | ❌ `seed()` + band-aid | Bỏ `seed()`+`Math.max`; accumulator xuất delta |
| **K2** Watermark per-doc `$inc` | ⚠️ watermark có, ghi qua `$set` | `applyDelta`: `totals`(5) + `byPlayType`(4×4=16 path cố định) + **`tripletStakes.<t>` sparse** (chỉ key có delta) + `byTenant` dynamic |
| **K3** `findNotFinal` + stamp Settled/Void | ❌ | Thêm |
| **K4** Loại void tại nguồn | ✅ | Giữ |
| **K5** Counter phái sinh `$set` tuyệt đối | N/A hiện; nếu tách `pair_stats`: `accountCount` qua `upsertedCount` | Khi tách collection phụ |
| **K6** Xoá recompute | ❌ | **XOÁ** (với `$inc` recompute cộng đôi) |
| **K7** Trần + try/catch | ⚠️ thiếu | Thêm |
| **K8** Projection thin | ❌ | `findNotFinal` projection |

### 4.1. Đặc thù Max 3D — điểm khó/khác Keno & Bingo 18

- **`tripletStakes` sparse ≤1000 key** = điểm `$inc` ăn tiền lớn nhất: hiện `$set` rewrite cả 80KB mỗi 30s dù chỉ vài triplet có cược mới → `$inc tripletStakes.<t>.<field>` chỉ đụng key delta. Đây là lý do §5.1 **ưu tiên cao hơn Bingo 18**.
- **`topPairs` (unordered) tích lũy** — metric drift như Keno topCombos. Cần tách `max3d_draw_pair_stats` (`$inc units/amount`, index `{drawId,units:-1}`) hoặc giữ + nhãn. D nhỏ (6 kỳ) → drift nhỏ hơn Keno, (b) có thể đủ.
- **Exposure 3 thành phần ghi nhãn exact/proxy** (basic greedy per-tier exact + max pair liability exact + plus tail proxy) — tính ở tầng đọc, evaluator đọc từ stats doc. Chuyển alert sang worker riêng KHÔNG đổi công thức.
- **`byPlayType.*.entries` per-board "xấp xỉ"** (Keno Q3) — có trong `Max3dPlayTypeStat`. Kiểm UI có hiển thị không → xoá nếu không.

## 5. Đề xuất (verdict — khuôn §5 + §7 Keno)

### 5.1. ✅ P0 — Port `$inc` (gộp p2-01), ưu tiên `tripletStakes` sparse
**KEEP.** `upsertFull` → `applyDelta` (`$inc` `totals`+`byPlayType`+`tripletStakes.<t>` sparse); bỏ `seed()`+band-aid; **xoá `recomputeClosedDraws`**. Đây là phần **ăn tiền lớn nhất** (khỏi rewrite 80KB/tick).
> ⚠️ §7 Keno: `recomputeClosedDraws`+`seed()`+`Math.max` band-aid **XOÁ hoàn toàn** — với `$inc` chúng cộng đôi/che drift.

### 5.2. ✅ P0 — Tách worker `ops-alerts`
**KEEP.** Coupling chết y §4.2 Keno. Worker `ops-alerts`: cursor `updatedAt` → `findChangedSince` → `evaluateMax3dAlerts` (pure) → upsert. Trễ ~20s (2 tick 30s = ~60s) vẫn thừa cho kỳ bán nhiều ngày.

### 5.3. ✅ P0 — Tick-loop `worker-core`
**KEEP.** `TickLoopWorker` chung (import `@megawin/worker-core/workers`).

### 5.4. ✅ P0 — Đóng sổ drained + terminal → final
**KEEP** (§5.3 Keno). Rủi ro tồn dư watermark chấp nhận (ops-only). Số chính thức kỳ đóng từ `DrawDoc.financial`. KHÔNG `resetFinal`.

### 5.5. ✅ P0 — Doc ghi tối thiểu + normalize mapper
**KEEP** (§5.5). `ensureDocs` `$setOnInsert {final:false, updatedAt}`; `$inc` tạo path; `BettingStatsMapper` deep-merge default (4 nhóm byPlayType zero, `tripletStakes` `?? {}`, `topPairs` `?? []`). Schema evolution triệt để.

### 5.6. ✅ P1 — Enroll 1 lần/invocation + code quality
**KEEP.** Enroll ra khỏi tick; sửa JSDoc handler (Q1); kiểm/xoá `entries` per-playtype.

**Sức khoẻ worker — ĐỔI HƯỚNG 03/08/2026 (đã ship ở Keno + worker-core):** ~~alert `worker_stuck`~~ → dùng
`this.recordStalledItem(drawId, error)` / `this.clearStalledItem(drawId)` của `SingleRunWorker`
(`worker-core`, **đã implement** — tên `*StalledItem`, không phải `*ItemFailure` như bản đề xuất analysis
system-worker-health). Nguồn: `.cursor/analysis/system-worker-health.analysis.md` (approved); Keno §5.7.

Sức khoẻ worker là **trạng thái hạ tầng** (tự hết khi hồi phục, không thuộc kỳ nào), không phải **sự
kiện nghiệp vụ của 1 kỳ** như `ops_alerts`. Keno từng định ship alert này rồi hoàn nguyên vì 4 defect: badge đỏ
vĩnh viễn, badge global vs panel per-draw, key thừa trong `Record<...OpsAlertType, boolean>`, streak reset
mỗi invocation.

**Max3D KHÔNG phải:** thêm member `Max3dOpsAlertType`, key `enabled` default + zod, label
`ops-constants.ts`, nhánh render `alerts-panel.tsx`. **Max3D hiện chưa có `worker_stuck`** (grep 0) → ADD 2 dòng
gọi base class trong `runTick` (success `clearStalledItem`, catch SAU guard `LockTakenOverError` gọi
`recordStalledItem`), không try/catch, + `protected readonly description` mỗi worker. Tín hiệu hiển thị ở
trang BO chung `/system/workers`. Tiên quyết `system-worker-health/p0-01`+`p0-02` — **đã có trong code**.

### 5.7. ✅ P0 — CHỐT: tách `max3d_draw_pair_stats` + `max3d_draw_account_stats` (user duyệt 03/08/2026)

**Quyết định (user chốt):** tách CẢ HAI collection phụ y như Keno (pair_stats + account_stats) — "gọn database", hết drift `topPairs`/`topAccounts`. KHÔNG giữ trong doc + nhãn.

- `max3d_draw_pair_stats`: `{drawId, pairKey}` unique (pairKey UNORDERED `"t1,t2"` — đúng luật plus bipartite, KHÔNG đổi), `$inc units/amount`, `accountCount` qua `upsertedCount`, index `{drawId:1, units:-1}`, TTL 90d.
- `max3d_draw_account_stats`: `{drawId, accountId}` unique, `$inc amount/entries`, index `{drawId:1, amount:-1}`, TTL 90d.
- Accumulator: bỏ `seed()` + band-aid `Math.max`; bỏ `Set<accountId>` per-pair khỏi RAM; drain delta per-pair/per-account → `bulkUpsertDelta`.
- `evaluate-alerts` (`pair_liability`/`combo_concentration`) + `get-ops-snapshot`: đọc top-K từ pair_stats theo index `{drawId,units:-1}`; topAccounts từ account_stats. DTO/FE không đổi.
- Xoá `topPairs`/`topAccounts` khỏi `entities/betting-stats.ts`. `topCombosK`/`topAccountsK` giữ nguyên (số cắt lúc đọc).

### 5.8. ✅ P0 — Worker health (phần worker MỚI nhất, dùng chung `worker-core`)
**KEEP** — hạ tầng **đã code xong** ở `worker-core` + Keno; Max3D chỉ tiêu thụ: `stalledItems` trên lock doc thay `worker_stuck` (persist qua invocation, tự rỗng khi hồi phục, flush trong `finalizeAndRelease` ⇒ 0 DB call thêm) · 2 method base `recordStalledItem`/`clearStalledItem` · `description` (`$set`) cho CẢ 2 worker (`stats-sync`+`ops-alerts`) · `kind: Worker` tự động · trang BO `/system/workers` tự hiện. Chỉ ADD ~3 dòng/worker — tiết kiệm nhất so với hướng cũ (3 game × 4 điểm chạm `worker_stuck`).

## 6. Câu hỏi mở — ĐÃ CHỐT TOÀN BỘ (user duyệt 03/08/2026)

| # | Câu hỏi | Chốt |
|---|---|---|
| 1 | `open-sales.ts` Max 3D có `SalesClosed → SalesOpen`? | **CÓ** — mọi game đều mở bán lại. → `final` CHỈ stamp ở `Settled`/`Void`. |
| 2 | `topPairs`/`topAccounts` tách hay giữ doc? | **TÁCH CẢ HAI** (`pair_stats` + `account_stats`) — §5.7. |
| 3 | `tripletStakes` `$inc` dynamic path an toàn? | **XÁC NHẬN** (user) — triplet luôn "000".."999" validate ở place-bet, không key injection. `$inc tripletStakes.<t>.<field>` chỉ đụng key có delta. |
| 4 | `byPlayType.*.entries` xoá hay giữ? | **Kiểm UI** — nếu không render → **XOÁ** (plan p1-01). |
| 5 | Thứ tự | Bingo 18 → **Max 3D** → Max 3D Pro. |

→ **Status analysis: sẵn sàng lên plan.**

## 7. Plans phái sinh

Đặt tại `.cursor/plans/max3d-ops-risk-control/stats-worker-simplification/`:
- `p0-01-port-inc-model.plan.md` — §5.1: `applyDelta` (`totals`+`byPlayType`+`tripletStakes.<t>` sparse) + bỏ `seed()`/band-aid + **xoá recompute** + `findNotFinal`/`ensureDocs`/`stampFinal` + extends `TickLoopWorker` (import `@megawin/worker-core/workers`) + `recordStalledItem`/`clearStalledItem` + `description` (§5.8).
- `p0-02-split-ops-alerts-worker.plan.md` — §5.2: worker `ops-alerts` riêng + index `{updatedAt:1}` + yml + `description`.
- `p0-03-pair-account-stats-collections.plan.md` — §5.7: tách `max3d_draw_pair_stats` (unordered) + `max3d_draw_account_stats` + drain delta + eval/snapshot đọc từ collection phụ + xoá `topPairs`/`topAccounts` khỏi entity.
- `p0-04-minimal-docs-read-defaults.plan.md` — §5.5 + §5.6.
- `p1-01-code-quality.plan.md` — §5.6 Q1 + Q2 (kiểm UI → xoá `byPlayType.*.entries`).

**PHẢI XOÁ khi port (§7 Keno):** `upsertFull`, `recomputeClosedDraws`, `seed()`, band-aid `Math.max`, `POST_CLOSE_STATUSES`, `RECOMPUTE_PAGE_SIZE`, `topPairs`/`topAccounts` in-doc.

Thứ tự: sau Bingo 18. Trong game: p0-01 → p0-02 → p0-03 → p0-04 → p1-01.

---

*Living document — cập nhật theo `.cursor/analysis/README.md`.*
