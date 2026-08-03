# Max 3D Pro — Stats Worker Simplification (Analysis)

> **Status:** `approved` (mọi câu hỏi mở đã chốt — §6) · **Ngày:** 02/08/2026 (cập nhật 03/08/2026 — worker-health + chốt quyết định)
> **Nguồn tham chiếu:**
> - Analysis mẫu (Keno): `.cursor/analysis/keno-stats-worker-simplification.analysis.md` — khuôn §5 + §7 port
> - Worker health (đã ship): `.cursor/analysis/system-worker-health.analysis.md` (§5.7 — `recordStalledItem`/`clearStalledItem` thay `worker_stuck`) + `.cursor/plans/system-worker-health/`
> - Analysis song sinh (Max 3D): `.cursor/analysis/max3d-stats-worker-simplification.analysis.md` — Pro = Max 3D + delta ordered pair
> - Analysis gốc: `.cursor/analysis/max3d-max3dpro-operations-risk-control.analysis.md` (§2.4 bảng khác biệt)
> - Plan scale-hardening: `.cursor/plans/max3dpro-ops-risk-control/p2-01-stats-worker-scale-hardening.plan.md`
> - Source đã đọc (02/08/2026): `apps/worker-max3dpro/src/handlers/stats/stats-sync.ts`, `functions/stats.yml`,
>   `packages/game-max3dpro-application/src/use-cases/operations/{sync-betting-stats,stats-accumulator,evaluate-alerts}.ts`,
>   `packages/game-max3dpro-application/src/infras/repos/{betting-stats,entry}-repo.ts`, `use-cases/void/finalize-void.ts`,
>   `packages/game-max3dpro/src/entities/betting-stats.ts`, `packages/game-max3dpro/src/indexes/index.ts`
> - **Worker-core đã tái cấu trúc (03/08/2026 — `done`, xem `.cursor/plans/worker-core-usecase-restructure/`):**
>   `LockedWorkerUseCase → SingleRunWorker`, `TickLoopWorkerUseCase → TickLoopWorker`,
>   `BusinessLockCoordinator → DistributedMutex`. Machinery stalled-items tách `StalledItemTracker` bằng
>   composition — **API `recordStalledItem`/`clearStalledItem` GIỮ NGUYÊN**. Import subpath PHÂN TẦNG:
>   `extends TickLoopWorker` từ **`@megawin/worker-core/workers`**; `DistributedMutex` từ
>   `@megawin/worker-core/locks`. Doc này DÙNG tên canonical mới. Xem
>   `.cursor/plans/worker-core-usecase-restructure/00-overview.md`. Doc này viết trước khi đổi tên.

## 1. Bối cảnh & mục tiêu

Max 3D Pro là **bản copy cấu trúc Max 3D** — cùng skeleton worker, khác domain shape. Chưa làm p2-01 lẫn simplification. Analysis này port **gộp 2 bước**, kế thừa analysis Max 3D + delta **ordered pair** (bản chất giải Pro).

Ràng buộc riêng Pro (analysis gốc §2.4): board `multiNumber` (3–20 triplet) → **P(n,2) ordered pairs**; 20 bộ = **380 ordered pair/board**; pairKey **ORDERED** `"first>second"` ((A,B)≠(B,A): đúng chiều = ĐB ×`special` 2 tỷ, ngược chiều = phụ ĐB ×`specialSub` 400tr). Không gian khoá lý thuyết **1000×1000 = 10⁶**. Lịch T3/5/7, bán nhiều ngày, ~6 kỳ mở song song (D nhỏ).

**Kết luận trước:** kiến trúc ĐÚNG, giữ nguyên (exposure tính ở tầng đọc: forward×special + reverse×specialSub + tail proxy). Cái cần đổi: `$set` full → `$inc` + tách alert + DRY tick-loop — **CỘNG với** xử lý áp lực RAM ordered-pair 10⁶ (điểm nặng nhất 4 game, riêng của Pro).

## 2. Vòng đời 1 kỳ — dòng dữ liệu thật

```
Scheduled ──► SalesOpen (nhiều ngày) ──► SalesClosed ──► Published ──► Settling ──► Settled (TERMINAL)
              ▲                              │                                        hoặc
              └──────────────────────────────┘ (mở bán lại — kiểm open-sales.ts)  Voiding ──► Void
```

3 sự thật (giống Max 3D): entries rải nhiều ngày (D~6); `SalesClosed` không terminal; kỳ nhảy status → hàng đợi `final:false`.

