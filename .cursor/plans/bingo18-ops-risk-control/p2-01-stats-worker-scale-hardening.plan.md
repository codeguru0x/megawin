---
name: ""
overview: ""
todos: []
isProject: false
---

# p2-01 — Scale-hardening worker stats (Bingo 18)

> **Nguồn gốc:** `../keno-ops-risk-control/p2-01-stats-worker-scale-hardening.plan.md` (review sâu Keno 01/08/2026).
> **Verify Bingo 18 (01/08/2026):** đọc trực tiếp code hiện tại, đối chiếu R1–R11 — bảng §1.
> **Phase:** P2 · **Phụ thuộc:** p0-02 (stats doc), p0-04 (alerts) đã chạy production.
> **Bản mẫu kiến trúc:** Keno p2-01 §3.5 (xoá recompute + `$inc` + `final` là điều kiện thoát). Bingo 18 **đơn giản nhất** trong 4 game → áp §3.5 gần như nguyên bản, KHÔNG cần collection phụ.

## Mục tiêu

Worker `bingo18_draw_betting_stats` hiện **đúng nghiệp vụ nhưng không scale** ở đúng những chỗ Keno đã phát hiện, vì là bản copy skeleton Keno. Bingo 18 **may mắn nhẹ hơn** ở nhóm document-size (doc chỉ ~2–3KB, 38 bucket cố định, KHÔNG có `tripletStakes`/`topPairs`/collection phụ) nhưng **vẫn dính** nhóm correctness/robustness (R3, R5, R9, R11) và một phần R4/R7.

Plan này áp **hướng §3.5 của Keno** (đã chốt): thay vì vá recompute, **xoá lý do tồn tại** của nó bằng `$inc` theo path + `final` làm điều kiện thoát vòng lặp duy nhất. Bingo 18 là ứng viên **sạch nhất** cho hướng này vì không có metric top-K tích lũy phức tạp trên document lớn.

**KHÔNG phải mục tiêu:** đổi kiến trúc "worker pre-aggregate + FE đọc `findOne` O(1)"; đổi công thức exposure 216-outcome (đúng); đụng hot path place-bet.

## 1. Bảng verify R1–R11 (Bingo 18, code hiện tại)

| # | Rủi ro | Bị? | Bằng chứng |
|---|---|:---:|---|
| R1 | Mảng object `accounts` không trần + RMW | **N/A** | Không có combo/pair, không collection stats phụ (chỉ `bingo18_draw_betting_stats`). |
| R2 | `$expr` + `$size` trên mảng | **N/A** | Grep 0 kết quả. |
| R3 | Recompute full-RAM + không resumable | 🔴 **BỊ** | `recomputeClosedDraws`: `let cursor: string \| undefined` khởi tạo lại mỗi lần (`sync-betting-stats.ts`), giữ full state RAM, không trần `maxEntriesPerTick`. |
| R4 | Vòng đọc không trần + `extendLock` ngoài vòng | 🟠 **BỊ** (giảm nhẹ) | Vòng `for(;;)` không trần; `extendLock()` gọi SAU tick, không trong vòng đọc. `BUDGET_MS 55s < ttl 120s` giảm rủi ro. |
| R5 | Drift top-K tích lũy | 🟠 **BỊ** | `seed()` chỉ nạp top-K `topAccounts`; account rớt ngoài top-K mất baseline → `amount` drift. KHÔNG có band-aid `Math.max`. `topPotential` KHÔNG drift (metric bất biến). |
| R6 | `upsertFull` `$set` full doc | 🟢 nhẹ | `$set` toàn snapshot nhưng doc ~2–3KB (38 bucket cố định). Write amplification thấp — **chấp nhận được**, sửa cùng B1 vì rẻ. |
| R7 | `getManyByDrawIds` không projection | 🟠 **BỊ** (nhẹ) | Kéo full doc; nhẹ vì doc nhỏ. |
| R9 | Không try/catch per-draw | 🟠 **BỊ** | Cả 2 vòng `for (drawId …)` không try/catch → 1 kỳ lỗi sập cả invocation. |
| R11 | Void sau `final` không reset | 🔴 **BỊ** | `finalize-void.ts` KHÔNG chạm `betting_stats`; KHÔNG có `resetFinal` (grep 0). Void sau `final:true` → giữ số cũ **vĩnh viễn**. |

**Tránh được R1/R2/R6-nặng/R8** — thiết kế `byPlayType` 38 bucket cố định là **đúng hơn** Keno.

## 2. Thiết kế mới (áp Keno §3.5) — 1 vòng lặp, không recompute

### 2.1. `final` đổi nghĩa: điều kiện thoát, KHÔNG phải cờ chống chạy lại

**Chốt (theo Keno §3.5.2):** `final: true` **CHỈ** khi `draw.status ∈ {Settled, Void}` — 2 status terminal không quay lại nhận cược. `SalesClosed`/`Published`/`Settling`/`Voiding` **KHÔNG** stamp final.

