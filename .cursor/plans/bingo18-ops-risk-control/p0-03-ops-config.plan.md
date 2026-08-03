# p0-03 — `OpsStatsConfigBase` (game-core) + `GlobalConfigDoc.ops` + tab "Vận hành" trang Config

> **Nguồn:** `.cursor/analysis/bingo18-operations-risk-control.analysis.md` §3.6, §7 Q1/Q2/Q3/Q5 (đã chốt 30/07/2026), verdict #7.
> **Phase:** P0 · **Phụ thuộc:** — (song song p0-02 được) · **Blocks:** p0-04 (evaluator đọc ngưỡng), p0-05 (thresholds trong snapshot).

## Mục tiêu

1. **Refactor nhỏ game-core:** tách `OpsStatsConfigBase { tickSeconds; topPotentialK; topAccountsK }`; `OpsStatsConfig extends OpsStatsConfigBase { topCombosK }` (Keno giữ nguyên import, KHÔNG đổi hành vi) — quyết định "không cấu hình thừa default" (user chốt 30/07).
2. Thêm section `ops: OpsConfig` vào `GlobalConfigDoc` Bingo 18 + đường ghi merge/audit + Zod.
3. Tab "Vận hành" (`?tab=ops`) trên trang config Bingo 18 theo guideline `ops-config-page-layout.guideline.md`.

## Pattern tham chiếu

