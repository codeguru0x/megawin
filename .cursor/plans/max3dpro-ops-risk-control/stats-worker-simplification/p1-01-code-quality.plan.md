# p1-01 — Max 3D Pro stats: dọn code quality (Q1–Q3)

> **Nguồn:** `.cursor/analysis/max3dpro-stats-worker-simplification.analysis.md` §5.7 · **Phase:** P1 ·
> **Phụ thuộc:** p0-03 (Q1 rà JSDoc trên cấu trúc SAU tách), p0-04 nên xong (Q2 mapper đã vá).
> **Bản chuẩn:** Keno `p1-01-keno-stats-code-quality` (Q1/Q2/Q3). **Pro KHÔNG có Q4 `worker_stuck`**
> (chưa từng có — grep 0) và KHÔNG có Q5 rename `boards→sets` (đã xong ở đợt Keno cho toàn hệ, Pro chỉ
> GIỮ `Max3dproPlayTypeStat.boards`/`Max3dproTripletStake.boards` đúng nghĩa `+=1` mỗi board).

## Mục tiêu

3 việc nhỏ độc lập, gom 1 PR "code quality", mỗi việc 1 commit riêng:

- **Q1** — quét comment/JSDoc stale còn nhắc kiến trúc cũ (`recomputeFull`/`recomputeClosedDraws`/`seed`/
  `upsertFull`/alert-trong-sync).
- **Q2** — vá lỗ type cast (`{...rest} as Entity` / `as unknown`) trong đường stats (đa phần đã vá ở
  p0-01/p0-04 mapper — Q2 xác nhận không tái phát nơi khác).
- **Q3** — kiểm UI → xoá field `entries` khỏi `Max3dproPlayTypeStat` (đã chốt analysis §6 Q5: kiểm không
  render → xoá).

## Q1 — Comment stale

Grep có chủ đích, đọc quanh từng match, sửa cho khớp hành vi HIỆN TẠI (code-quality §4 — sửa, không xoá
trừ khi code đã xoá):

```bash
rg -n "recomputeFull|recomputeClosedDraws|seed|upsertFull|skeleton|POST_CLOSE" \
  packages/game-max3dpro packages/game-max3dpro-application apps/worker-max3dpro
rg -n "alert" packages/game-max3dpro-application/src/use-cases/operations/sync-betting-stats.ts
```

Điểm đã biết trước:
- Handler `stats-sync.ts:12-13` "recomputeFull lúc salesClosed sửa chính xác" (đã sửa ở p0-02 §6 — xác nhận).
- `stats-accumulator.ts:17-18` JSDoc "recomputeFull lúc salesClosed sửa chính xác" + `:285` comment
  "accounts = max(baseline, set RAM)" — đã xoá cơ chế; sửa/xoá theo code.
- `betting-stats.ts:136-137` JSDoc `@deprecated topAccounts` nhắc "bị `$set` ghi lại mỗi 30s" — field đã
  xoá p0-01 nên JSDoc đi theo.
- Sau p0-03, JSDoc class sync worker KHÔNG được còn "alert" ngoài câu trỏ `EvaluateOpsAlertsUseCase`.

Đầu ra: match nào mô tả đúng hành vi hiện tại thì GIỮ (không dọn quá tay). Ghi "sửa thành gì" trong commit.

## Q2 — Lỗ type cast

```bash
rg -n " as [A-Z]| as unknown" \
  packages/game-max3dpro-application/src/infras/repos \
  packages/game-max3dpro-application/src/infras/mappers \
  packages/game-max3dpro-application/src/use-cases/operations
```

Điểm đã biết:
- `betting-stats-mapper.ts` `{...rest} as Entity` — **đã vá p0-04** (normalize tường minh). Xác nhận.
- Pair/account mapper (p0-01) — field-by-field, xác nhận không `as Entity`.
- Cast `accumulator`/`syncDraw` đọc documents thô (`board.playMode as PlayMode` v.v.): giữ nếu có comment
  1 dòng lý do (`playMode` string từ projection, đã qua Zod place-bet); nếu không, thêm comment hoặc thay
  projection type hẹp.

Tiêu chí: không còn `as Entity`/`as unknown as` che thiếu field; cast còn lại kèm comment lý do.

## Q3 — Xoá `entries` khỏi `Max3dproPlayTypeStat`