> ⚠️ Kiểm tra Bingo 18 có cho `SalesClosed → SalesOpen` không (đọc `open-sales.ts` game bingo18). Nếu CÓ (giống Keno) thì đây là bug bom hẹn giờ y hệt — bắt buộc sửa. Nếu KHÔNG, vẫn theo chốt trên cho nhất quán 4 game + bền với B-b (status nhảy nhanh hơn 1 tick).

### 2.2. Nguồn điều phối = stats doc (`final:false`), KHÔNG phải `draw.status`

```text
1. candidates = statsRepo.findNotFinal()                    // index {final:1}, projection {drawId,lastEntryId}
              ∪ SalesOpen chưa có stats doc                  // kỳ vừa có cược đầu tiên
2. draws      = drawRepo.getByDrawIds(ids)                   // cần status để quyết định stamp final
3. for each candidate (try/catch RIÊNG — R9):
     drain entries _id > lastEntryId  (bounded + extendLock BÊN TRONG — R4)
     if delta:  $inc counters + $set lastEntryId + evaluate alerts     // B1
     if drained-hết && status ∈ {Settled, Void}:  $set final:true      // tick sau tự rời hàng đợi
```

Xoá `recomputeClosedDraws` + `POST_CLOSE_STATUSES` + `RECOMPUTE_PAGE_SIZE`. Bỏ `seed()` top-K + tham số `final` cũ của `toSnapshot`.

### 2.3. `$inc` theo path cố định (B1) — thay `$set` full doc

Bingo 18 doc **toàn field cố định** → `$inc` sạch, KHÔNG cần seed baseline:

