# p1-01 — Max 3D stats: dọn code quality (Q1–Q3)

> **Phase:** P1 · **Phụ thuộc:** p0-02 (Q1 rà JSDoc trên cấu trúc 2 worker SAU tách); p0-03/p0-04 nên xong
> trước để Q2/Q3 không đá diff (mapper normalize chạm cùng type) · **PR:** riêng, mỗi Q 1 commit.
> **Nguồn:** analysis §4.1 + §6 Q4 · bản chuẩn Keno `p1-01-keno-stats-code-quality.plan.md`.

## Mục tiêu

3 việc nhỏ độc lập, gom 1 PR "code quality":

- **Q1** — quét comment/JSDoc stale còn nhắc kiến trúc cũ (`recomputeClosedDraws`, `upsertFull`, `seed()`, `baselineAccounts`, alert-trong-sync).
- **Q2** — vá lỗ type cast (`as` che thiếu field) trong đường stats — trọng tâm là mapper spread mù (đã vá ở p0-04, Q2 chỉ xác nhận không tái phát nơi khác).
- **Q3** — kiểm UI có render `byPlayType.*.entries` per-nhóm không → nếu KHÔNG, xoá field `entries` khỏi `Max3dPlayTypeStat` (analysis §4.1 + §6 Q4). Tổng entries cấp draw GIỮ ở `totals.entries`.

> **KHÔNG có Q4 `worker_stuck`** (guide §7): Max 3D grep 0 match. Sức khoẻ worker qua `recordStalledItem`/
> `clearStalledItem` (p0-01/p0-02). KHÔNG thêm member `Max3dOpsAlertType`, KHÔNG key `enabled`, KHÔNG label
> `ops-constants.ts`, KHÔNG nhánh `alerts-panel.tsx`. Xem `.cursor/plans/system-worker-health/` (bài học Keno
> Q4 bị hoàn nguyên).
>
> **KHÔNG có Q5 rename `boards`→`sets`** như Keno: Max 3D `Max3dPlayTypeStat.boards` + `Max3dTripletStake.boards`
> ĐÚNG nghĩa (đếm `+=1` mỗi board, KHÁC `totals.sets = Σ betCount`) — JSDoc entity đã ghi rõ "không đổi theo
> rename 02/08/2026". KHÔNG rename. `totals.sets` đã đúng tên (game-core dùng chung, Keno đã rename).

## Q1 — Comment stale

Grep có chủ đích rồi sửa cho khớp hành vi HIỆN TẠI (code-quality §4 — sửa, không xoá trừ khi code đã xoá):

```bash
rg -n "recomputeClosedDraws|recomputeFull|upsertFull|POST_CLOSE_STATUSES|seed\(|baselineAccounts|skeleton" \
  packages/game-max3d packages/game-max3d-application apps/worker-max3d
rg -n "alert" packages/game-max3d-application/src/use-cases/operations/sync-betting-stats.ts
```

Điểm đã biết trước:
- JSDoc class sync worker (`sync-betting-stats.ts:1-24`) mô tả 4 bước cũ gồm "Safety-net recompute" + "Evaluator alert" — SAU p0-01/p0-02 phải viết lại (hàng đợi `final`, không recompute, alert trỏ `EvaluateOpsAlertsUseCase`).
- `stats-accumulator.ts` JSDoc header nhắc `upsertFull overwrite` + `recomputeFull lúc salesClosed` + `baselineAccounts` (`:7-10`, `:60-66`) — cơ chế đã xoá p0-01/p0-03.
- `betting-stats-repo.ts` JSDoc `upsertFull` — xoá theo code.

Đầu ra: match nào mô tả đúng hành vi hiện tại GIỮ (VD "doc cũ đọc đúng qua normalize"); match sai → sửa,
ghi "sửa thành gì" trong commit.

## Q2 — Lỗ type cast

```bash
rg -n " as [A-Z]| as unknown" \
  packages/game-max3d-application/src/infras/repos/betting-stats-repo.ts \
  packages/game-max3d-application/src/infras/repos/pair-stats-repo.ts \
  packages/game-max3d-application/src/infras/repos/account-stats-repo.ts \
  packages/game-max3d-application/src/infras/mappers \
  packages/game-max3d-application/src/use-cases/operations
```

