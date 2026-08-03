---
name: ""
overview: ""
todos: []
isProject: false
---

# p2-01 — Scale-hardening worker stats (Max 3D)

> **Nguồn gốc:** `../keno-ops-risk-control/p2-01-stats-worker-scale-hardening.plan.md` (review sâu Keno 01/08/2026).
> **Verify Max 3D (01/08/2026):** đọc trực tiếp code hiện tại, đối chiếu R1–R11 — bảng §1.
> **Phase:** P2 · **Phụ thuộc:** p0-02 (stats doc), p0-04 (alerts) đã chạy production.
> **Bản mẫu kiến trúc:** Keno p2-01 §3.5. Max 3D **NẶNG HƠN Keno ở R6** (doc ~80KB `tripletStakes` 1000 key bị `$set` toàn bộ mỗi 30s).

## Mục tiêu

Worker `max3d_draw_betting_stats` là bản copy skeleton Keno → dính đủ nhóm rủi ro correctness (R3/R5/R9/R11) **và** nhóm document-size **nặng hơn Keno**: doc chứa `tripletStakes` Record **≤1000 key** (mỗi key `straightUnits/combo3Units/combo6Units/amount/boards`) ≈ **80KB**, cộng `topPairs`/`topPotential`/`topAccounts` — bị `$set` **ghi lại toàn bộ mỗi tick** (default 30s). Write amplification cao hơn Keno.

Áp **hướng §3.5 Keno** (đã chốt): `$inc` theo path + xoá recompute + `final` là điều kiện thoát. Điểm khác Keno: Max 3D có `tripletStakes` sparse cần `$inc` theo dynamic path, và `topPairs` (metric tích lũy) cần xử lý drift.

**KHÔNG phải mục tiêu:** đổi kiến trúc pre-aggregate; đổi công thức exposure (`computeBasicWorstCase` greedy per-tier + `computePairLiabilities` — đúng); đụng hot path place-bet; bỏ thứ tự pair (Max 3D dùng unordered `"t1,t2"` là ĐÚNG với plus bipartite — KHÔNG đổi).

## 1. Bảng verify R1–R11 (Max 3D, code hiện tại)

| # | Rủi ro | Bị? | Bằng chứng |
|---|---|:---:|---|
| R1 | Mảng object `accounts` không trần + RMW | **KHÔNG** | `topPairs[].accounts: number`; `accountIds: Set` chỉ trong RAM, persist bằng `Math.max(baseline, set.size)` (`stats-accumulator.ts:315-325`). Không collection phụ. |
| R2 | `$expr` + `$size` trên mảng | **KHÔNG** | `$expr` duy nhất ở `ticket-repo.ts` trên **scalar** `progress.settledDraws` (settle idempotency), không phải stats. |
| R3 | Recompute full-RAM + không resumable | 🔴 **BỊ** | `recomputeClosedDraws`: cursor init `undefined` mỗi draw, giữ full state RAM, không trần. ~6 kỳ mở/tuần → xác suất thấp nhưng vẫn dính. |
| R4 | Vòng đọc không trần + `extendLock` ngoài vòng | 🟠 **BỊ** | `for(;;)` thoát theo batch, không trần cứng item/tick; `extendLock()` gọi SAU `runTick` (mức tick), không trong vòng đọc. |
| R5 | Drift top-K tích lũy | 🟠 **BỊ** | `seed()` nạp counters+byPlayType+`tripletStakes` ĐỦ; `topPairs`/`topAccounts`/`topPotential` chỉ top-K → `units`/`amount` drift cho phần tử rớt ngoài top-K. **Band-aid `Math.max`** chỉ cứu `accounts`, KHÔNG cứu `units`/`amount`. |
| R6 | `upsertFull` `$set` full doc | 🔴 **BỊ (nặng)** | `$set: snapshot` toàn doc (`betting-stats-repo.ts:54-59`); doc ~80KB (`tripletStakes` 1000 key × 3 nhóm units + topPairs/topPotential/topAccounts). |
| R7 | `getManyByDrawIds` không projection | 🟠 **BỊ** | `findMany({drawId:{$in}})` không projection → kéo full 80KB × #draw × 2 lần/tick. |
| R9 | Không try/catch per-draw | 🟠 **BỊ** | `for (drawId of openDrawIds)` không try/catch → 1 kỳ lỗi sập invocation. |
| R11 | Void sau `final` không reset | 🔴 **BỊ** | `finalize-void.ts` không chạm `betting_stats`; không `resetFinal`. Void sau `final:true` → số cũ vĩnh viễn. |

