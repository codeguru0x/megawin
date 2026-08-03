# p0-06 — Alert framework (collection + evaluator trong worker + đường đọc/ack)

> **Nguồn:** `.cursor/analysis/keno-operations-risk-control.analysis.md` §3.5, verdict #4/#5/#alert-framework/#13/#14.
> **Phase:** P0 · **Phụ thuộc:** p0-02, p0-03 (stats data), p0-04 (combo data), p0-05 (ngưỡng) · **Blocks:** p0-07 (badge/panel UI).

## Mục tiêu

Hạ tầng alert-driven để đạt "ít staff nhất": hệ thống chủ động phát hiện rủi ro thay vì người nhìn màn hình. Collection alert + evaluator chạy ngay trong stats worker (data đã in-memory, chi phí ≈ 0) + đường đọc/ack cho backoffice.

## Pattern tham chiếu

| Phần | File mẫu |
|---|---|
| Entity Doc | `packages/game-keno/src/entities/draw.ts`; base `OpsAlertBase`/`OpsAlertStatus`/`OpsAlertSeverity` từ game-core (p0-02) |
| Enum/Index | `KenoCollections`, `KENO_INDEXES` |
| Repo | `entry-repo.ts` (`bulkWrite` upsert dedupe, `count`, `updateOne` cho ack); `count` index-only |
| Evaluator trong worker | `SyncBettingStatsUseCase` (p0-03) — thêm bước evaluate sau khi update stats |
| API route | `summary/route.ts` (`withApi().auth().query/body().handler()`) |
| Business ngưỡng | `keno-game-rules.mdc` (maxSetsForFixed 50/12/5), ngưỡng động từ `GlobalConfig.ops.alerts` (p0-05) |

## Việc cần làm

### 1. Entity (`packages/game-keno/src/entities/ops-alert.ts`)

- **`KenoOpsAlertType` khai `const {...} as const` + type dẫn xuất** (rule `code-quality-standards.mdc` §5.3 — KHÔNG union string trần):
  ```ts
  export const KenoOpsAlertType = {
    LargeBet: "large_bet",
    ExposureThreshold: "exposure_threshold",
    SidebetSkew: "sidebet_skew",
    CapSetsNear: "cap_sets_near",
    ComboConcentration: "combo_concentration",
    RevenueAnomaly: "revenue_anomaly", // để dành — không bắn ở P0
    SettleStuck: "settle_stuck",       // để dành — không bắn ở P0
  } as const;
  export type KenoOpsAlertType = (typeof KenoOpsAlertType)[keyof typeof KenoOpsAlertType];
  ```
- `KenoOpsAlertDoc extends OpsAlertBase (game-core) { _id: unknown; type: KenoOpsAlertType }`. `OpsAlertStatus`/`OpsAlertSeverity` cũng là const-as-const (game-core p0-02) — so sánh/gán qua member (`OpsAlertStatus.New`), KHÔNG literal `"new"`.
- Entity + barrel. **Chốt: `KenoOpsAlertType` khai ở entity `ops-alert.ts` là source; p0-05 import từ đây** (thống nhất 1 nơi, tránh trùng).

### 2. Enum + Index

- `OpsAlerts = "keno_ops_alerts"` vào `KenoCollections`.
- `KENO_INDEXES`: `{ status: 1, createdAt: -1 }` (list/count theo status), `{ drawId: 1, dedupeKey: 1 } unique` (chống bắn trùng).

### 3. Repo (`ops-alert-repo.ts`)

- Methods: `bulkUpsertByDedupe(alerts)` (`updateOne` filter `{ drawId, dedupeKey }`, `$setOnInsert` full doc + `status:"new"`, upsert — không bắn lại alert đã tồn tại); `countByStatus(status)` (index-only, cho snapshot); `listByDrawAndStatus(drawId, status?)`; `ack(alertId, actor)` (`updateOne` `$set status:"ack", ackBy, ackAt`).

### 4. Evaluator (thêm vào `SyncBettingStatsUseCase`, module `use-cases/operations/evaluate-alerts.ts`)