Điểm đã biết trước:
- `betting-stats-mapper.ts` `{...rest} as Max3dDrawBettingStatsEntity` (`:12-13`) — **vá ở p0-04**. Q2 xác nhận không tái phát ở mapper mới (pair/account).
- `applyDelta` có thể cần `update as UpdateFilter<Document>` cho `$push topPotential` computed path (giống Keno) — ĐẠT nếu kèm comment 1 dòng lý do.
- `stats-accumulator.ts` `board.playType as PlayType` — ĐẠT nếu comment ghi rõ `playType` là string từ projection thô, đã qua Zod lúc place-bet.

Tiêu chí xong: các file trên không còn `as Entity`/`as unknown as` che thiếu field; cast buộc phải có kèm comment.

## Q3 — Field `entries` per-nhóm trong `Max3dPlayTypeStat`

`Max3dPlayTypeStat` có `entries` (`betting-stats.ts:46-47`, JSDoc ghi "xấp xỉ cross-batch"). Với mô hình
`$inc` (p0-01), giá trị xấp xỉ này KHÔNG được recompute sửa nữa (recompute đã xoá) → càng kém tin cậy.

**Trước khi xoá — kiểm UI có render không** (khác Keno đã chốt xoá; Max 3D cần xác nhận):

```bash
rg -n "\.entries" apps/backoffice/src/app/**/games/max3d/**
```

- Nếu FE PlayTypeRow/analytics KHÔNG render `entries` per-nhóm (chỉ dùng `amount`/`units`/`boards`/`sets`) → **xoá** như Keno Q3.
- Nếu CÓ render → giữ, nhưng đổi JSDoc ghi rõ "xấp xỉ, không recompute" + cân nhắc UI ghi nhãn ước tính.

**Trình tự xoá (nếu quyết định xoá):** xoá field khỏi entity TRƯỚC → `check-types` liệt kê mọi nơi đọc/ghi →
sửa theo compiler:

| File | Việc |
|---|---|
| `game-max3d/entities/betting-stats.ts` | xoá `entries` khỏi `Max3dPlayTypeStat` (+JSDoc) |
| `stats-accumulator.ts` | `applyStat` bỏ `stat.entries += 1` (`:270`); `emptyPlayTypeStat` bỏ `entries:0` |
| `betting-stats-repo.ts` | `applyDelta` byPlayType `$inc` bỏ path `.entries` (nếu build từ object thì tự biến mất — xác nhận) |
| `betting-stats-mapper.ts` | normalize (p0-04) bỏ field — compiler bắt |
| FE `max3d/operations/_lib/types.ts` + `adapters.ts` | xoá field tương ứng nếu có |

Doc cũ trên DB còn `entries` per-nhóm: vô hại — mapper normalize bỏ qua field lạ, `$inc` không chạm. KHÔNG `$unset` migration.

## Đánh giá & verify

1. `check-types`: `@megawin/game-max3d`, `@megawin/game-max3d-application`, `@megawin/worker-max3d`, `@megawin/backoffice` (Q3 chạm FE).
2. Q1: đọc lại grep sau sửa — 0 match sai.
3. Q2: grep tiêu chí — 0 cast mù còn lại.
4. Q3: grep `\.entries` — chỉ còn `totals.entries` + usage không liên quan (`ticket_entries`, `byTenant.entries`); UI Operations render bình thường (dev).

## Review & rủi ro

| # | Rủi ro | Mức | Kiểm |
|---|---|---|---|
| 1 | Q3 xoá nhầm `totals.entries` (có consumer KPI) thay vì `slot.entries` | 🟠 | Diff entity: chỉ `Max3dPlayTypeStat` mất field; `DrawBettingTotals` nguyên |
| 2 | Q3 xoá field mà FE đang render → cột trống | 🟠 | Grep FE TRƯỚC khi xoá (§Q3); nếu render thì giữ + ghi nhãn |
| 3 | Q1 sửa comment sai thực tế mới (sai còn tệ hơn) | 🟡 | Mỗi comment sửa trích dẫn code hiện hành trong PR |
| 4 | Q2 mở rộng scope sang mapper ngoài đường stats (draw/ticket…) | 🟡 | Chỉ 5 path §Q2; mapper khác là nợ riêng, KHÔNG mở scope |
| 5 | Q1 xoá comment mô tả LỊCH SỬ có chủ đích (VD "doc cũ đọc đúng qua normalize") | 🟡 | Giữ comment mô tả đúng hành vi hiện tại; chỉ sửa cái sai |

## Rollback

Q1/Q2 thuần văn bản/type — revert tự do. Q3 revert cần chấp nhận doc tạo trong thời gian bản mới thiếu
`entries` per-nhóm (không ai đọc — chính là lý do xoá). Dự án chưa deploy → không có dữ liệu thật lệch.