**Kiểm UI TRƯỚC (analysis §6 Q5 "kiểm UI → không render → xoá"):**

```bash
rg -n "\.entries" apps/backoffice/src/app/\(main\)/games/max3dpro
```

Nếu chỉ dùng `totals.entries` (KPI cấp draw — GIỮ) và KHÔNG dùng `byPlayType.*.entries` per-mode → XOÁ
field per-mode. Nếu UI CÓ render per-mode entries → GIỮ + đóng Q3 với ghi chú "UI dùng, không xoá".

Nếu xoá (trình tự an toàn — xoá entity TRƯỚC, compiler dẫn):

| File | Việc |
|---|---|
| `game-max3dpro/entities/betting-stats.ts` | xoá `entries` khỏi `Max3dproPlayTypeStat` (+JSDoc `:46-47`) |
| `.../operations/stats-accumulator.ts` | `emptyPlayTypeStat()` bỏ `entries:0`; `applyBoard` bỏ `stat.entries += 1` (`:214`) |
| `.../repos/betting-stats-repo.ts` | `applyDelta` bỏ `$inc` path `byPlayType.*.entries` (tự biến mất nếu build từ delta object — xác nhận) |
| `.../mappers/betting-stats-mapper.ts` | `normalizeByPlayType` bỏ merge `entries` (compiler bắt) |

Sau xoá: grep `\.entries` trong 2 package + FE → chỉ còn `totals.entries` + `byTenant.entries` +
`topPotential`/`account_stats.entries` + `ticket_entries` (không liên quan). Doc cũ còn field `entries`
per-mode: vô hại (mapper bỏ qua, `$inc` không chạm) — KHÔNG `$unset` migration.

> LƯU Ý: `Max3dproTripletStake.boards` + `Max3dproPlayTypeStat.boards` GIỮ (đếm `+=1` mỗi board, đúng
> nghĩa — KHÁC `totals.sets` = Σ betCount). Đừng rename lây (bài học Keno Q5 §7 rủi ro #7).

## Đánh giá & verify

1. `check-types` `@megawin/game-max3dpro` + `@megawin/game-max3dpro-application` + `@megawin/worker-max3dpro`
   + `@megawin/backoffice` (Q3 chạm entity FE đọc).
2. Q1: mỗi comment đã sửa đọc lại — mô tả đúng hành vi hiện tại; không còn nhắc `recompute`/`seed`/`upsertFull`
   như cơ chế đang sống.
3. Q2: grep `as Entity`/`as unknown as` trong đường stats → 0 (hoặc còn thì có comment lý do).
4. Q3: nếu xoá — grep `byPlayType.*.entries` = 0 mọi nơi; Operations render KPI/analytics đúng (entries
   cấp draw vẫn hiển thị từ `totals.entries`). Nếu giữ — ghi chú UI dùng.

## Review code & rủi ro

| # | Rủi ro | Mức | Kiểm |
|---|---|---|---|
| 1 | Q3 xoá `entries` nhưng UI/adapters FE đọc per-mode → mất số/crash | 🟠 | Grep FE TRƯỚC xoá; check-types `@megawin/backoffice` |
| 2 | Q1 dọn quá tay — xoá comment còn đúng | 🟡 | code-quality §4: sửa cho khớp, không xoá nếu code còn |
| 3 | Q2 gỡ cast làm lộ field thực sự optional (bug ẩn) → check-types đỏ | 🟡 | Fix theo compiler, không thêm `as` mới |
| 4 | Rename nhầm `boards`→`sets` per-mode (không thuộc Pro) | 🟠 | GIỮ `boards` đúng nghĩa `+=1`; KHÔNG đụng |
| 5 | Q3 sửa `applyDelta` sót path `entries` → `$inc` field rác | 🟢 | Grep `applyDelta` build object; explain doc mới không có field |

Trình tự: Q1 → Q2 → Q3 (mỗi việc 1 commit). Q3 làm cuối vì chạm nhiều file + FE. Mỗi commit `check-types`
trước khi sang việc kế.

## Rollback

3 việc độc lập → revert từng commit riêng. Không đụng dữ liệu (chỉ comment/type/field optional). Doc cũ
giữ `entries` per-mode sau Q3 revert vẫn đọc được (mapper thêm lại merge). An toàn nhất trong 5 plan.