- Hàm pure `evaluateAlerts(stats, comboStats, opsConfig): KenoOpsAlertDoc[]` — nhận data đã có in-memory, so ngưỡng `ops.alerts` (chỉ rule `enabled`):
  - `large_bet`: `totals.largeBetCount` > 0 → alert (hoặc per top potential entry vượt `largeBetAmount`). Dedupe theo entryId.
  - `exposure_threshold`: **áp `capExposureByPlayType(stats.exposure.worstCaseByPlayType, payoutCaps)` TRƯỚC (sửa Risk #4)** vì doc lưu RAW — rồi `capped.worstCaseTotal / capTotal >= exposureWarnPct`. Dedupe theo drawId+type.
  - `sidebet_skew`: lệch amount 1 hướng >= `sidebetSkewPct`. Dedupe drawId+type+cặp.
  - `cap_sets_near`: `capSets.pickN >= comboSetsWarn.pickN`. Dedupe drawId+pickN.
  - `combo_concentration`: combo có `sets`/`accounts` >= ngưỡng → dùng combo-stats (p0-04). Dedupe comboKey.
- Worker gọi `evaluateAlerts` sau update stats/combo → `bulkUpsertByDedupe`. Comment `//` giải thích từng rule (business reason).
- **Severity**: map theo mức vượt ngưỡng (warning/critical) — bảng nhỏ, ghi trong plan.

### 5. Đường đọc/ack (backoffice)

- Alert count → nhét vào **snapshot endpoint của p0-07** (`alertCounts: { new, critical }`) — KHÔNG tạo timer riêng (analysis §4.1). Plan này cung cấp `countByStatus`; p0-07 gọi.
- Route list + ack:
  - `GET /api/keno/operations/alerts?drawId=&status=&grouped=` → `listByDrawAndStatus` (on-demand, chỉ khi mở panel).
  - `POST /api/keno/operations/alerts/{id}/ack` → `ack(id, actor)`.
  - Cả 2 dùng `withApi().auth({roles:[CompanyRole.Staff]})`; use-case trong `use-cases/operations/`.
  - **Zod schema (sửa Risk #11):** query `status` dùng `z.enum(Object.values(OpsAlertStatus))` — derive từ const-as-const, KHÔNG string literal trần `z.enum(["new","ack","resolved"])` (vi phạm §5.3). Tạo tuple `OPS_ALERT_STATUS_VALUES = Object.values(OpsAlertStatus) as [OpsAlertStatus, ...OpsAlertStatus[]]`. Tương tự combo-lookup `playType` dùng `CAPPABLE_PLAY_TYPE_VALUES` derive từ `KenoPlayType`.
- **Gộp alert (chốt 28/07/2026):** dedupe theo `dedupeKey` đã đảm bảo KHÔNG có nhiều doc trùng loại/scope trong 1 draw (1 combo vượt ngưỡng = 1 alert doc, không phải mỗi tick 1 doc). Đường đọc mặc định trả **gộp theo `type`** cho gọn (badge panel hiển thị "N combo_concentration, M cap_sets_near"), có param `grouped=false` để xem raw từng alert khi cần điều tra. Việc gộp làm ở use-case (`Map<type, {count, items}>`), không đổi cách lưu. Đây là hệ quả tự nhiên của dedupe — không cần cơ chế gộp riêng phức tạp.

## Quyết định cần chốt

- **`large_bet` bắn per-entry hay đếm gộp?** Chốt: **gộp 1 alert/draw** kèm payload top N entry lớn (dedupeKey = `large_bet:{drawId}`, `$set` payload cập nhật danh sách mỗi tick, KHÔNG bắn doc mới mỗi entry) — tránh spam, khớp hướng "gộp gọn" ở mục 5.
- **Grouped response mặc định `true`**, `grouped=false` để drill-down raw.
- **Âm thanh critical**: UI thuộc p0-07; plan này chỉ đảm bảo severity đúng.

## Không làm

- KHÔNG bắn `revenue_anomaly`/`settle_stuck` ở P0 (để dành — analysis verdict #8, §6 giai đoạn A). KHÔNG toast tự bung (badge + panel — p0-07). KHÔNG để AI/tự động hoá quyết định.

## Verify

`check-types` game-keno + application + backoffice. Test: dựng stats vượt ngưỡng → evaluator sinh đúng alert, chạy lại worker KHÔNG bắn trùng (dedupe), ack đổi status.

## Định nghĩa Done

Worker sinh alert theo ngưỡng động (không trùng), backoffice list/ack được, count sẵn sàng cho snapshot. Cập nhật `00-overview.md`.