## 2. Thiết kế mới (áp Keno §3.5)

### 2.1. `final` = điều kiện thoát (Keno §3.5.2)

`final:true` **CHỈ** khi `draw.status ∈ {Settled, Void}`. Các status khác (`SalesClosed`/`Published`/`Settling`/`Voiding`) **KHÔNG** stamp final. Void → stamp final, **giữ nguyên số** (entry void đã filter tại nguồn; số đã tích là audit hợp lệ). Fix R11 tự nhiên.

### 2.2. Nguồn điều phối = `findNotFinal()` (KHÔNG `draw.status`)

Y §3.5.4 Keno: `candidates = findNotFinal() ∪ (SalesOpen chưa có doc)`; mỗi candidate try/catch riêng; drain bounded + extendLock trong vòng; `$inc` counters; `$set final` khi drained-hết && status ∈ {Settled, Void}. Xoá `recomputeClosedDraws` + `POST_CLOSE_STATUSES` + `RECOMPUTE_PAGE_SIZE` + `seed()` + tham số `final` của `toSnapshot`.

### 2.3. `$inc` theo path — CẢ `tripletStakes` sparse (B1)

| Nhóm | Path `$inc` | Ghi chú |
|---|---|---|
| `totals` | 5 field | cố định |
| `byPlayType` | `basicStraight/basicCombo3/basicCombo6/plus` × `amount/units/boards/entries` | 4×4 = 16 path cố định |
| `byTenant[tenantId]` | `amount/entries/commission` | dynamic, bounded ~#tenant |
| `tripletStakes[t]` | `straightUnits/combo3Units/combo6Units/amount/boards` | **dynamic key (≤1000)** — `$inc` theo path `tripletStakes.<t>.<field>` chỉ cho key CÓ delta trong tick |
| watermark | `$set lastEntryId` | |

- Accumulator thành **delta-builder per-tick**: chỉ giữ delta của các entry drain trong tick, build `$inc` doc bỏ path delta=0. `tripletStakes` sparse → mỗi tick chỉ đụng vài key có cược mới, KHÔNG rewrite cả 1000 key (đây là điểm ăn tiền lớn nhất so với `$set` 80KB).
- Hết drift `tripletStakes` vì DB tự cộng dồn.

### 2.4. top-K tích lũy (`topPairs`, `topAccounts`) — bỏ band-aid, sửa gốc

`topPairs`/`topAccounts` là metric **tích lũy** → `$inc` array không giải quyết sort. Phương án (chốt khi review — §5):

- **(a) Tách collection phụ** `max3d_draw_pair_stats` (`{drawId, pairKey}` unique, `$inc units/amount`, `accountCount` qua `upsertedCount`, index `{drawId:1, units:-1}`, TTL 90d) + `max3d_draw_account_stats` tương tự. Query top-K khi **đọc snapshot**/eval alert. **Hết drift hoàn toàn** + có dữ liệu outstanding/kỳ. Đây là mô hình Keno A1/C1/C2 hướng tới.
- **(b) Giữ trong doc + ghi chú UI "gần đúng, chính xác khi kết sổ"** — rẻ, còn drift `units`/`amount` ngoài top-K. Max 3D ~6 kỳ/tuần, số pair/account vừa phải → drift chấp nhận được nếu ghi nhãn trung thực.

`topPotential` (bất biến/entry) → KHÔNG drift, giữ nguyên (ghi top-K khi entry lọt top).

### 2.5. Thay recompute bằng phát-hiện-lệch (Keno §3.5.6)

`countDocuments({drawId, status:{$ne:Void}})` vs `totals.entries` → lệch thì **alert vận hành** + nút "Tính lại kỳ này" (`$group` phía Mongo, `allowDiskUse`, on-demand). KHÔNG recompute phòng hờ trong tick loop.

## 3. Fix rẻ làm trước (không phụ thuộc §2)

| Fix | Rủi ro | Mô tả | Vị trí |
|---|---|---|---|
| **F1** | R11 | `resetFinal(drawId)` + gọi từ `finalize-void.ts`; hoặc theo §2.1 chỉ stamp final khi Settled/Void. | `betting-stats-repo.ts`, `finalize-void.ts` |
| **F2** | R4 | `extendLock()` trong vòng đọc + trần `maxEntriesPerTick` — ưu tiên tầng base. | `sync-betting-stats.ts` / base |
| **F3** | R9 | try/catch per-draw. | `sync-betting-stats.ts` |
| **F4** | R7 | Projection `getManyByDrawIds` / `findNotFinal`. | `betting-stats-repo.ts` |