Dòng dữ liệu ops (khác Max 3D ở pair ORDERED):
```
place-bet ──insert──► max3dpro_ticket_entries (insert-only, _id = watermark)
                            │  loại status:Void tại nguồn
                            ▼
              ┌─ max3dpro_draw_betting_stats  (totals, byPlayType 2 nhóm, tripletStakes ≤1000, topPairs ORDERED)
   $inc +     ├─ max3dpro_draw_pair_stats     (MỚI — ORDERED "first>second", $inc units/amount + accountCount)
   watermark  └─ max3dpro_draw_account_stats  (MỚI? — topAccounts chính xác)
                            │  (đọc; exposure forward×special + reverse×specialSub + tail proxy — ở tầng đọc)
                            ▼
              evaluateAlerts (pure) ──► max3dpro_ops_alerts ──► badge/panel
```

## 3. Hiện trạng — code thật 02/08/2026

Max 3D Pro = **`$set` full + recompute + alert inline = Keno PRE-refactor** (giống Max 3D byte-for-byte về skeleton):

| # | Điểm | Hiện trạng | Keno đích |
|---|---|---|---|
| H1 | Mô hình ghi | `upsertFull` `$set` full doc (~50–60KB) mỗi tick | `applyDelta` `$inc` path |
| H2 | Accumulator | `seed()` + band-aid `Math.max` cho pair `accounts`; **`Set<accountId>` mỗi pairKey trong RAM** (key space 10⁶) | Delta-only, KHÔNG Set persist |
| H3 | Safety-net | `recomputeClosedDraws` (full RAM — **nặng nhất 4 game** vì map pairs 10⁶ + Set) + `POST_CLOSE_STATUSES` gồm `Voiding` | XOÁ |
| H4 | Hàng đợi | `getUnfinishedDraws([SalesOpen])` + recompute | `findNotFinal()` |
| H5 | Alert | `evaluateDrawAlerts` inline write path | Worker `ops-alerts` riêng |
| H6 | Tick loop | Copy thủ công | `TickLoopWorker` (import `@megawin/worker-core/workers`) |
| H7 | try/catch per-draw | **KHÔNG** | có + trần |
| H8 | repo methods | 3 method, không projection | + `findNotFinal`/`applyDelta`/… |
| H9 | Index | chỉ `{drawId:1}` unique | + `{final:1}` + `{updatedAt:1}` |
| H10 | `topPairs`/`topAccounts` | in-doc tích lũy drift; band-aid nửa vời | Tách `pair_stats` (ORDERED)/`account_stats` |
| H11 | handler JSDoc | Nhắc `recomputeFull` (stale) | Mô tả đúng |

**ĐÚNG sẵn — giữ:** watermark per-draw; conditional write; loại Void tại nguồn + projection + limit; exposure ở tầng đọc; `finalize-void` KHÔNG chạm stats; `evaluate-alerts` PURE; `tripletStakes` sparse; **pairKey ORDERED `toOrderedPairKey` KHÔNG sort** (audit p0-02 grep 0 normalize — bản chất giải, tuyệt đối giữ).

## 4. Phân tích — K1–K8 + đặc thù Pro (nặng nhất)

| Keno | Pro hiện tại | Việc phải làm |
|---|---|---|
| **K1** Delta-only | ❌ `seed()`+band-aid+`Set` RAM 10⁶ | Bỏ `seed()`; **bỏ `Set<accountId>` per-pair** (chuyển sang `pair_stats` `$inc`) — hạ RAM tận gốc |
| **K2** `$inc` per-doc | ⚠️ `$set` | `applyDelta`: `totals`(5)+`byPlayType`(2×4=8)+`tripletStakes.<t>`(3 field) sparse+`byTenant` |
| **K3** `findNotFinal` | ❌ | Thêm |
| **K4** Loại void tại nguồn | ✅ | Giữ |
| **K5** Counter phái sinh `$set` | → `pair_stats.accountCount` qua `upsertedCount` | Khi tách |
| **K6** Xoá recompute | ❌ | **XOÁ** (Pro recompute nặng nhất — bỏ được là lợi nhất) |
| **K7** Trần + try/catch | ⚠️ thiếu | Thêm |
| **K8** Projection | ❌ | Thêm |

### 4.1. Đặc thù Pro — vì sao NẶNG NHẤT & tách `pair_stats` là ưu tiên #1

