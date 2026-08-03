---
name: ""
overview: ""
todos: []
isProject: false
---

# p2-01 — Scale-hardening worker stats (Max 3D Pro)

> **Nguồn gốc:** `../keno-ops-risk-control/p2-01-stats-worker-scale-hardening.plan.md` (review sâu Keno 01/08/2026).
> **Verify Max 3D Pro (01/08/2026):** đọc trực tiếp code hiện tại, đối chiếu R1–R11 — bảng §1.
> **Phase:** P2 · **Phụ thuộc:** p0-02 (stats doc), p0-04 (alerts) đã chạy production.
> **Bản mẫu kiến trúc:** Keno p2-01 §3.5 + Max 3D p2-01. Pro **NẶNG NHẤT toàn bộ 4 game ở R3/R5** — key space pair ORDERED **10⁶**, mỗi board `multiNumber` 20 bộ = **380 ordered pair**, mỗi pairKey kèm `Set<accountId>` trong RAM.

## Mục tiêu

Worker `max3dpro_draw_betting_stats` = Max 3D + delta ordered-pair. Dính đủ nhóm rủi ro correctness (R3/R5/R9/R11) và document-size (R6 ~50–60KB), **nhưng điểm nghiêm trọng nhất là R3/R5 áp lực RAM + drift**:

- Mỗi board `multiNumber` (3–20 triplet) expand thành **P(n,2) ordered pair** — 20 bộ = **380 pair**. Key ORDERED `"first>second"` ((A,B)≠(B,A): chiều đúng = ĐB ×`special`, chiều ngược = phụ ĐB ×`specialSub`) → không gian khoá lý thuyết **1000×1000 = 10⁶**.
- Map `pairs` giữ nguyên trong RAM suốt recompute, **mỗi key kèm `Set<string> accountIds`**. Kỳ nhiều board multiNumber lớn → map phình + drift top-K lớn hơn Max 3D (key space gấp đôi vì giữ thứ tự).

Ordered là **bản chất giải Pro** (`max3dpro-game-rules.mdc`) → **KHÔNG** giảm bằng bỏ thứ tự (khác plus Max 3D unordered). Đây là ràng buộc cứng của mọi giải pháp.

Áp **hướng §3.5 Keno**: `$inc` path + xoá recompute + `final` điều kiện thoát. Delta ordered-pair xử lý như Max 3D nhưng key space lớn hơn → **collection phụ pair (§2.4a) đáng giá hơn** ở Pro.

**KHÔNG phải mục tiêu:** đổi kiến trúc; đổi công thức exposure (`computeProPairLiabilities` forward×special + reverse×specialSub + tail proxy — đúng); **KHÔNG normalize/sort pairKey** (giữ ordered là bắt buộc); đụng hot path.

## 1. Bảng verify R1–R11 (Max 3D Pro, code hiện tại)

| # | Rủi ro | Bị? | Bằng chứng |
|---|---|:---:|---|
| R1 | Mảng object `accounts` không trần + RMW | **KHÔNG** | `topPairs[].accounts: number`; `Set<accountId>` chỉ RAM (`stats-accumulator.ts:285-295`). Không collection phụ. |
| R2 | `$expr` + `$size` trên mảng | **KHÔNG** | `$expr` chỉ ở `ticket-repo.ts` trên scalar. |
| R3 | Recompute full-RAM + không resumable | 🔴 **BỊ (nặng nhất 4 game)** | `pairs` map ORDERED key space **10⁶**, 380 pair/board multiNumber, **mỗi key kèm `Set<accountId>`** (`stats-accumulator.ts:216-239`); cursor init `undefined` mỗi draw, không trần. |
| R4 | Vòng đọc không trần + `extendLock` ngoài vòng | 🟠 **BỊ** | `for(;;)` thoát theo batch, không trần; `extendLock` SAU tick. |
| R5 | Drift top-K tích lũy | 🟠 **BỊ (nặng hơn Max 3D)** | `seed()` top-K; drift `units`/`amount` cho pair rớt ngoài top-K — **nhiều pair rớt hơn** vì key space 10⁶. Band-aid `Math.max` chỉ cứu `accounts`. |
| R6 | `upsertFull` `$set` full doc | 🔴 **BỊ** | `$set` toàn doc ~50–60KB (`tripletStakes` ≤1000 + `topPairs` ordered + topPotential/topAccounts). |
| R7 | `getManyByDrawIds` không projection | 🟠 **BỊ** | full doc × #draw × 2/tick. |
| R9 | Không try/catch per-draw | 🟠 **BỊ** | `for (drawId …)` không try/catch. |
| R11 | Void sau `final` không reset | 🔴 **BỊ** | `finalize-void.ts` không chạm stats; không `resetFinal`. |

