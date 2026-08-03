# p0-03 — `GlobalConfigDoc.ops` + tab "Vận hành" trang Config (Max 3D)

> **Nguồn:** `.cursor/analysis/max3d-max3dpro-operations-risk-control.analysis.md` §3.6, §7 Q1/Q2/Q3 (đã chốt 30/07/2026), verdict #6.
> **Phase:** P0 · **Phụ thuộc:** — (song song p0-02) · **Blocks:** p0-04, p0-05.
> **Điều kiện:** Bingo18 p0-03 đã tách `OpsStatsConfigBase`/`OpsStatsConfig` ở game-core — Max 3D dùng **`OpsStatsConfig` ĐẦY ĐỦ** (có `topCombosK` cho `topPairs`), KHÔNG cần đổi game-core thêm.

## Mục tiêu

Section `ops: OpsConfig` vào `GlobalConfigDoc` Max 3D (ngưỡng đặc thù: `pairLiabilityWarnAmount` — không có ở game nào khác) + đường ghi merge/audit + Zod + tab "Vận hành" theo guideline.

## Pattern tham chiếu

Y hệt `../bingo18-ops-risk-control/p0-03-ops-config.plan.md` (bảng pattern Keno giữ nguyên: `game-keno/entities/types.ts` OpsConfig, `update-game-config.ts` + `UpdateOpsInput`, Zod `api/keno/config/_lib/schema.ts`, UI `keno/config/game/_lib/ops-section.tsx`, guideline `ops-config-page-layout.guideline.md`). Dưới đây CHỈ ghi khác biệt.

## Việc cần làm (khác biệt so với Bingo18 p0-03)

### 1. Alert type + OpsConfig entity (`packages/game-max3d/src/entities/`)

- `ops-alert.ts`: re-export base game-core ĐẦU file; `Max3dOpsAlertType` const-as-const:
  `LargeBet: "large_bet"` · `ExposureThreshold: "exposure_threshold"` · `PairLiability: "pair_liability"` · `ComboConcentration: "combo_concentration"` · `RevenueAnomaly` / `SettleStuck` (để dành).
- `types.ts` — `OpsAlertsConfig`:

```ts
export interface OpsAlertsConfig {
  /** Ngưỡng 1 entry cược lớn (VND). Default 5.000.000 (chốt §7 Q1). Zod: int dương. */
  largeBetAmount: number;
  /** Ngưỡng worst-case tổng (VND tuyệt đối — không có cap kỳ làm mẫu số). Default 5 tỷ. */
  exposureWarnAmount: number;
  /**
   * Ngưỡng liability ĐB của 1 cặp plus (VND) → pair_liability. Default 2 tỷ (chốt §7 Q2 —
   * theo LIABILITY, bắn sớm thiên an toàn: 20.000đ cược 1 cặp = liability 2 tỷ vì ×100.000).
   */
  pairLiabilityWarnAmount: number;
  /** Số account distinct cùng 1 cặp → combo_concentration. Default 5 (như Keno). */
  comboAccountsWarn: number;
  /** Bật/tắt từng loại alert — khoá theo Max3dOpsAlertType. */
  enabled: Record<Max3dOpsAlertType, boolean>;
}
export interface OpsConfig { alerts: OpsAlertsConfig; stats: OpsStatsConfig }  // ĐẦY ĐỦ — topCombosK dùng cho topPairs
```

- `global-config.ts`: thêm `ops` + JSDoc "KHÔNG expose player". Default `DEFAULT_MAX3D_OPS_CONFIG` cạnh `DEFAULT_MAX3D_CONFIG` (`rules/defaults.ts`): defaults trên + `stats: { tickSeconds: 30, topCombosK: 100, topPotentialK: 50, topAccountsK: 50 }` (tick 30s — chốt Q3); `enabled`: 4 type P0 true.

### 2. Đường ghi + Zod + player DTO

Y hệt Bingo18 p0-03 §3 (đổi package/route max3d): `UpdateOpsInput` tường minh, KHÔNG `validateInput`, Zod range khớp tooltip (`tickSeconds` 5–60, `topCombosK` 20–200, top-K 20–100, ngưỡng VND int dương), fallback `?? DEFAULT_MAX3D_OPS_CONFIG`. **Kiểm tra player DTO allowlist trước khi merge** (`game-max3d-application/use-cases/player/` — xác nhận build tường minh như Keno/Bingo18; nếu spread entity → dừng, hỏi user).

### 3. UI tab "Vận hành" (`apps/backoffice/src/app/(main)/games/max3d/config/game/`)

- Cột trái: 4 field ngưỡng (`largeBetAmount` · `exposureWarnAmount` · `pairLiabilityWarnAmount` · `comboAccountsWarn` "người") + toggle alert. Cột phải: `tickSeconds` + `topCombosK`/`topPotentialK`/`topAccountsK`.
- Tooltip 4 phần MỌI field; riêng `pairLiabilityWarnAmount` PHẢI giải thích độ nhạy: "1 unit 10.000đ vào 1 cặp plus = liability 1 tỷ (×100.000); default 2 tỷ ≈ 2 unit — cảnh báo rất sớm có chủ đích vì KHÔNG có cap kỳ".
- `ALERT_META` (sort severity): `pair_liability` (Critical) · `exposure_threshold` (Critical) · `combo_concentration` (Warning) · `large_bet` (Warning). Nhãn khai `MAX3D_OPS_ALERT_TYPE_LABELS` dùng chung trang Vận hành: "Cặp dồn rủi ro ĐB" · "Rủi ro chi trả" · "Dồn bộ số" · "Cược lớn".
- AlertToggleRow + banner tắt-hết + nuqs `?tab=ops` — theo guideline checklist §5.

## Không làm

KHÔNG đổi shape `OpsStatsConfigBase`/`OpsStatsConfig` game-core (đã chốt ở Bingo18 p0-03); KHÔNG expose `ops` player; KHÔNG list phẳng toggle.

## Verify

`check-types` game-core/max3d/max3d-application + backoffice, lint. Tab sửa → save → version + audit; Keno/Bingo18 tab không regression.

## Review sau triển khai (BẮT BUỘC — khung 00-overview)

- [ ] Default khớp chốt §7 (5tr / 5 tỷ / 2 tỷ / 5 người / tick 30s / topCombosK 100); Zod = tooltip = client form.
- [ ] Không indexed-access DTO (Risk #8); Zod enum derive (Risk #11); import đầu file; player DTO không lộ `ops`.
- [ ] Checklist guideline ops-config §5.
- [ ] Ghi kết quả review + cập nhật `00-overview.md`.

## Định nghĩa Done

Config `ops` ghi/đọc qua tab (tooltip đủ), worker p0-02 đọc tick/top-K từ config, review xong, overview cập nhật.
