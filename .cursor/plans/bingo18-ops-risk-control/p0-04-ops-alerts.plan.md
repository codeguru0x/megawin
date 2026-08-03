# p0-04 — Alert framework: `bingo18_ops_alerts` + evaluator + list/ack API

> **Nguồn:** `.cursor/analysis/bingo18-operations-risk-control.analysis.md` §3.5, §7 (ngưỡng đã chốt), verdict #4/#5/#6.
> **Phase:** P0 · **Phụ thuộc:** p0-02 (stats data), p0-03 (ngưỡng + `Bingo18OpsAlertType`) · **Blocks:** p0-05 (badge/panel).

## Mục tiêu

Collection alert + evaluator pure chạy TRONG worker stats (data sẵn trong memory, chi phí ≈ 0) + API list/ack cho backoffice. 4 rule P0: `large_bet` / `exposure_threshold` / `sidebet_skew` / `bucket_concentration`.

## Pattern tham chiếu

| Phần | File mẫu |
|---|---|
| Entity + Doc | `packages/game-keno/src/entities/ops-alert.ts` (`KenoOpsAlertDoc extends OpsAlertBase`, Entity, re-export base ĐẦU file) — type đã khai ở p0-03, plan này thêm Doc/Entity |
| Index | `KENO_INDEXES` mục ops_alerts: `{status:1, createdAt:-1}` + `{drawId:1, dedupeKey:1} unique` |
| Repo | `packages/game-keno-application/src/infras/repos/ops-alert-repo.ts` (`bulkUpsertByDedupe` idempotent, `listGrouped`, `ackById`, `countByStatus`) + mapper `ops-alert-mapper.ts` |
| Evaluator | `packages/game-keno-application/src/use-cases/operations/evaluate-alerts.ts` (pure function nhận snapshot + config → alert specs; worker gọi sau update stats) |
| Use-case list/ack | `use-cases/operations/list-alerts.ts` + `ack-alert.ts` + `dto/alerts.dto.ts` (Zod `z.enum(Object.values(OpsAlertStatus))` — Risk #11) |
| Route | `apps/backoffice/src/app/api/keno/operations/alerts/route.ts` + `alerts/[id]/ack/route.ts` (`withApi().auth({roles:[CompanyRole.Staff]})`) |

## Việc cần làm

### 1. Entity + index (`packages/game-bingo18`)

- `entities/ops-alert.ts` (đã tạo type ở p0-03): thêm `Bingo18OpsAlertDoc extends OpsAlertBase { _id: unknown; type: Bingo18OpsAlertType }` + `Bingo18OpsAlertEntity`. JSDoc dedupeKey ví dụ theo game (`"bucket_concentration:sumTotal:3"`).
- `Bingo18Collections.OpsAlerts: "bingo18_ops_alerts"`; 2 index vào `BINGO18_INDEXES` (copy keno, đổi collection).

### 2. Repo + mapper (`game-bingo18-application`)

Copy keno: `infras/repos/ops-alert-repo.ts` (`bulkUpsertByDedupe` — upsert theo `{drawId, dedupeKey}`, KHÔNG bắn trùng mỗi tick; giữ `status` hiện có khi đã ack), `infras/mappers/ops-alert-mapper.ts`, types → `repos/types/`, barrel.

### 3. Evaluator (`use-cases/operations/evaluate-alerts.ts`)

Pure function `evaluateBingo18Alerts({ snapshot, exposure, config, drawId })` → `AlertSpec[]` (chỉ type có `enabled[type] === true`):

| Rule | Điều kiện (đọc từ snapshot/exposure — KHÔNG query thêm) | Severity | Payload chính |
|---|---|---|---|
| `large_bet` | Trong batch tick có entry `amount ≥ largeBetAmount`; gom top entries vào `payload.top` (accountId + `username` + amount + potentialWin) | Warning | count, threshold, top[] |
| `exposure_threshold` | `exposure.worstCase.amount ≥ max(exposureWarnMinAmount, revenue × exposureWarnRevenuePct/100)` — sàn tuyệt đối chống noise kỳ vắng (chốt §7 Q2) | Critical | worstCase, outcome numbers/sum, revenue, pct |
| `sidebet_skew` | 1 hướng `bigSmallDraw` chiếm `≥ sidebetSkewPct%` tổng amount 3 hướng (tổng > 0) — LƯU Ý xác suất nền không đối xứng (small 49/draw 25/big 26%) ghi vào payload để formatter hiển thị | Warning | direction, pct, totals |
| `bucket_concentration` | `amount` của 1 bucket NHÂN CAO ≥ `bucketConcentrationAmount`. Bucket nhân cao = tập cố định khai const: `sumTotal["3"]`, `sumTotal["18"]`, `tripleMatch.specific["1".."6"]` (nhân ×120) — khai `BINGO18_HIGH_MULTIPLIER_BUCKETS` trong `game-bingo18/rules` kèm JSDoc lý do | Warning | bucket label, amount, liability (= sets × prize), threshold |

- dedupeKey: `"{type}"` cho exposure/skew (1 alert/kỳ/loại), `"{type}:{bucketKey}"` cho bucket_concentration, `"{type}"` + merge top cho large_bet — theo đúng cách Keno.
- Severity/status qua member (`OpsAlertSeverity.Critical`), KHÔNG string trần.
- Gắn vào `SyncBettingStatsUseCase` (p0-02 đã chừa hook): sau conditional write → `evaluate` → `bulkUpsertByDedupe`.

### 4. API list/ack + backoffice hooks

- Use-cases `list-alerts.ts` (grouped theo type, filter status, default `new`+`ack` — **PHẢI trả cả `ack`**: UI v6 Keno 30/07 hiển thị item ack dưới disclosure per-group thay vì ẩn, xem guideline §4 + p0-05), `ack-alert.ts` (set `ack` + `ackBy`/`ackAt` — lấy staff id từ session theo cách Keno; ack KHÔNG xoá doc, KHÔNG chặn worker cập nhật payload — giữ audit trail). DTO + Zod (`z.enum(Object.values(OpsAlertStatus))`).
- Routes `apps/backoffice/src/app/api/bingo18/operations/alerts/route.ts` + `alerts/[id]/ack/route.ts` — copy keno (`withApi()`, use-case singleton module scope).
- Query keys `bingo18Keys` mở rộng (alerts list) — hook fetch on-demand khi panel mở (KHÔNG timer riêng — `alertCounts` đi trong snapshot p0-05).

## Không làm

- KHÔNG bắn `revenue_anomaly`/`settle_stuck` (để dành — enabled default false, không có evaluator); KHÔNG toast tự bung (badge + panel — analysis Keno §4.2); KHÔNG query DB trong evaluator (pure, nhận data từ worker memory).

## Verify

`check-types` + lint 2 package + backoffice. Test local: seed entries vượt ngưỡng → tick worker → alert xuất hiện đúng type/severity/dedupe (chạy 2 tick không nhân đôi); ack → status đổi, không bị evaluator ghi đè.

## Review sau triển khai (BẮT BUỘC — khung 00-overview)

- [ ] **Logic:** từng rule đối chiếu ngưỡng p0-03 (đúng nguồn field config); `exposure_threshold` dùng `max(sàn, %revenue)` đúng chốt Q2; bucket nhân cao khớp bảng giải (chỉ các bucket ×120).
- [ ] **Idempotency:** dedupeKey chạy lại nhiều tick không trùng; ack không bị revert.
- [ ] **Code:** const-as-const, Zod derive, mapper đúng chỗ, import đầu file.
- [ ] Ghi kết quả review + cập nhật `00-overview.md`.

## Định nghĩa Done

Worker sinh alert đúng 4 rule theo config, list/ack API hoạt động, review xong, overview cập nhật.