## 2. Thiết kế mới (áp Keno §3.5)

### 2.1. `final` = điều kiện thoát (Keno §3.5.2)

`final:true` **CHỈ** khi `status ∈ {Settled, Void}`. Void → stamp final giữ nguyên số. Fix R11.

### 2.2. Nguồn điều phối = `findNotFinal()` — y §3.5.4

`candidates = findNotFinal() ∪ (SalesOpen chưa có doc)`; try/catch riêng mỗi kỳ; drain bounded + extendLock trong vòng; `$inc` counters; `$set final` khi drained-hết && terminal. Xoá `recomputeClosedDraws` + `POST_CLOSE_STATUSES` + `RECOMPUTE_PAGE_SIZE` + `seed()`.

### 2.3. `$inc` theo path — `tripletStakes` + `byPlayType` (B1)

| Nhóm | Path `$inc` | Ghi chú |
|---|---|---|
| `totals` | 5 field | cố định |
| `byPlayType` | `multiNumber/multiDigit` × `amount/units/boards/entries` | 2×4 = 8 path cố định |
| `byTenant[tenantId]` | `amount/entries/commission` | dynamic bounded |
| `tripletStakes[t]` | `units/amount/boards` | dynamic ≤1000, chỉ key có delta |
| watermark | `$set lastEntryId` | |

Accumulator → delta-builder per-tick, `$inc` chỉ path có delta. `tripletStakes` sparse → không rewrite 1000 key.

### 2.4. Pair ORDERED tích lũy — **tách collection phụ (khuyến nghị mạnh ở Pro)**

Đây là điểm khác biệt lớn nhất với Bingo 18/Max 3D. Vì key space **10⁶** + 380 pair/board + drift nặng:

- **(a) `max3dpro_draw_pair_stats`** — 1 doc/`{drawId, pairKey}` (pairKey ORDERED `"first>second"`), `$inc units/amount`, `accountCount` qua `upsertedCount`, index `{drawId:1, units:-1}`, TTL 90d.
  - Ghi bằng `bulkWrite` `$inc` upsert per-pair-delta trong tick → **không giữ Set trong RAM cross-invocation, không drift, không RMW mảng**.
  - `topPairs` (eval alert `pair_liability` + UI) query top-K theo `{drawId:1, units:-1}` khi đọc → IXSCAN, O(K).
  - **Xoá `Set<accountId>` khỏi RAM accumulator** → hạ áp lực RAM R3 tận gốc (đây là lý do (a) ưu tiên hơn hẳn ở Pro so với Max 3D).
  - ⚠️ **Giữ thứ tự tuyệt đối:** `pairKey` = `toOrderedPairKey(first, second)`, KHÔNG sort — audit grep 0 normalize như p0-02.
- **(b) giữ trong doc + nhãn "gần đúng"** — KHÔNG khuyến nghị ở Pro (drift nặng nhất + RAM Set 10⁶).

`topAccounts` (tích lũy) → collection phụ `max3dpro_draw_account_stats` tương tự (hoặc (b) nếu chấp nhận). `topPotential` bất biến → giữ nguyên.

### 2.5. Thay recompute bằng phát-hiện-lệch (Keno §3.5.6)

`countDocuments` vs `totals.entries` → alert + nút "Tính lại" `$group` phía Mongo on-demand.

## 3. Fix rẻ làm trước

| Fix | Rủi ro | Mô tả | Vị trí |
|---|---|---|---|
| **F1** | R11 | `resetFinal` + `finalize-void.ts`; hoặc §2.1. | `betting-stats-repo.ts`, `finalize-void.ts` |
| **F2** | R4 | `extendLock` trong vòng + trần `maxEntriesPerTick` — tầng base. | `sync-betting-stats.ts` / base |
| **F3** | R9 | try/catch per-draw. | `sync-betting-stats.ts` |
| **F4** | R7 | Projection `getManyByDrawIds` / `findNotFinal`. | `betting-stats-repo.ts` |