## 4. File cần sửa (Max 3D)

| File | Rủi ro / việc |
|---|---|
| `packages/game-max3d-application/src/use-cases/operations/sync-betting-stats.ts` | R3 R4 R9 — xoá recompute, 1 vòng lặp, try/catch, extendLock trong vòng |
| `packages/game-max3d-application/src/use-cases/operations/stats-accumulator.ts` | R5 R6 — bỏ `seed()` + band-aid `Math.max`; thành delta-builder xuất `$inc` (đặc biệt `tripletStakes` sparse) |
| `packages/game-max3d-application/src/infras/repos/betting-stats-repo.ts` | R6 R7 R11 — `incDelta()` path (gồm `tripletStakes.<t>`), projection, `resetFinal`, `findNotFinal` |
| `packages/game-max3d-application/src/infras/repos/entry-repo.ts` | R3 R4 — `getEntriesForStatsAfter` trần |
| `packages/game-max3d-application/src/use-cases/operations/get-ops-snapshot.ts` | R7 + topPairs/topAccounts đọc từ collection phụ (nếu §2.4a) |
| `packages/game-max3d-application/src/use-cases/operations/evaluate-alerts.ts` | nếu đổi shape (topPairs từ collection phụ) |
| `packages/game-max3d-application/src/use-cases/void/finalize-void.ts` | R11 |
| `packages/game-max3d/src/entities/betting-stats.ts` | shape (final semantics, topPairs/topAccounts) |
| `packages/game-max3d/src/indexes/index.ts` | index `{final:1}`; nếu §2.4a: collection + TTL `max3d_draw_pair_stats`/`_account_stats` + index `{drawId,units:-1}` |
| `apps/worker-max3d/src/handlers/stats/stats-sync.ts` | tách schedule/lock (R8 — chỉ khi cần) |
| **mới (nếu §2.4a)** | `packages/game-max3d-application/src/infras/repos/pair-stats-repo.ts`, `account-stats-repo.ts` + entity + mapper |

**Dùng chung:** `packages/worker-core/src/use-cases/locked-worker.use-case.ts` (F2/R4), `packages/game-core/src/types/betting-stats.ts` (`OpsStatsConfig` nếu thêm field).

## 5. Câu hỏi mở (chốt trước khi code)

1. **§2.4** `topPairs`/`topAccounts`: tách collection phụ (a — hết drift, +2 collection) hay giữ doc + nhãn "gần đúng" (b — rẻ)? Cân bằng: Max 3D 6 kỳ/tuần, drift nhỏ hơn Keno → (b) có thể đủ, nhưng (a) đồng bộ đích Keno.
2. **`tripletStakes` `$inc` dynamic path** an toàn với sparse ≤1000 key — xác nhận không có key injection (triplet luôn "000".."999", validate tại place-bet). ✅ kỳ vọng an toàn.
3. `open-sales.ts` Max 3D có `SalesClosed → SalesOpen` không? (quyết định mức nghiêm trọng `final` sai nghĩa).
4. Fix R4/R11 tầng base hay từng game? Ưu tiên base.

## 6. Thứ tự thực thi

1. **F1 (R11)** + **F3 (R9)** — rẻ, chặn sai-data-vĩnh-viễn + cascade.
2. **F2 (R4)** — tầng base cùng lúc 3 game.
3. **§2 (R3+R5+R6)** — **ưu tiên cao hơn Bingo 18** vì doc 80KB. `$inc tripletStakes` sparse là điểm ăn tiền lớn nhất. Xoá recompute + `final` điều kiện thoát.
4. **F4 (R7)** — gộp vào §2.

## 7. Review BẮT BUỘC sau mỗi bước

- `pnpm --filter @megawin/game-max3d-application check-types` + test exposure/accumulator.
- `pnpm --filter @megawin/backoffice check-types` (xoá `.next` nếu đổi DTO).
- Idempotency: worker 2 lần cùng data → stats KHÔNG đổi.
- Void kỳ đã `final` → số đúng theo §2.1.
- **Số học `$inc`:** so tổng `tripletStakes` sau `$inc` với `$set` cũ trên cùng data mẫu (không lệch).
- Checklist Keno p2-01 §7 (15 mục) PHẢI pass.
