# p0-02 — Base ops types vào `@megawin/game-core/types`

> **Nguồn:** `.cursor/analysis/keno-operations-risk-control.analysis.md` §8, §9.
> **Phase:** P0 · **Phụ thuộc:** không · **Blocks:** p0-03, p0-04, p0-05, p0-06.

## Mục tiêu

Đặt các type/interface dùng chung cho ops (stats, alert, config) vào `game-core` NGAY TỪ P0 để game thứ 2 trở đi tái sử dụng (DRY, analysis §8). Chỉ tách **types**; code thực thi vẫn ở `game-keno-application` (KISS). Đây là tiền lệ y hệt `DrawSales`/`DrawVietlottRef`/`DrawTenantFinancial`.

## Pattern tham chiếu

- Khai báo type shared: `packages/game-core/src/types/index.ts` (mẫu `DrawSales`, `DrawTenantFinancial` — named interface + JSDoc từng field, `ISODateString`).
- Subpath export: `packages/game-core/package.json` block `"./types"` (`types`/`import`→src, `default`→dist).
- Re-export qua game barrel: `packages/game-keno/src/entities/draw.ts` dòng `import type {...} from "@megawin/game-core/types"` + `export type {...}`; propagate qua `entities/index.ts`.
- Rule: `entity-typesafe-mongodb.mdc` §4 (shared embedded docs định nghĩa 1 lần ở game-core), `code-quality-standards.mdc` §5.1 (import named type, cấm indexed-access).

## Việc cần làm

### 1. Thêm types vào `packages/game-core/src/types/index.ts`

Khai báo generic base — phần khác nhau giữa game để lại generic param / để game extend:

```ts
/** Thống kê realtime 1 kỳ quay — khung chung mọi game. Field riêng game (byPlayType, numberFreq, exposure) do game extend. */
export interface DrawBettingStatsBase {
  /** drawId dạng `YYYY-MM-DD.NNN`. Unique key của doc. */
  drawId: string;
  /** Thời điểm worker cập nhật gần nhất — dùng làm ETag. */
  updatedAt: Date;
  /** ObjectId entry lớn nhất đã cộng (watermark insert stream, đã loại status:void). */
  lastEntryId: unknown;
  /** true khi đã recompute chính xác lúc salesClosed (xem analysis §3.3). */
  final: boolean;
  totals: DrawBettingTotals;
  /** Phân bố theo đại lý — số tenant nhỏ nên Record không phình. */
  byTenant: Record<string, TenantBettingStat>;
  topAccounts: Array<TopAccountStat>;
}

export interface DrawBettingTotals {
  revenue: number; entries: number; boards: number; commission: number;
  /** Số entry vượt ngưỡng cược lớn cấu hình. */
  largeBetCount: number;
}
export interface TenantBettingStat { amount: number; entries: number; commission: number }
export interface TopAccountStat { accountId: string; amount: number; entries: number }

/** Lifecycle 1 alert vận hành — const object as const (code-quality §5.3, KHÔNG union string trần). */
export const OpsAlertStatus = {
  New: "new", Ack: "ack", Resolved: "resolved",
} as const;
export type OpsAlertStatus = (typeof OpsAlertStatus)[keyof typeof OpsAlertStatus];

export const OpsAlertSeverity = {
  Info: "info", Warning: "warning", Critical: "critical",
} as const;
export type OpsAlertSeverity = (typeof OpsAlertSeverity)[keyof typeof OpsAlertSeverity];

/** Khung alert doc — type cụ thể (union alert type) do game khai (cũng theo §5.3). */
export interface OpsAlertBase {
  drawId: string;
  severity: OpsAlertSeverity;
  /** Context tuỳ loại alert: entryId, giá trị, ngưỡng… */
  payload: Record<string, unknown>;
  /** Chống bắn trùng: unique cùng drawId. */
  dedupeKey: string;
  status: OpsAlertStatus;
  createdAt: Date;
  ackBy?: string;
  ackAt?: Date;
}

/** Cấu hình số phần tử giữ trong các danh sách top + nhịp worker (analysis §3.9). */
export interface OpsStatsConfig {
  /** Nhịp cập nhật stats doc trong worker (giây) — cũng là nhịp FE poll. Zod: int 5–60. */
  tickSeconds: number;
  /** Số combo giữ trong topCombos. Điều tra syndicate chính. */
  topCombosK: number;
  /** Số entry giữ trong topPotential. */
  topPotentialK: number;
  /** Số account giữ trong topAccounts. */
  topAccountsK: number;
}
```