## 4. File cần sửa (Max 3D Pro)

| File | Rủi ro / việc |
|---|---|
| `packages/game-max3dpro-application/src/use-cases/operations/sync-betting-stats.ts` | R3 R4 R9 — xoá recompute, 1 vòng lặp, try/catch, extendLock trong vòng |
| `packages/game-max3dpro-application/src/use-cases/operations/stats-accumulator.ts` | R3 R5 R6 — bỏ `seed()`+`Set accountIds`+band-aid; delta-builder `$inc`; pair-delta ghi collection phụ (§2.4a) |
| `packages/game-max3dpro-application/src/infras/repos/betting-stats-repo.ts` | R6 R7 R11 — `incDelta()` path, projection, `resetFinal`, `findNotFinal` |
| `packages/game-max3dpro-application/src/infras/repos/entry-repo.ts` | R3 R4 — trần đọc |
| `packages/game-max3dpro-application/src/use-cases/operations/get-ops-snapshot.ts` | R7 + topPairs từ collection phụ (query top-K ordered) |
| `packages/game-max3dpro-application/src/use-cases/operations/evaluate-alerts.ts` | `pair_liability` đọc topPairs từ collection phụ (giữ ordered forward/reverse) |
| `packages/game-max3dpro-application/src/use-cases/void/finalize-void.ts` | R11 |
| `packages/game-max3dpro/src/entities/betting-stats.ts` | shape (final semantics, bỏ/đổi topPairs nếu (a)) |
| `packages/game-max3dpro/src/indexes/index.ts` | index `{final:1}`; §2.4a: collection + TTL `max3dpro_draw_pair_stats` + index `{drawId,units:-1}` |
| `apps/worker-max3dpro/src/handlers/stats/stats-sync.ts` | tách schedule/lock (R8 — chỉ khi cần) |
| **mới (§2.4a)** | `packages/game-max3dpro-application/src/infras/repos/pair-stats-repo.ts` (+account) + entity + mapper |

**Dùng chung:** `packages/worker-core/src/use-cases/locked-worker.use-case.ts` (F2/R4), `packages/game-core/src/types/betting-stats.ts`.

## 5. Câu hỏi mở (chốt trước khi code)

1. **§2.4 pair:** chọn (a) collection phụ — **khuyến nghị mạnh ở Pro** (hạ RAM 10⁶ + hết drift, chi phí +1 collection + đổi eval alert). Xác nhận chấp nhận đổi `evaluate-alerts` đọc pairs từ collection phụ (giữ ordered).
2. **Ordered pairKey xuyên suốt collection phụ:** xác nhận `toOrderedPairKey` dùng nhất quán ở ghi + đọc + eval; audit grep 0 sort như p0-02.
3. `open-sales.ts` Pro có `SalesClosed → SalesOpen` không?
4. Fix R4/R11 tầng base hay từng game? Ưu tiên base.

## 6. Thứ tự thực thi

1. **F1 (R11)** + **F3 (R9)** — rẻ, chặn sai-data + cascade.
2. **F2 (R4)** — tầng base cùng 3 game.
3. **§2.4a collection phụ pair** — **ưu tiên #1 riêng của Pro** (hạ R3 RAM 10⁶ + drift R5 tận gốc). Đây là phần khác biệt & nặng nhất, làm cẩn thận giữ ordered.
4. **§2.3 `$inc` + xoá recompute + `final` điều kiện thoát** (R3/R5/R6 còn lại).
5. **F4 (R7)** — gộp §2.

## 7. Review BẮT BUỘC sau mỗi bước

- `pnpm --filter @megawin/game-max3dpro-application check-types` + test exposure/accumulator (đặc biệt `expandSelectionToPairs` 380 pair).
- `pnpm --filter @megawin/backoffice check-types` (xoá `.next` nếu đổi DTO).
- **Audit ordered:** grep `sort`/`normalize`/`toPairKey` trong path pair — 0 kết quả đảo thứ tự. Test (A,B) và (B,A) ra 2 key khác nhau, forward×special vs reverse×specialSub đúng.
- Idempotency: worker 2 lần cùng data → pair_stats + stats KHÔNG đổi.
- Void kỳ đã `final` → số đúng §2.1.
- Checklist Keno p2-01 §7 (15 mục) PHẢI pass — đặc biệt mục 1 (mảng object không trần → nay pair đã tách collection).