- **Key space ORDERED 10⁶** (gấp đôi Max 3D unordered ~5·10⁵ vì giữ thứ tự). 380 ordered pair/board multiNumber. `recomputeClosedDraws` giữ **map pairs 10⁶ + mỗi key 1 `Set<accountId>`** trong RAM → áp lực RAM/invocation lớn nhất 4 game. Drift top-K cũng nặng nhất (nhiều pair rớt ngoài top-K).
- **Tách `max3dpro_draw_pair_stats` (`$inc` upsert per-pair-delta)** giải quyết ĐỒNG THỜI: (1) xoá `Set<accountId>` khỏi RAM accumulator → hạ R3 tận gốc; (2) hết drift `topPairs` (query top-K theo index `{drawId,units:-1}` lúc đọc); (3) `accountCount` chính xác qua `upsertedCount`. Đây là lý do **(a) ưu tiên mạnh hơn hẳn** so với Max 3D (nơi (b) giữ-doc còn khả thi vì unordered nhẹ hơn).
- **Ordered tuyệt đối:** `pair_stats` pairKey = `toOrderedPairKey(first, second)` ở CẢ ghi + đọc + eval; alert `pair_liability` giữ `unitsForward`/`unitsReverse`. Audit grep 0 sort như p0-02.

## 5. Đề xuất (verdict — khuôn §5 + §7 Keno)

### 5.1. ✅ P0 — Tách `pair_stats` ORDERED (ưu tiên #1 riêng của Pro)
**KEEP.** `max3dpro_draw_pair_stats` (`{drawId, pairKey}` unique ORDERED, `$inc units/amount`, `accountCount` qua `upsertedCount`, index `{drawId:1, units:-1}`, TTL 90d). Bỏ `Set<accountId>` khỏi accumulator → hạ RAM 10⁶ + hết drift. `evaluate-alerts` + snapshot đọc top-K từ collection này (giữ ordered forward/reverse).

### 5.2. ✅ P0 — Port `$inc` phần còn lại (gộp p2-01)
**KEEP.** `applyDelta` (`totals`+`byPlayType`+`tripletStakes.<t>` sparse); bỏ `seed()`+band-aid; **xoá `recomputeClosedDraws`**.
> ⚠️ §7 Keno: `recomputeClosedDraws`+`seed()`+`Math.max` **XOÁ hoàn toàn** — với `$inc` cộng đôi/che drift.

### 5.3. ✅ P0 — Tách worker `ops-alerts`
**KEEP.** Cursor `updatedAt` → `findChangedSince` → `evaluateMax3dproAlerts` (pure, `pair_liability` đọc `pair_stats` giữ ordered) → upsert.

### 5.4. ✅ P0 — Tick-loop `worker-core`
**KEEP.** `TickLoopWorker` chung (import `@megawin/worker-core/workers`).

### 5.5. ✅ P0 — Đóng sổ drained + terminal → final
**KEEP** (§5.3 Keno). Rủi ro tồn dư watermark chấp nhận (ops-only). Số chính thức từ `DrawDoc.financial`. KHÔNG `resetFinal`.

### 5.6. ✅ P0 — Doc ghi tối thiểu + normalize mapper
**KEEP** (§5.5). `ensureDocs` `$setOnInsert {final:false, updatedAt}`; mapper deep-merge default (2 nhóm byPlayType, `tripletStakes ?? {}`). Sau khi tách `pair_stats`, `topPairs` không còn trong doc chính → mapper bỏ default cũ.

### 5.7. ✅ P1 — Enroll 1 lần/invocation + code quality
**KEEP.** Enroll ra khỏi tick; sửa JSDoc handler; kiểm/xoá `entries` per-playtype.

**Sức khoẻ worker — ĐỔI HƯỚNG 03/08/2026 (đã ship ở Keno + worker-core):** ~~alert `worker_stuck`~~ → dùng
`this.recordStalledItem(drawId, error)` / `this.clearStalledItem(drawId)` của `SingleRunWorker`
(`worker-core`, **đã implement** — tên `*StalledItem`, không phải `*ItemFailure`). Nguồn:
`.cursor/analysis/system-worker-health.analysis.md` (approved); Keno §5.7.

Sức khoẻ worker là **trạng thái hạ tầng** (tự hết khi hồi phục, không thuộc kỳ nào), không phải **sự
kiện nghiệp vụ của 1 kỳ** như `ops_alerts`. Keno từng định ship alert này rồi hoàn nguyên vì 4 defect: badge đỏ
vĩnh viễn, badge global vs panel per-draw, key thừa trong `Record<...OpsAlertType, boolean>`, streak reset
mỗi invocation.

**Max3D Pro KHÔNG phải:** thêm member `Max3dproOpsAlertType`, key `enabled` default + zod, label
`ops-constants.ts`, nhánh render `alerts-panel.tsx`. **Pro hiện chưa có `worker_stuck`** (grep 0) → ADD 2 dòng
gọi base class trong `runTick` (success `clearStalledItem`, catch SAU guard `LockTakenOverError` gọi
`recordStalledItem`), không try/catch, + `protected readonly description` mỗi worker. Tín hiệu hiển thị ở
trang BO chung `/system/workers`. Tiên quyết `system-worker-health/p0-01`+`p0-02` — **đã có trong code**.