> **§5.3 BẮT BUỘC:** `OpsAlertStatus`/`OpsAlertSeverity` khai `const … as const` + type dẫn xuất (KHÔNG union string trần). Rule `code-quality-standards.mdc` §5.3 đã ghi pattern này — mọi tập giá trị đóng tuân theo, dùng qua member (`OpsAlertStatus.Ack`).

- Cân nhắc `DrawBettingStatsBase` để **không** generic (giữ phẳng) — game extend bằng `interface KenoDrawBettingStatsDoc extends DrawBettingStatsBase { _id: unknown; byPlayType: ...; numberFreq: ...; exposure: ... }`. Generic param chỉ thêm khi thật sự cần type-check chéo; mặc định giữ KISS: extend + thêm field. **Chốt trong plan này: dùng `extends`, không generic** (đơn giản hơn, đủ DRY).
- JSDoc đầy đủ từng field (đơn vị VND, format) theo `code-quality-standards` §1.
- `OpsAlertsConfigBase` (ngưỡng alert) — cân nhắc: ngưỡng gần như đặc thù game (Keno có `comboSetsWarn` theo pick8/9/10). **Chốt: KHÔNG tạo base cho alerts config** — chỉ `OpsStatsConfig` là thật sự chung; `alerts` để game tự khai trong `OpsConfig` của mình (tránh base rỗng nghĩa). Ghi rõ lý do này trong plan để game sau không hiểu nhầm.

### 2. Không đổi package.json

Subpath `./types` đã tồn tại — chỉ thêm export trong file `types/index.ts`, không đụng `package.json`/`tsup`/workspace.

### 3. Re-export ở keno (chuẩn bị cho p0-03/05)

Việc re-export cụ thể nằm trong p0-03 (entity betting-stats) và p0-05 (OpsConfig) — plan này chỉ tạo nguồn ở game-core. Ghi chú forward để 2 plan kia biết import từ đâu.

## Không làm

- KHÔNG đưa logic (worker/use-case/aggregation) vào game-core — chỉ type.
- KHÔNG tạo `OpsAlertsConfigBase` rỗng nghĩa (xem quyết định trên).
- KHÔNG generic hoá sớm khi `extends` đủ dùng.

## Verify

- `pnpm --filter @megawin/game-core check-types`.
- Import thử từ `game-keno` (1 file tạm hoặc trong p0-03) để xác nhận subpath resolve.

## Định nghĩa Done

Base types export từ `@megawin/game-core/types`, có JSDoc, build pass. Cập nhật `00-overview.md`.

## Cập nhật sau review (28/07/2026)

`types/index.ts` ban đầu chứa TẤT CẢ type trong 1 file (~220 dòng, 4 domain khác nhau).
Review phát hiện nguy cơ phình khi thêm game/domain mới → đã tách theo tiền lệ
`entities/index.ts` (nhiều file nhỏ + barrel `export *`):

```
types/
├── common.ts         # ISODateString, Long (không domain cụ thể)
├── draw.ts            # DrawSales, DrawVietlottRef, DrawTenantFinancial
├── betting-stats.ts   # DrawBettingTotals, TenantBettingStat, TopAccountStat,
│                      # DrawBettingStatsBase, OpsStatsConfig
├── ops-alert.ts       # OpsAlertStatus, OpsAlertSeverity, OpsAlertBase
└── index.ts           # export * from "./common" | "./draw" | "./betting-stats" | "./ops-alert"
```

Import path KHÔNG đổi (`@megawin/game-core/types` vẫn resolve mọi type) — chỉ tách file vật
lý, barrel giữ nguyên public API. Khi thêm domain mới (vd `system-financial.ts`) → tạo file
riêng + thêm 1 dòng `export *` vào `index.ts`, KHÔNG nhồi vào file domain khác.