| Phần | File mẫu |
|---|---|
| OpsConfig entity | `packages/game-keno/src/entities/types.ts` (`OpsAlertsConfig`/`OpsConfig`) + `global-config.ts` (field `ops` + JSDoc "KHÔNG expose player") |
| Alert type const | `packages/game-keno/src/entities/ops-alert.ts` (const-as-const + re-export base game-core ĐẦU file) — p0-04 dùng chung, khai TYPE ở plan này vì `enabled: Record<Bingo18OpsAlertType, boolean>` cần nó |
| Base types game-core | `packages/game-core/src/types/betting-stats.ts` (`OpsStatsConfig` hiện tại) |
| Default config | `packages/game-bingo18/src/rules/financials.ts` (`DEFAULT_BINGO18_CONFIG`) — thêm `DEFAULT_BINGO18_OPS_CONFIG` cạnh đó (theo cách Keno đặt default ops) |
| Update use-case + DTO | `packages/game-keno-application/src/use-cases/game-config/update-game-config.ts` + `dto/game-config.dto.ts` (`UpdateOpsInput` interface tường minh — Risk #8, KHÔNG indexed-access) |
| Zod route | `apps/backoffice/src/app/api/keno/config/_lib/schema.ts` (section ops — `z.enum(Object.values(...))`, range khớp tooltip) |
| UI tab | `apps/backoffice/src/app/(main)/games/keno/config/game/_lib/ops-section.tsx` (`AlertToggleRow`, `ALERT_META`, `SEVERITY_STYLES`, `IntField`, `LabelWithTooltip`) + `page.tsx` (nuqs `?tab=`) |
| Guideline | `../keno-ops-risk-control/ops-config-page-layout.guideline.md` — checklist §5 |

## Việc cần làm

### 1. game-core: tách `OpsStatsConfigBase`

`packages/game-core/src/types/betting-stats.ts`:

```ts
export interface OpsStatsConfigBase {
  /** Nhịp cập nhật stats doc trong worker (giây) — cũng là nhịp FE poll. Zod: int 5–60. */
  tickSeconds: number;
  /** Số entry giữ trong topPotential. Zod: int 20–100. */
  topPotentialK: number;
  /** Số account giữ trong topAccounts. Zod: int 20–100. */
  topAccountsK: number;
}
/** Bản đầy đủ cho game có combo space lớn (Keno, Max3D…). */
export interface OpsStatsConfig extends OpsStatsConfigBase {
  /** Số combo giữ trong topCombos. Zod: int 20–200. */
  topCombosK: number;
}
```

- Keno: KHÔNG đổi call site (`OpsStatsConfig` giữ nguyên shape sau extends). Verify `check-types` cả `game-keno` + `game-keno-application` + `apps/backoffice`.

### 2. Alert type + OpsConfig entity (`packages/game-bingo18/src/entities/`)

- `ops-alert.ts` (file mới — copy khung keno `ops-alert.ts`): re-export `OpsAlertStatus`/`OpsAlertSeverity`/`OpsAlertBase` từ game-core ĐẦU file; `Bingo18OpsAlertType` const-as-const:
  `LargeBet: "large_bet"` · `ExposureThreshold: "exposure_threshold"` · `SidebetSkew: "sidebet_skew"` · `BucketConcentration: "bucket_concentration"` · `RevenueAnomaly: "revenue_anomaly"` (để dành) · `SettleStuck: "settle_stuck"` (để dành). (Doc `Bingo18OpsAlertDoc` khai ở p0-04.)
- `types.ts`: thêm `OpsAlertsConfig` + `OpsConfig` (import `OpsStatsConfigBase` ĐẦU file):

```ts
export interface OpsAlertsConfig {
  /** Ngưỡng 1 entry cược lớn (VND). Default 1.000.000. Zod: int dương. */
  largeBetAmount: number;
  /** Cảnh báo exposure khi worstCase ≥ pct% doanh thu kỳ. Default 300. Zod: int 100–1000. */
  exposureWarnRevenuePct: number;
  /** Sàn tuyệt đối (VND): worstCase dưới mức này KHÔNG cảnh báo dù vượt %. Default 50.000.000. */
  exposureWarnMinAmount: number;
  /** % lệch 1 hướng bigSmallDraw kích hoạt sidebet_skew. Default 70. Zod: int 50–95. */
  sidebetSkewPct: number;
  /** Tiền (VND) dồn 1 bucket nhân cao (sumTotal 3/18, tripleMatch specific) → bucket_concentration. Default 5.000.000. */
  bucketConcentrationAmount: number;
  /** Bật/tắt từng loại alert — khoá tự đúng theo Bingo18OpsAlertType. */
  enabled: Record<Bingo18OpsAlertType, boolean>;
}
export interface OpsConfig { alerts: OpsAlertsConfig; stats: OpsStatsConfigBase }
```

- `global-config.ts`: thêm `ops: OpsConfig` + JSDoc "KHÔNG expose cho player".
- `rules/financials.ts`: `DEFAULT_BINGO18_OPS_CONFIG` (defaults trên; `stats: { tickSeconds: 10, topPotentialK: 50, topAccountsK: 50 }`; `enabled`: 4 type P0 true, 2 type để dành false).

### 3. Đường ghi (application + route)

- `dto/game-config.dto.ts`: `UpdateOpsInput` interface tường minh (KHÔNG `OpsConfig["alerts"]` — Risk #8); `UpdateGameConfigInput` thêm `ops?: UpdateOpsInput`.
- `update-game-config.ts`: merge section `ops` theo đúng cách Keno (deep-merge từng nhánh alerts/stats, giữ audit + `version++`). **KHÔNG viết `validateInput`** (rule §7 — Zod route đã cover).
- `apps/backoffice/src/app/api/bingo18/config/_lib/schema.ts`: `opsSchema` — range khớp JSDoc/tooltip; `enabled` = `z.record(z.enum(Object.values(Bingo18OpsAlertType)), z.boolean())` hoặc object tường minh theo cách Keno đã làm (soi file keno, copy đúng).
- **Fallback đọc:** `GetGlobalConfigUseCase`/worker đọc `config.ops ?? DEFAULT_BINGO18_OPS_CONFIG` (doc cũ chưa có section) — theo đúng cách Keno xử lý.
- **Player DTO:** xác nhận `get-game-config-player.ts` allowlist (đã kiểm tra 30/07 — dòng 31–56 build tường minh) — KHÔNG thêm `ops` vào player DTO. Ghi rõ trong PR.

### 4. UI tab "Vận hành" (`apps/backoffice/src/app/(main)/games/bingo18/config/game/`)

Copy `ops-section.tsx` Keno, đổi nội dung — follow guideline checklist §5:

- Headless card 2 cột: **trái** = 5 field ngưỡng (`largeBetAmount` VND · `exposureWarnRevenuePct` % · `exposureWarnMinAmount` VND · `sidebetSkewPct` % · `bucketConcentrationAmount` VND) + khu "Bật / tắt loại alert"; **phải** = `tickSeconds` giây + `topPotentialK`/`topAccountsK` (**KHÔNG có `topCombosK`** — Bingo 18 không dùng).
- Tooltip 4 phần MỌI field (Ý nghĩa · Hợp lệ khớp Zod · Mặc định · Tác động). Riêng `exposureWarnRevenuePct` tooltip giải thích cặp với `exposureWarnMinAmount` (sàn chống noise kỳ vắng); `bucketConcentrationAmount` nêu ví dụ "5tr vào tổng 3/18 = liability 600tr (×120)".
- `ALERT_META` 4 hàng (sort severity giảm dần): `exposure_threshold` (Critical) · `bucket_concentration` (Warning) · `large_bet` (Warning) · `sidebet_skew` (Warning) — severity dùng `OpsAlertSeverity` member; KHÔNG list 2 type để dành. `AlertToggleRow` đủ: icon+badge severity, tooltip (Ý nghĩa · Ngưỡng liên quan trỏ tên field cột trái · Tác động khi TẮT), summary inline, cả hàng click, hàng tắt border-dashed, header badge `N/M đang bật` + banner tắt-hết.
- Nhãn alert type khai 1 chỗ `BINGO18_OPS_ALERT_TYPE_LABELS` (dùng chung với trang Vận hành p0-05 — guideline §4): `large_bet` "Cược lớn" · `exposure_threshold` "Rủi ro chi trả" · `sidebet_skew` "Lệch Lớn/Hòa/Nhỏ" · `bucket_concentration` "Dồn cửa nhân cao".
- Zod client form range PHẢI khớp Zod server. Form `disabled={isPending || !isDirty}`.
- Gắn tab vào `page.tsx` (`?tab=ops` — nuqs, `game-config-ui` §14).

## Không làm

- KHÔNG giữ field `topCombosK` trong config Bingo 18 (đã chốt); KHÔNG đổi shape `OpsStatsConfig` Keno; KHÔNG expose `ops` cho player; KHÔNG list phẳng label+switch.

## Verify

`pnpm --filter @megawin/game-core check-types && --filter @megawin/game-keno check-types && --filter @megawin/game-keno-application check-types && --filter @megawin/game-bingo18 check-types && --filter @megawin/game-bingo18-application check-types` + backoffice check-types/lint. Mở tab Vận hành: sửa ngưỡng → save → version tăng + audit log; reload giữ giá trị.

## Review sau triển khai (BẮT BUỘC — khung 00-overview)

- [ ] **Logic:** default khớp quyết định §7 analysis (1tr / 300% / 50tr / 70% / 5tr / tick 10s); Zod range = tooltip = client form.
- [ ] **Regression Keno:** `OpsStatsConfig` extends Base không phá call site nào (check-types + mở tab Vận hành Keno).
- [ ] **Code:** không indexed-access trong DTO (Risk #8); Zod enum derive từ const (Risk #11); import đầu file; player DTO không lộ `ops`.
- [ ] **UI:** checklist guideline ops-config §5 tick đủ.
- [ ] Ghi kết quả review + cập nhật `00-overview.md`.

## Định nghĩa Done

Config `ops` ghi/đọc được qua tab Vận hành (tooltip đủ), worker p0-02 đọc `tickSeconds`/top-K từ config, Keno không regression, review xong, overview cập nhật.