### 5.8. ✅ P0 — Worker health (phần worker MỚI nhất, dùng chung `worker-core`)
**KEEP** — hạ tầng **đã code xong** ở `worker-core` + Keno; Pro chỉ tiêu thụ: `stalledItems` trên lock doc thay `worker_stuck` (persist qua invocation, tự rỗng khi hồi phục, flush trong `finalizeAndRelease` ⇒ 0 DB call thêm) · 2 method base `recordStalledItem`/`clearStalledItem` · `description` (`$set`) cho CẢ 2 worker (`stats-sync`+`ops-alerts`) · `kind: Worker` tự động · trang BO `/system/workers` tự hiện. Chỉ ADD ~3 dòng/worker.

## 6. Câu hỏi mở — ĐÃ CHỐT TOÀN BỘ (user duyệt 03/08/2026)

| # | Câu hỏi | Chốt |
|---|---|---|
| 1 | `pair_stats` (a) — đổi `evaluate-alerts` + snapshot đọc pairs từ collection phụ? | **CHỐT (a)** — tách `max3dpro_draw_pair_stats` (ORDERED). User duyệt tách pair_stats + account_stats tương tự Max 3D. Hạ RAM 10⁶ + hết drift. |
| 2 | Ordered xuyên suốt `toOrderedPairKey` (ghi+đọc+eval, grep 0 sort)? | **BẮT BUỘC giữ** — pairKey `"first>second"`, KHÔNG normalize. Audit grep 0 sort như p0-02 gốc. |
| 3 | `topAccounts` tách hay giữ? | **TÁCH** `max3dpro_draw_account_stats` (đồng bộ Pro pair). |
| 4 | `open-sales.ts` Pro có `SalesClosed → SalesOpen`? | **CÓ** — mọi game mở bán lại. → `final` CHỈ ở `Settled`/`Void`. |
| 5 | `byPlayType.*.entries` xoá hay giữ? | **Kiểm UI** — không render → **XOÁ** (plan p1-01). |
| 6 | Thứ tự | Bingo 18 → Max 3D → **Max 3D Pro** (cuối). |

`tripletStakes` `$inc` dynamic path: **xác nhận an toàn** (user) — như Max 3D, triplet "000".."999" validate ở place-bet.

→ **Status analysis: sẵn sàng lên plan.**

## 7. Plans phái sinh

Đặt tại `.cursor/plans/max3dpro-ops-risk-control/stats-worker-simplification/`:
- `p0-01-pair-account-stats-collections.plan.md` — §5.1 + §5.7: `max3dpro_draw_pair_stats` **ORDERED** (`"first>second"`, KHÔNG sort) + `max3dpro_draw_account_stats` + bỏ `Set<accountId>` per-pair khỏi RAM + index `{drawId,units:-1}`/`{drawId,amount:-1}` + đổi eval (`pair_liability` giữ forward/reverse)/snapshot đọc từ collection phụ. **Riêng & nặng nhất của Pro.**
- `p0-02-port-inc-model.plan.md` — §5.2: `applyDelta` (`totals`+`byPlayType`+`tripletStakes.<t>`) + bỏ `seed()`/band-aid + **xoá recompute** + `findNotFinal`/`ensureDocs`/`stampFinal` + extends `TickLoopWorker` (import `@megawin/worker-core/workers`) + `recordStalledItem`/`clearStalledItem` + `description` (§5.8).
- `p0-03-split-ops-alerts-worker.plan.md` — §5.3: worker `ops-alerts` riêng + index `{updatedAt:1}` + yml + `description`.
- `p0-04-minimal-docs-read-defaults.plan.md` — §5.6 + §5.7.
- `p1-01-code-quality.plan.md` — §5.7 Q1 + Q2 (kiểm UI → xoá `byPlayType.*.entries`).

**PHẢI XOÁ khi port (§7 Keno):** `upsertFull`, `recomputeClosedDraws`, `seed()`, band-aid `Math.max`, `Set<accountId>` per-pair RAM, `POST_CLOSE_STATUSES`, `RECOMPUTE_PAGE_SIZE`, `topPairs`/`topAccounts` in-doc.

Thứ tự: cuối cùng trong 3 game (sau Bingo 18, Max 3D). Copy khung Max 3D + delta ordered pair. Trong game: p0-01 → p0-02 → p0-03 → p0-04 → p1-01.

> ✅ **Đã viết chi tiết** (5 plan + `00-overview.md`) tại thư mục trên. Mỗi plan gồm: pattern tham chiếu,
> danh sách file, verify, bảng review-rủi-ro, rollback. Xem `00-overview.md` cho bảng trạng thái + thứ tự
> phụ thuộc + nguyên tắc chung.

---

*Living document — cập nhật theo `.cursor/analysis/README.md`.*
