# p0-03 — `GlobalConfigDoc.ops` + tab "Vận hành" trang Config (Max 3D Pro)

> **Nguồn:** analysis §3.6, §7 Q1/Q2/Q3 (đã chốt) · **Phase:** P0 · **Phụ thuộc:** Max 3D p0-03 done · **Blocks:** p0-04, p0-05.
> **Plan mẫu:** `../max3d-ops-risk-control/p0-03-ops-config.plan.md` — làm y hệt trên package Pro; CHỈ ghi delta.

## Delta so với Max 3D p0-03

1. **Alert type** (`packages/game-max3dpro/src/entities/ops-alert.ts`): `Max3dproOpsAlertType` — cùng 6 giá trị string với Max 3D (`large_bet`/`exposure_threshold`/`pair_liability`/`combo_concentration` + 2 để dành).
2. **Defaults khác** (`DEFAULT_MAX3DPRO_OPS_CONFIG` trong `rules/defaults.ts`):
   - `largeBetAmount: 10_000_000` (chốt Q1 — multiNumber 20 bộ = 3,8tr/kỳ với betCount 1, ngưỡng 5tr sẽ noise);
   - `pairLiabilityWarnAmount: 4_000_000_000` (chốt Q2 — ĐB Pro 2 tỷ/unit, 2 unit đúng chiều = 4 tỷ);
   - `exposureWarnAmount: 5_000_000_000`, `comboAccountsWarn: 5`, `stats: { tickSeconds: 30, topCombosK: 100, topPotentialK: 50, topAccountsK: 50 }` — như Max 3D.
3. **Tooltip `pairLiabilityWarnAmount`** giải thích theo Pro: "1 unit 10.000đ đúng thứ tự = liability 2 tỷ (×200.000); chiều ngược cộng thêm phụ ĐB 400tr; default 4 tỷ ≈ 2 unit".
4. Nhãn `MAX3DPRO_OPS_ALERT_TYPE_LABELS` — cùng nhãn tiếng Việt với Max 3D (2 trang cùng label — guideline ops-config §4).
5. UI/route/Zod/player-DTO-check: y hệt Max 3D p0-03 trên `apps/backoffice/.../max3dpro/` + `game-max3dpro-application`. Dùng `OpsStatsConfig` đầy đủ (topCombosK cho topPairs).

## Không làm / Verify / Review sau triển khai / Done

Y hệt Max 3D p0-03 (thay package/route Pro). Review thêm: defaults khớp chốt Q1/Q2 bảng delta overview Pro; cập nhật `00-overview.md`.