| Nhóm | Path `$inc` | Số path |
|---|---|---|
| `totals` | `totals.revenue/entries/boards/commission/largeBetCount` | 5 |
| `byPlayType.singleNum["1".."6"]` | `.sets/.amount` | 6×2 |
| `byPlayType.doubleMatch["1".."6"]` | `.sets/.amount` | 6×2 |
| `byPlayType.tripleMatch.specific["1".."6"]` | `.sets/.amount` | 6×2 |
| `byPlayType.tripleMatch.any` | `.sets/.amount` | 2 |
| `byPlayType.sumTotal["3".."18"]` | `.sets/.amount` | 16×2 |
| `byPlayType.bigSmallDraw[big/small/draw]` | `.sets/.amount` | 3×2 |
| `byTenant[tenantId]` | `.amount/.entries/.commission` (dynamic key, bounded ~#tenant) | 3/tenant |
| watermark | `$set lastEntryId` | 1 |

- `$inc` chỉ trên **delta của tick** (accumulator thành **delta-builder thuần**, không seed) → doc DB tự cộng dồn, hết drift (R5) vì không còn seed top-K.
- Accumulator delta cho tick → build `$inc` doc từ Map delta (bỏ key delta = 0).

### 2.4. top-K không tích lũy được bằng `$inc` — xử lý riêng

`topAccounts` là metric **tích lũy** (amount cộng dồn/account) → KHÔNG `$inc` trực tiếp vào array trong doc. Chọn **phương án đơn giản cho Bingo 18** (không như Keno cần collection combo phức tạp):

- **`topPotential` (bất biến/entry):** giữ nguyên cơ chế — mỗi entry tính 1 lần khi drain, `$push` + giữ top-K bằng `$slice` (hoặc ghi lại array top-K khi có entry mới lọt top). KHÔNG drift.
- **`topAccounts` (tích lũy):** tạo collection phụ tối thiểu `bingo18_draw_account_stats` (`{drawId, accountId}` unique, `$inc amount/entries`, index `{drawId:1, amount:-1}`, TTL 90d) → query top-K khi **đọc snapshot** thay vì lưu trong doc. Hết drift + có sẵn dữ liệu cho link "outstanding theo player/kỳ" mà alert `large_bet` đang cần.
  - **Cân nhắc rẻ hơn (nếu chấp nhận):** giữ `topAccounts` trong doc như hiện tại nhưng **ghi chú UI "gần đúng, chính xác khi kết sổ"** và bỏ recompute — drift chỉ ở amount ngoài top-K, thực tế nhỏ. Chốt phương án khi review (xem §5 câu hỏi mở).

### 2.5. Thay giá trị "tự chữa lành" của recompute (Keno §3.5.6)

- Phát hiện lệch: `countDocuments({drawId, status:{$ne:Void}})` vs `totals.entries` — **1 query index-only**, không recompute phòng hờ.
- Khi lệch → **phát alert vận hành** (sai số thầm lặng → quan sát được) + nút "Tính lại kỳ này" chạy `$group` aggregation phía Mongo on-demand (KHÔNG trong tick loop).

## 3. Các fix rẻ, làm trước (không phụ thuộc §2)

| Fix | Rủi ro | Mô tả | Vị trí |
|---|---|---|---|
| **F1** | R11 | Thêm `resetFinal(drawId)` vào `betting-stats-repo` + gọi từ `finalize-void.ts`. HOẶC (ưu tiên) theo §2.1 chỉ stamp final khi Settled/Void → Void tự nhiên không kẹt. | `betting-stats-repo.ts`, `finalize-void.ts` |
| **F2** | R4 | `extendLock()` **bên trong** vòng đọc (mỗi N batch) + trần `maxEntriesPerTick`. Ưu tiên fix tầng base `LockedWorkerUseCase` (4 game chung nghiệm). | `sync-betting-stats.ts` / base |
| **F3** | R9 | try/catch **per-draw**: log + tiếp kỳ sau, không abort invocation. | `sync-betting-stats.ts` |
| **F4** | R7 | Projection cho `getManyByDrawIds` (`findNotFinal` chỉ `{drawId, lastEntryId, final}`). | `betting-stats-repo.ts` |

## 4. File cần sửa (Bingo 18)

| File | Rủi ro / việc |
|---|---|
| `packages/game-bingo18-application/src/use-cases/operations/sync-betting-stats.ts` | R3 R4 R9 — xoá recompute, 1 vòng lặp, try/catch, extendLock trong vòng, trần entries |
| `packages/game-bingo18-application/src/use-cases/operations/stats-accumulator.ts` | R5 — bỏ `seed()`, thành delta-builder; xuất delta cho `$inc` |
| `packages/game-bingo18-application/src/infras/repos/betting-stats-repo.ts` | R6 R7 R11 — `incDelta()` theo path, projection, `resetFinal`, `findNotFinal` |
| `packages/game-bingo18-application/src/infras/repos/entry-repo.ts` | R3 R4 — `getEntriesForStatsAfter` trần đọc (đã có limit param — xác nhận caller truyền trần) |
| `packages/game-bingo18-application/src/use-cases/operations/get-ops-snapshot.ts` | topAccounts đọc từ collection phụ (nếu chọn §2.4a) |
| `packages/game-bingo18-application/src/use-cases/operations/evaluate-alerts.ts` | nếu đổi shape snapshot |
| `packages/game-bingo18-application/src/use-cases/void/finalize-void.ts` | R11 — reset final |
| `packages/game-bingo18/src/entities/betting-stats.ts` | nếu đổi shape (final semantics, topAccounts) |
| `packages/game-bingo18/src/indexes/index.ts` | index `{final:1}`; nếu §2.4a: collection + TTL `bingo18_draw_account_stats` |
| `apps/worker-bingo18/src/handlers/stats/stats-sync.ts` | nếu tách schedule/lock (R8 — chỉ khi cần) |
| **mới (nếu §2.4a)** | `packages/game-bingo18-application/src/infras/repos/account-stats-repo.ts` + entity + mapper |

**Dùng chung (fix 1 lần, ảnh hưởng 4 game):**
- `packages/worker-core/src/use-cases/locked-worker.use-case.ts` — `extendLock`/`ttlSeconds` (F2/R4) nếu fix tầng base.

## 5. Câu hỏi mở (chốt trước khi code)

1. **§2.4 `topAccounts`:** tách collection phụ `bingo18_draw_account_stats` (hết drift, +1 collection) HAY giữ trong doc + ghi chú UI "gần đúng" (rẻ, còn drift nhỏ)? Bingo 18 số account/kỳ thấp hơn Keno → drift nhỏ hơn.
2. **`open-sales.ts` Bingo 18** có cho `SalesClosed → SalesOpen` không? (quyết định mức nghiêm trọng của bug `final` sai nghĩa).
3. Fix R4/R11 tầng base `LockedWorkerUseCase` (1 lần cho 4 game) hay từng game? Ưu tiên base.

## 6. Thứ tự thực thi

1. **F1 (R11)** + **F3 (R9)** — rẻ nhất, chặn sai-data-vĩnh-viễn + cascade failure. Không phụ thuộc §2.
2. **F2 (R4)** — nên fix tầng base cùng lúc 3 game khác.
3. **§2 (R3+R5+R6)** — refactor `$inc` + xoá recompute + `final` điều kiện thoát. Thay đổi lớn nhất, làm sau khi F1–F3 ổn định.
4. **F4 (R7)** — gộp vào §2 (projection `findNotFinal`).

## 7. Review BẮT BUỘC sau mỗi bước

- `pnpm --filter @megawin/game-bingo18-application check-types` + test exposure/accumulator.
- `pnpm --filter @megawin/backoffice check-types` (xoá `.next` trước nếu đổi DTO snapshot).
- Verify idempotency: chạy worker 2 lần trên cùng data → stats KHÔNG đổi (watermark + `$inc` chỉ delta mới).
- Verify void: void 1 kỳ đã `final` → stats recompute/giữ số đúng theo §2.1.
- Đối chiếu checklist Keno p2-01 §7 (15 mục) — mọi mục PHẢI pass trước merge.
