# p0-04 — Alert framework: `max3d_ops_alerts` + evaluator (`pair_liability`) + list/ack API

> **Nguồn:** `.cursor/analysis/max3d-max3dpro-operations-risk-control.analysis.md` §3.5, §7 Q2 (đã chốt), verdict #4/#5.
> **Phase:** P0 · **Phụ thuộc:** p0-02, p0-03 · **Blocks:** p0-05.

## Mục tiêu

Collection alert + evaluator pure trong worker + list/ack API. 4 rule P0 — trong đó **`pair_liability`** là alert đặc thù quan trọng nhất hệ thống (liability ĐB không cap, staff biết trước ngày quay nhiều ngày).

## Pattern tham chiếu

Y hệt `../bingo18-ops-risk-control/p0-04-ops-alerts.plan.md` (khung Keno: `ops-alert.ts` entity, `ops-alert-repo.ts` `bulkUpsertByDedupe`, `evaluate-alerts.ts` pure, `list-alerts.ts`/`ack-alert.ts`, routes `alerts/` + `alerts/[id]/ack/`). Dưới đây CHỈ ghi khác biệt.

## Việc cần làm (khác biệt so với Bingo18 p0-04)

### 1. Entity + index

`Max3dOpsAlertDoc extends OpsAlertBase { _id; type: Max3dOpsAlertType }` + Entity (type đã khai p0-03). `Max3dCollections.OpsAlerts: "max3d_ops_alerts"` + 2 index (`{status,createdAt}`, `{drawId,dedupeKey} unique`) vào `MAX3D_INDEXES`.

### 2. Evaluator (`evaluateMax3dAlerts({ snapshot, exposure, config, drawId })`)

| Rule | Điều kiện (từ snapshot/exposure — KHÔNG query thêm) | Severity | dedupeKey | Payload chính |
|---|---|---|---|---|
| `large_bet` | Entry trong batch `amount ≥ largeBetAmount`; gom `payload.top` (accountId + `username` + amount + potentialWin) | Warning | `"large_bet"` (merge top) | count, threshold, top[] |
| `exposure_threshold` | `exposure.worstCaseTotal ≥ exposureWarnAmount` (tuyệt đối VND — không có cap/revenue ổn định làm mẫu số) | Critical | `"exposure_threshold"` | worstCaseTotal, breakdown basic/pair, threshold |
| `pair_liability` | Tồn tại pair có `liabilityĐB ≥ pairLiabilityWarnAmount` (từ `computePairLiabilities`) — **1 alert / pair** để staff track từng cặp | Critical | `"pair_liability:{pairKey}"` | pairKey, triplet1/2, units, accounts (số + danh sách từ topPairs), liability, threshold |
| `combo_concentration` | 1 pair trong `topPairs` có `accounts ≥ comboAccountsWarn` (distinct — baseline max, Risk #5) | Warning | `"combo_concentration:{pairKey}"` | pairKey, accounts, units, amount |

- LƯU Ý `pair_liability` vs `combo_concentration` KHÁC bản chất (tiền tích luỹ vs số người) — 1 cặp có thể bắn CẢ 2 (đúng chủ đích, dedupeKey khác nhau).
- Severity/status qua member const; gắn vào `SyncBettingStatsUseCase` sau conditional write.

### 3. API list/ack + hooks

Copy Bingo18 p0-04 §4 (đổi route `api/max3d/operations/alerts/`, keys `max3dKeys`) — bao gồm cả yêu cầu UI v6: `list-alerts` PHẢI trả cả `ack` (disclosure per-group), `ack-alert` KHÔNG xoá doc/KHÔNG chặn worker cập nhật payload. `alertCounts` đi trong snapshot (p0-05), panel fetch on-demand. LƯU Ý Max 3D: `pair_liability` per-pair → nhóm có thể nhiều item, `list-alerts` grouped giữ sort `createdAt desc` trong nhóm để item mới nhất lên đầu.

## Không làm

KHÔNG bắn `revenue_anomaly`/`settle_stuck`; KHÔNG toast; KHÔNG query DB trong evaluator; KHÔNG gộp `pair_liability` vào `combo_concentration`.

## Verify

`check-types` + lint. Test local: seed 1 board plus 30.000đ (3 unit) vào 1 cặp → tick → `pair_liability` Critical (liability 3 tỷ ≥ 2 tỷ); 2 tick không nhân đôi; ack giữ nguyên qua tick sau; 5 account cùng cặp → thêm `combo_concentration`.

## Review sau triển khai (BẮT BUỘC — khung 00-overview)

- [ ] **Logic:** từng rule đúng nguồn field config p0-03; liability tính từ `computePairLiabilities` (KHÔNG tự nhân lại trong evaluator); duplicate pair không ×2 ĐB.
- [ ] **Idempotency:** dedupeKey per-pair chạy nhiều tick không trùng; ack không revert.
- [ ] **Code:** const-as-const, Zod derive, mapper đúng chỗ, import đầu file.
- [ ] Ghi kết quả review + cập nhật `00-overview.md`.

## Định nghĩa Done

Worker sinh alert đúng 4 rule, `pair_liability` per-pair hoạt động, list/ack OK, review xong, overview cập nhật.
