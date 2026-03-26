# Power 6/55 Outstanding Drill-Down — Implementation Plan
# Template cho 7 games
# Cập nhật: 2026-03-26

## 0. Tổng quan scope

Thêm 4-level drill-down vào outstanding page, cùng pattern với financial reports.
Power 6/55 làm trước, các game khác copy structure này.

```
Level 1: Draw List        → /games/power655/outstanding               (refactor page hiện tại)
Level 2: Tenant Breakdown → /games/power655/outstanding?draw=xxx
Level 3: Player Breakdown → /games/power655/outstanding?draw=xxx&tenant=T001
Level 4: Entry List       → /games/power655/outstanding?draw=xxx&tenant=T001&player=ACC123
         + Entry Detail   → Dialog (reuse Power655EntryDetailDialog outstanding mode)
```

---

## 1. BACKEND — Layers & Files

### 1A. Types mới — `repos/types/entry-outstanding.types.ts`

**File:** `packages/game-power655-application/src/infras/repos/types/entry-outstanding.types.ts`

```typescript
/** Aggregate tenant cho 1 draw outstanding. Drill cấp 2. */
export interface OutstandingTenantBreakdownRow {
  tenantId: string;
  entryCount: number;
  playerCount: number;
  lineCount: number;         // Power655 có lineCount; Keno/Bingo18 bỏ field này
  totalStake: number;        // VND
  estimatedCommission: number; // VND
}

/** Aggregate player cho 1 draw × 1 tenant outstanding. Drill cấp 3. */
export interface OutstandingPlayerBreakdownRow {
  accountId: string;
  username: string;
  entryCount: number;
  lineCount: number;         // Power655 có; Keno/Bingo18 bỏ
  totalStake: number;        // VND
  commissionAmount: number;  // VND
}
```

Re-export:
- `repos/types/index.ts` — thêm export 2 interfaces trên
- `repos/index.ts` — thêm 2 types vào export block

**Template 7 games:** Keno/Bingo18 bỏ `lineCount` khỏi cả 2 interfaces.

### 1B. Repo mới — `entry-outstanding-repo.ts`

**File:** `packages/game-power655-application/src/infras/repos/entry-outstanding-repo.ts`

Class `EntryOutstandingRepository extends BaseRepo<any>` — 3 methods:

```
aggregateTenantsByDraw(drawId)
  → Filter: { drawId, status: "scheduled" }
  → Group by tenantId
  → Bước 1: group (drawId, accountId, tenantId) → dedup players
  → Bước 2: group tenantId → count metrics
  → Sort: totalStake DESC
  → Return: OutstandingTenantBreakdownRow[]

aggregatePlayersByDrawAndTenant(drawId, tenantId)
  → Filter: { drawId, tenantId, status: "scheduled" }
  → Group by accountId
  → Sort: totalStake DESC
  → Return: OutstandingPlayerBreakdownRow[]

findEntriesByDrawTenantPlayer(drawId, tenantId, accountId)
  → Filter: { drawId, tenantId, accountId, status: "scheduled" }
  → Sort: createdAt DESC
  → Return: TicketEntryEntity[]
```

JSDoc theo code-quality-standards.mdc §2 (mục đích, filter, index hint).
Pipeline: mỗi stage có comment, mỗi field 1 dòng (mongodb-repository-architecture.mdc §6).
Result mapped sang typed interface — KHÔNG return raw any (§6.2).
Index: `{ drawId: 1, tenantId: 1, accountId: 1 }` (đã có).

Export từ `repos/index.ts`.

### 1C. Use Case types — `use-cases/reports/types.ts`

Thêm 6 interfaces vào cuối file:

```typescript
// ─── Outstanding Drill-Down ──────────────────────────────────────────────────

export interface ListOutstandingDrawTenantsInput { drawId: string; }
export interface ListOutstandingDrawTenantsOutput { data: OutstandingTenantBreakdownRow[]; }

export interface ListOutstandingTenantPlayersInput { drawId: string; tenantId: string; }
export interface ListOutstandingTenantPlayersOutput { data: OutstandingPlayerBreakdownRow[]; }

export interface ListOutstandingPlayerEntriesInput { drawId: string; tenantId: string; accountId: string; }
export interface ListOutstandingPlayerEntriesOutput { data: TicketEntryEntity[]; }
```

### 1D. Use Cases mới — `use-cases/reports/`

| File | Class | Repo method |
|---|---|---|
| `list-outstanding-draw-tenants.ts` | `ListOutstandingDrawTenantsUseCase` | `repo.aggregateTenantsByDraw(drawId)` |
| `list-outstanding-tenant-players.ts` | `ListOutstandingTenantPlayersUseCase` | `repo.aggregatePlayersByDrawAndTenant(drawId, tenantId)` |
| `list-outstanding-player-entries.ts` | `ListOutstandingPlayerEntriesUseCase` | `repo.findEntriesByDrawTenantPlayer(drawId, tenantId, accountId)` |

Mỗi use case:
- `private readonly repo = new EntryOutstandingRepository()`
- KHÔNG MongoDB query trực tiếp (mongodb-repository-architecture.mdc §3)
- Export từ `use-cases/reports/index.ts`

### 1E. API Routes mới

**Base:** `apps/backoffice/src/app/api/power655/reports/outstanding/`

```
[drawId]/
  tenants/route.ts                              → ListOutstandingDrawTenantsUseCase
  [tenantId]/
    players/route.ts                            → ListOutstandingTenantPlayersUseCase
    [accountId]/
      entries/route.ts                          → ListOutstandingPlayerEntriesUseCase
```

Mỗi route:
- `withApi().auth({ roles: [CompanyRole.Staff] })`
- Use case singleton ở module level (không tạo lại mỗi request)
- params từ dynamic route segment (Next.js), không cần Zod cho path params
- Pattern: `withApi().auth(...).handler(async ({ params }) => useCase.run({ drawId: params.drawId }))`

---

## 2. FRONTEND — Query Keys & Hooks

### 2A. Query Keys — `lib/query-keys/power655.ts`

Thay `outstanding: [MODULE, "outstanding"]` bằng prefix tree:

```typescript
// ─── Outstanding ───────────────────────────────────────────────────────────

/** Invalidate toàn bộ outstanding (draws + tenants + players + entries) */
outstanding: [MODULE, "outstanding"] as const,

/** Level 1: danh sách draws outstanding (live, refetch 60s) */
outstandingDraws: [MODULE, "outstanding", "draws"] as const,

/** Level 2: tenant breakdown của 1 draw */
outstandingTenants: (drawId: string) =>
  [MODULE, "outstanding", "tenants", { drawId }] as const,

/** Level 3: player breakdown của 1 draw × 1 tenant */
outstandingPlayers: (p: { drawId: string; tenantId: string }) =>
  [MODULE, "outstanding", "players", p] as const,

/** Level 4: entries của 1 draw × 1 tenant × 1 player */
outstandingEntries: (p: { drawId: string; tenantId: string; accountId: string }) =>
  [MODULE, "outstanding", "entries", p] as const,
```

**Hook hiện có** `usePower655Outstanding` đổi key từ `outstanding` → `outstandingDraws`.

Invalidate toàn bộ outstanding:
```typescript
qc.invalidateQueries({ queryKey: power655Keys.outstanding });
```

### 2B. Query Hooks — `use-report-queries.ts`

Thêm 3 hooks (đổi key outstanding hiện có + 3 mới):

```typescript
// Sửa hook hiện có: đổi queryKey
export function usePower655Outstanding() {
  return useQuery({
    queryKey: power655Keys.outstandingDraws,  // ← đổi từ .outstanding
    ...
  });
}

// 3 hooks mới
export function usePower655OutstandingDrawTenants(drawId: string | null)
export function usePower655OutstandingTenantPlayers(drawId: string, tenantId: string | null)
export function usePower655OutstandingPlayerEntries(drawId: string, tenantId: string, accountId: string | null)
```

---

## 3. FRONTEND — Component Files

### 3A. Cấu trúc thư mục

```
apps/backoffice/src/app/(main)/games/power655/
├── outstanding/
│   └── page.tsx                                   ← Minimal: Suspense + <OutstandingContent />
├── _shared/
│   └── outstanding/
│       ├── use-outstanding-filters.ts             ← nuqs URL state + DrillLevel + navigateTo*
│       ├── outstanding-content.tsx                ← Orchestrator (render đúng level)
│       ├── outstanding-breadcrumb.tsx             ← Breadcrumb navigation
│       ├── outstanding-draw-list.tsx              ← Level 1 (refactor từ page.tsx hiện tại)
│       ├── outstanding-tenant-breakdown.tsx       ← Level 2
│       ├── outstanding-player-breakdown.tsx       ← Level 3
│       ├── outstanding-entry-list.tsx             ← Level 4 + EntryDetailDialog
│       └── index.ts                               ← Barrel export
└── financial-reports/_lib/
    ├── use-report-queries.ts                      ← +3 hooks mới
    └── sections/
        └── entry-list.tsx                         ← Power655EntryDetailDialog (reuse)
```

### 3B. `use-outstanding-filters.ts`

```typescript
export type OutstandingDrillLevel = "list" | "draw-tenants" | "players" | "entries";

export function usePower655OutstandingFilters() {
  const [drawId, setDrawId] = useQueryState("draw", parseAsString);
  const [tenantId, setTenantId] = useQueryState("tenant", parseAsString);
  const [playerId, setPlayerId] = useQueryState("player", parseAsString);
  // playerName lưu username để breadcrumb/card title dùng — tránh truyền qua props
  const [playerName, setPlayerName] = useQueryState("playerName", parseAsString);

  const level: OutstandingDrillLevel = playerId
    ? "entries"
    : tenantId && drawId ? "players"
    : drawId ? "draw-tenants"
    : "list";

  const navigateToList    // → clear draw, tenant, player, playerName
  const navigateToDraw    // → set draw, clear tenant, player, playerName
  const navigateToTenant  // → set tenant, clear player, playerName
  // navigateToPlayer nhận (accountId, username?) — lưu cả 2 vào URL
  const navigateToPlayer(id: string, username?: string)
}
```

**Quan trọng**: Mỗi level component **tự gọi** `useXxxOutstandingFilters()` để lấy navigate helpers
— KHÔNG nhận callbacks qua props. Cùng pattern với financial reports (`by-draw.tsx`).

### 3C. `outstanding-breadcrumb.tsx`

Pattern: `[Outstanding] > [2026-03-20.001] > [VL-HCM] > username_display`
- `Button variant="ghost" size="sm"` cho segments trước current
- `span bg-secondary` cho current level
- `ChevronRight size-3 text-muted-foreground` giữa segments
- **Level 4**: hiển thị `playerName ?? playerId` — username ưu tiên hơn accountId

### 3D. `outstanding-draw-list.tsx` — Level 1

Tự gọi `useXxxOutstandingFilters()` để lấy `navigateToDraw`.

- `<TableRow onClick={() => navigateToDraw(drawId)} className="cursor-pointer hover:bg-muted/50">`
- KHÔNG icon chevron cuối row (frontend-dev.mdc §7.3)
- Cột drawId: **toàn bộ cell** là `<Link href="/operations?draw=xxx">` với `e.stopPropagation()` — click drawId đi Operations, click row còn lại drill vào tenants
- Icon `ExternalLink` hover-only bên cạnh drawId text (hiển thị khi hover link)
- Bỏ `text-muted-foreground` khỏi cột "Ước tính HH"

Cột (8 cột, pl-5 / pr-5 cho đầu cuối):

| # | Cột | Align | Format |
|---|---|---|---|
| 1 | Ngày tài chính | left, pl-5 | text `tabular-nums` |
| 2 | Kỳ quay | left | `<Link>` bao toàn bộ + icon ExternalLink hover |
| 3 | Người chơi | right | `formatNumber tabular-nums` |
| 4 | Đại lý | right | `formatNumber tabular-nums` |
| 5 | Lượt cược | right | `formatNumber tabular-nums` |
| 6 | Dòng cược | right | `formatNumber tabular-nums` |
| 7 | Ước tính HH | right | `formatNumber tabular-nums` |
| 8 | Tổng tiền cược | right, pr-5 | `formatNumber tabular-nums font-medium` |

Footer TỔNG CỘNG: colSpan=4 cho cột text, sum cột số, `font-semibold`.

### 3E. `outstanding-tenant-breakdown.tsx` — Level 2

Data: `usePower655OutstandingDrawTenants(drawId)`
Click row: `navigateToTenant(tenantId)` — KHÔNG icon chevron

| # | Cột | Align | Format |
|---|---|---|---|
| 1 | Đại lý | left, pl-5 | text `font-medium` |
| 2 | Lượt cược | right | `formatNumber tabular-nums` |
| 3 | Người chơi | right | `formatNumber tabular-nums` |
| 4 | Dòng cược | right | `formatNumber tabular-nums` |
| 5 | Ước tính HH | right | `formatNumber tabular-nums` |
| 6 | Tổng tiền cược | right, pr-5 | `formatNumber tabular-nums font-medium` |

Card: icon `Building2`, title `"Đại lý — Kỳ {drawId}"`, description `"{n} đại lý · Click để xem players"`
Footer TỔNG CỘNG: colSpan=1, sum cột số.

### 3F. `outstanding-player-breakdown.tsx` — Level 3

Data: `usePower655OutstandingTenantPlayers(drawId, tenantId)`
Click row: `navigateToPlayer(accountId)` — KHÔNG icon chevron
KHÔNG cột Payout/Lãi lỗ (outstanding = chưa settle)

| # | Cột | Align | Format |
|---|---|---|---|
| 1 | Người chơi | left, pl-5 | text `font-medium` (username fallback accountId) |
| 2 | Lượt cược | right | `formatNumber tabular-nums` |
| 3 | Dòng cược | right | `formatNumber tabular-nums` |
| 4 | Ước tính HH | right | `formatNumber tabular-nums` |
| 5 | Tổng tiền cược | right, pr-5 | `formatNumber tabular-nums font-medium` |

Card: icon `Users`, title `"Players — Kỳ {drawId} / {tenantId}"`.
Footer TỔNG CỘNG: colSpan=1, sum cột số.

### 3G. `outstanding-entry-list.tsx` — Level 4

Data: `usePower655OutstandingPlayerEntries(drawId, tenantId, accountId)`
Click row: mở `Power655EntryDetailDialog` (import từ `financial-reports/_lib/sections/entry-list.tsx`)
Dialog ở outstanding mode: `status === "scheduled"` → ẩn result/payout, hiện "Đang chờ quay số"

| # | Cột | Align | Format |
|---|---|---|---|
| 1 | Mã vé | left, pl-5 | text `font-mono` |
| 2 | Dòng cược | right | `formatNumber tabular-nums` |
| 3 | Ước tính HH | right | `formatNumber tabular-nums` |
| 4 | Tiền cược | right | `formatNumber tabular-nums font-medium` |
| 5 | Thời gian đặt | left, pr-5 | `displayVNDateTime` `tabular-nums` |

Card: icon `Ticket`, title `"Entries — {accountId}"`, description `"{n} entries · Kỳ {drawId} · {tenantId}"`.
Footer TỔNG CỘNG: sum lineCount, commission, amount.

### 3H. `outstanding-content.tsx` — Orchestrator

```
- usePower655OutstandingFilters() → drawId, tenantId, playerId, playerName, level
- usePower655Outstanding() → data, isLoading, error, isFetching, refetch
- PageHeader:
  - Bên trái: icon gradient + title + subtitle "Entries chưa settle"
  - Bên phải: <LiveDot> — animated ping dot (xanh / amber khi fetching)
    - Click → refetch()
    - Tooltip: "Tự động refresh mỗi 60s · Nhấn để lấy dữ liệu mới nhất"
    - KHÔNG text "Cập nhật lúc..." hay icon RefreshCw button rời
- KpiStrip: chỉ level=list
- Breadcrumb: level≠list, nhận playerName để hiển thị username thay accountId
- Level components: KHÔNG truyền callbacks qua props — mỗi child tự gọi hook
```

### 3I. `page.tsx` — Minimal wrapper

```typescript
"use client";
export default function Power655OutstandingPage() {
  return (
    <Suspense fallback={<OutstandingSkeleton />}>
      <OutstandingContent />
    </Suspense>
  );
}
```

---

## 4. Format số liệu

| Vị trí | Formatter | Output |
|---|---|---|
| KPI cards value tiền | `formatVNDCompact` | `3,3 triệu` |
| KPI cards value count | `formatNumber` | `327` |
| **Bảng mọi cột tiền** | **`formatNumber`** | **`3,270,000`** |
| **Bảng mọi cột count** | **`formatNumber`** | **`327`** |
| Footer TỔNG CỘNG tiền | `formatNumber` + `font-semibold` | `3,270,000` |
| Thời gian | `displayVNDateTime` | `26/03/2026 14:28` |

Font-size toàn bộ bảng: `text-sm` (default TableCell). Không mix `text-xs` và `text-sm` trong 1 bảng.
KHÔNG `text-muted-foreground` cho cột Ước tính HH và Thời gian đặt.

---

## 5. DRY — Reuse cho Player Account Page

`/accounts/players/[accountId]/outstanding` khi `og=power655`:
- Import `OutstandingEntryList` từ `games/power655/_shared/outstanding/`
- Props: `{ drawId, tenantId: player.tenantId, accountId }`
- EntryDetailDialog: đã reuse qua `GameEntryDetailDialog` → outstanding mode

---

## 6. Template 7 games — Khác biệt

| Game | lineCount | EntryDetailDialog | Label đặc biệt |
|---|---|---|---|
| Power 6/55 | CÓ | `Power655EntryDetailDialog` | Chuẩn |
| Mega 6/45 | CÓ | `Mega645EntryDetailDialog` | Chuẩn |
| Lotto 5/35 | CÓ | `Lotto535EntryDetailDialog` | Chuẩn |
| Max 3D | CÓ | `Max3dEntryDetailDialog` | "Cặp số" thay "Dòng cược" |
| Max 3D Pro | CÓ | `Max3dproEntryDetailDialog` | "Cặp số" thay "Dòng cược" |
| Keno | KHÔNG | `KenoEntryDetailDialog` | Bỏ cột lineCount |
| Bingo 18 | KHÔNG | `Bingo18EntryDetailDialog` | Bỏ cột lineCount |

Data source: `{game}_ticket_entries`, index `{ drawId: 1, tenantId: 1, accountId: 1 }`.

Entry fields available khi `status = "scheduled"`:
- `tenantId`, `accountId`, `username`, `drawId`, `financialDate`
- `lineCount` (5 games), `amount`, `tenant.commissionAmount`
- `entrySummary.ticketNo`, `entrySummary.boards`
- `createdAt`

---

## 7. Thứ tự implement

| # | Task | Files |
|---|---|---|
| 1 | Types mới | `repos/types/entry-outstanding.types.ts` + cập nhật `types/index.ts`, `repos/index.ts` |
| 2 | Repo mới | `repos/entry-outstanding-repo.ts` |
| 3 | Use case types | `use-cases/reports/types.ts` |
| 4 | Use cases (3) | 3 files mới + cập nhật `index.ts` |
| 5 | API routes (3) | 3 route files mới |
| 6 | Query keys | `lib/query-keys/power655.ts` |
| 7 | Query hooks | `use-report-queries.ts` (+3 hooks, sửa 1 hook) |
| 8 | URL state | `_shared/outstanding/use-outstanding-filters.ts` |
| 9 | Breadcrumb | `_shared/outstanding/outstanding-breadcrumb.tsx` |
| 10 | Level 1 | `_shared/outstanding/outstanding-draw-list.tsx` |
| 11 | Orchestrator | `_shared/outstanding/outstanding-content.tsx` |
| 12 | Page refactor | `outstanding/page.tsx` |
| 13 | Level 2 | `_shared/outstanding/outstanding-tenant-breakdown.tsx` |
| 14 | Level 3 | `_shared/outstanding/outstanding-player-breakdown.tsx` |
| 15 | Level 4 | `_shared/outstanding/outstanding-entry-list.tsx` |
| 16 | Barrel | `_shared/outstanding/index.ts` |
| 17 | Type check | `pnpm --filter @megawin/game-power655-application check-types` |

---

## 8. Entry Detail Dialog — Per-game Specs

### 8.0 Quy tắc chung (mọi game)

- Dialog width: **`max-w-3xl`** — đủ rộng để hiển thị nhiều board / số
- `ScrollArea max-h-[76vh]`
- Header `DialogDescription`: `ticketNo · drawId` (font-mono, text-xs), `DialogTitle` có icon `Ticket`
- **KHÔNG lặp lại Mã vé và Kỳ quay trong metadata** — đã có trong header
- Layout 7 sections theo thứ tự:
  1. **Metadata 2-column** (grid-cols-2, nền muted, label trái value phải):
     - Row 1: Người chơi (icon User) · Dòng cược (icon Layers)
     - Row 2: Đại lý (icon Building2) · Đặt lúc (icon Clock)
     - `toTenantUsername()` bỏ suffix `@tenantId` — truncate 14 ký tự + Tooltip nếu dài hơn
  2. **Status row**: badge trạng thái + outcome badge + "Kết quả có sau kỳ quay" (scheduled)
  3. **Financial KPI** với icon semantic:
     - Tiền cược: icon `Banknote` nền emerald
     - Trả thưởng: icon `Banknote` nền blue (chỉ settled)
     - Hoa hồng: icon `HandCoins` nền amber
     - Lãi/lỗ: text color profit/loss (chỉ settled)
     - Outstanding → 2 ô; Settled → 4 ô
  4. **Kết quả** (chỉ khi có result và không phải scheduled)
  5. **Bộ số đã chọn** (luôn hiển thị, board colors CSS variables)
  6. **Giải trúng** (chỉ khi có tiers và không phải scheduled)
- Ball: component `Ball` riêng, variants: `default`, `matched`, `bonus`, `result`, `result-bonus`
- Board label: boardNo + playType badge + betCount badge (nếu > 1)
- Footer tổng giải: chỉ hiện khi `tiers.length > 1`

**Imports cần thiết (mọi game):**
```typescript
import { Ticket, Building2, User, Clock, Layers, Banknote, HandCoins } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNumber, displayVNDateTime, toTenantUsername } from "@megawin/shared/utils";
```

**Username truncate pattern (dùng chung):**
```typescript
const tenantUsername = toTenantUsername(entry.username);
const MAX_USERNAME_LEN = 14;
const truncatedUsername =
  tenantUsername.length > MAX_USERNAME_LEN
    ? tenantUsername.slice(0, MAX_USERNAME_LEN) + "…"
    : tenantUsername;
// Render: nếu truncated → TooltipProvider > Tooltip > TooltipTrigger + TooltipContent
```

**Financial KPI icon map (semantic colors theo frontend-dev.mdc §1.2a):**

| Mục | Icon | iconBg | iconColor |
|---|---|---|---|
| Tiền cược | `Banknote` | `bg-emerald-100 dark:bg-emerald-900/50` | `text-emerald-600 dark:text-emerald-400` |
| Trả thưởng | `Banknote` | `bg-blue-100 dark:bg-blue-900/50` | `text-blue-600 dark:text-blue-400` |
| Hoa hồng | `HandCoins` | `bg-amber-100 dark:bg-amber-900/50` | `text-amber-600 dark:text-amber-400` |

---

### 8.1 Power 6/55 — `Power655EntryDetailDialog`

**Board structure:** Mỗi board chọn **6 số chính** (01–55). KHÔNG có bonus per-board.

**Số quay:** 6 main numbers + 1 bonus number (quay riêng từ pool còn lại sau khi rút 6).

**Bonus** là số **thuộc pool 55** nhưng KHÔNG nằm trong 6 main đã rút — hiển thị riêng biệt sau dấu `|` trong kết quả.

**Highlight logic:**
- Số chính trùng `winningMain` → `variant="matched"` (xanh primary)
- Số chính trùng `bonusNumber` → `variant="bonus"` (amber) ← số chọn trùng với bonus draw
- Số chính không trúng → `variant="default"` (muted)

**Prize tiers:** `jackpot1`, `jackpot2`, `tier1`, `tier2`, `tier3`

**Entry board fields:** `board.mainNumbers: string[]`, `board.playType`, `board.expandedLines`, `board.betCount`

**Play types:** `standard` (1 line), `bao5`–`bao18` (C(N,6) lines)

**Board display:**
```
Board A  [05] [12] [23] [34] [45] [55]   (standard → không hiển thị playType badge)
Board B  [Bao 7]  [02] [08] [14] [21] [33] [47] [55]   (7 số → C(7,6) = 7 lines)
```

**Kết quả display:**
```
⬤05 ⬤12 ⬤23 ⬤34 ⬤45 ⬤55  |  🟡41  bonus
```

---

### 8.2 Mega 6/45 — `Mega645EntryDetailDialog`

**Board structure:** Mỗi board chọn **6 số** (01–45). KHÔNG có bonus number.

**Số quay:** 6 winning numbers (`winningNumbers: string[]`). KHÔNG có bonus.

**Highlight logic:**
- Số trùng `winningNumbers` → `variant="matched"` (xanh primary)
- Không trúng → `variant="default"`

**Prize tiers:** `jackpot1`, `jackpot2` (nếu có), `tier1`–`tier4`

**Entry board fields:** `board.numbers: string[]`, `board.playType`, `board.expandedLines`, `board.betCount`

**Play types:** `standard`, `bao5`–`bao18`

**Board display:**
```
Board A  [07] [15] [22] [31] [38] [45]
```

**Kết quả display:**
```
⬤07 ⬤15 ⬤22 ⬤31 ⬤38 ⬤45
```
(Không có bonus separator)

---

### 8.3 Lotto 5/35 — `Lotto535EntryDetailDialog`

**Board structure:** Mỗi board chọn **5 số chính** (01–35) + **1–N số đặc biệt** (01–12, tùy playType).

**Số quay:** 5 main + 1 special (`winningMain: string[]`, `winningSpecial: string`).

**Highlight logic:**
- Main trùng `winningMain` → `variant="matched"` (xanh)
- Special trùng `winningSpecial` → `variant="bonus"` (amber)

**Entry board fields:** `board.mainNumbers: string[]`, `board.specialNumbers: string[]`, `board.playType`, `board.expandedLines`, `board.betCount`

**Play types:** `standard` (1M×1S), `mainCover`, `specialCover`, v.v.

**Board display (2 nhóm ngăn cách bằng `|`):**
```
Board A  [03] [11] [19] [25] [31]  |  🟡07
```
- Nhóm main (trắng/xanh nếu trúng) — rộng hơn vì pool 1–35
- Nhóm special (amber border) — hiển thị nhỏ hơn vì pool 1–12
- Nếu `specialNumbers.length > 1`: hiển thị nhiều special balls (bao special)

**Kết quả display:**
```
⬤03 ⬤11 ⬤19 ⬤25 ⬤31  |  🟡07
```

---

### 8.4 Keno — `KenoEntryDetailDialog`

**Board structure:** Đặc biệt nhất — board CÓ THỂ là:
- **Pick N** (1–10 số từ 01–80): `board.numbers: string[]`
- **Big/Small side bet**: `board.bet: KenoBigSmallBet` (`"big"` | `"small"` | `"bigSmallDraw"`)
- **Even/Odd side bet**: `board.bet: KenoEvenOddBet` (`"even"` | `"odd"` | v.v.)

**Số quay:** 20 numbers (`winningNumbers: string[]`)

**Kết quả (kỳ Keno):**
```
🔵01 🔵07 🔵14 ... (20 numbers)
bigCount: 12 / smallCount: 8
evenCount: 11 / oddCount: 9
```

**Board display logic:**
```typescript
if (board.numbers) {
  // Pick N — hiển thị dạng bóng, highlight matched
} else if (board.bet) {
  // Side bet — hiển thị chip text lớn: "Lớn", "Nhỏ", "Chẵn", "Lẻ"
  // Với kết quả: hiển thị thêm "→ 12 số lớn / 8 số nhỏ → Win/Lose"
}
```

**Highlight Pick N:**
- Số trùng trong 20 winning → `variant="matched"`

**Board display:**
```
Board A  (pick 5)  [04] [12] [35] [67] [72]     3/5 trúng ✓
Board B  (big)     "LỚN"     → 12 số lớn → Win ✓
Board C  (even)    "CHẴN"    → 11 số chẵn → Win ✓
```

**KHÔNG có:** `lineCount`, `expandedLines`, bao play

---

### 8.5 Max 3D — `Max3dEntryDetailDialog`

**Board structure:** Mỗi board là **triplet(s)** — bộ ba số 000–999.

**Số quay:** 20 triplets: `special[2]`, `first[4]`, `second[6]`, `third[8]` (từ `Max3dDrawResult`).

**2 play modes hoàn toàn khác nhau:**

**Basic mode** (`playMode = "basic"`)
- `board.triplets: Triplet[]` — 1 triplet (straight) hoặc multiple (combo)
- Play types: `straight` | `combo3` | `combo6`
- Display: hiển thị từng triplet "096", với badge playType nếu combo

```
Board A  [straight]  096
Board B  [combo3]    221  → 3 hoán vị: 221 212 122
```

**Plus mode** (`playMode = "plus"`)
- `board.triplets: Triplet[]` — 2 triplets (1 cặp)
- Display: hiển thị cặp với dấu `+` giữa

```
Board A  [plus]  096  +  389
```

**Kết quả display (20 triplets, nhóm theo hạng):**
```
ĐB:    [096] [389]
Nhất:  [123] [456] [789] [012]
Nhì:   [234] [345] ... (6)
Ba:    [567] [678] ... (8)
```

**Highlight:**
- Triplet trùng trong `special` → badge "ĐB"
- Triplet trùng trong `first` → badge "Nhất"
- v.v.

**Prize tiers (basic):** `special`, `first`, `second`, `third`
**Prize tiers (plus):** `special`, `first`, `second`, `third`, `fourth`, `fifth`, `sixth`

---

### 8.6 Max 3D Pro — `Max3dproEntryDetailDialog`

**Board structure:** Mỗi board là **1 cặp ordered** (TripletPair: `{first, second}`).

**2 play modes:**

**MultiNumber** (`playMode = "multiNumber"`)
- `board.triplets: Triplet[]` — N bộ (3–20), hệ thống tạo P(N,2) ordered pairs
- Display: hiển thị danh sách triplets đã chọn + thông tin "P(N,2) cặp"

```
Board A  [multiNumber · 3 bộ]
  096  389  683   →  6 cặp
```

**MultiDigit** (`playMode = "multiDigit"`)
- `board.frontDigits: number[]` + `board.backDigits: number[]`
- Display: hiển thị dạng `[0,9,6] × [3,8,9]`

```
Board A  [multiDigit]
  Front: [0] [9] [6]   ×   Back: [3] [8] [9]   →  36 cặp
```

**Kết quả:** giống Max 3D (20 triplets grouped).

**Thêm ĐB/phụ ĐB highlight:**
```
ĐB (đúng thứ tự):   [096 → 389]  ← Giải ĐB 2 tỷ
Phụ ĐB (ngược TT):  [389 → 096]  ← Giải phụ ĐB 400 triệu
```

**Prize tiers:** `special`, `specialSub`, `first`, `second`, `third`, `fourth`, `fifth`, `sixth`

---

### 8.7 Bingo 18 — `Bingo18EntryDetailDialog`

**Board structure:** Mỗi board là 1 kiểu cược:

| `playType` | Fields | Display |
|---|---|---|
| `singleNum` | `board.number: number` | "Số X" |
| `doubleMatch` | `board.number: number` | "Đôi X" |
| `tripleMatch` specific | `board.number: number`, `board.tripleKind: "specific"` | "Ba số X" |
| `tripleMatch` any | `board.tripleKind: "any"` | "Ba số bất kỳ" |
| `sumTotal` | `board.sum: number` | "Tổng = X" |
| `bigSmallDraw` | `board.bet: "big"|"small"|"draw"` | "Lớn" / "Nhỏ" / "Hoà" |

**Số quay:** `result.numbers: number[]` (3 số) + `result.sum: number`

**Kết quả display:**
```
🔵 07  +  🔵 08  +  🔵 03  =  18
```

**Board display (theo playType):**
```
Board A  [singleNum]   số 7    → ✓ Win
Board B  [doubleMatch] đôi 8   → ✓ Win (08+08 ... thực ra 07+08+03 → không có đôi 8)
Board C  [sumTotal]    tổng 18 → ✓ Win
Board D  [bigSmallDraw] LỚN    → tổng 18 ≥ 11 → ✓ Win
```

**Highlight:** match/no-match đơn giản per board, không có ball grid phức tạp.

**KHÔNG có:** `lineCount`, main/special number grids

---

### 8.8 Nguyên tắc đồng bộ dialog rộng (`max-w-3xl`)

1. Mọi game đều dùng `max-w-3xl` — đảm bảo đủ không gian cho board có nhiều số (bao 18 = 18 balls/board)
2. Component `Ball` dùng chung — chỉ khác `size` (sm/md) và `variant`
3. Section "Bộ số đã chọn" tự co giãn: `flex flex-wrap` — không bị overflow
4. **Board colors**: CSS variables `--board-a` → `--board-f` (globals.css), dùng chung tất cả games
   - A = red, B = orange, C = blue, D = purple, E = emerald, F = amber
   - Board row có `border-l-[3px]` + `boardNo` text color theo `BOARD_COLORS[boardNo]`
   - Map: `const BOARD_COLORS = { A: "var(--board-a)", B: "var(--board-b)", ... }`
   - Dark mode variants tự động (đã define trong `.dark {}`)
5. **Metadata layout**: grid 2 cột, icon + label + value per row — `toTenantUsername()` bỏ suffix @tenantId
6. Section "Kết quả" hiển thị khác nhau theo game:
   - **Lotto/Power/Mega**: hàng balls ngang
   - **Max 3D/Pro**: nhóm theo hạng giải (table-like)
   - **Keno**: grid 4×5 balls (20 số) với count summary
   - **Bingo 18**: 3 balls lớn + tổng
7. Prize tier labels: mỗi game có constant riêng (`POWER655_PRIZE_TIER_LABELS`, `MEGA645_PRIZE_TIER_LABELS`, ...)

---

## 9. Checklist rules

### code-quality-standards.mdc
- [ ] JSDoc `/** */` cho class, method, interface, field (§1-2)
- [ ] Comment `//` cho business logic trong pipeline (§3)
- [ ] Import types từ entity package, không duplicate (§5)

### mongodb-repository-architecture.mdc
- [ ] Types tách `repos/types/entry-outstanding.types.ts` — KHÔNG inline trong repo (§2)
- [ ] Re-export từ `types/index.ts` → `repos/index.ts` (§2, §5)
- [ ] KHÔNG MongoDB query trong use case (§3)
- [ ] API route → Use Case → Repo (§3b)
- [ ] Use case singleton ở module level (§3b.4)
- [ ] Pipeline: mỗi stage comment, mỗi field 1 dòng (§6)
- [ ] Result map sang typed interface (§6.2)

### frontend-dev.mdc
- [ ] URL state qua `nuqs`, DrillLevel tính từ params (§7.1)
- [ ] `playerName` lưu username vào URL khi `navigateToPlayer(id, username)` — breadcrumb/card hiển thị username thay accountId
- [ ] Breadcrumb cho view >= 2 levels (§7.2) — Level 4 hiển thị `playerName ?? playerId`
- [ ] Click row drill — KHÔNG icon chevron cuối row (§7.3)
- [ ] Cột drawId: `<Link>` bao toàn bộ cell + `e.stopPropagation()` — click drawId → Operations, click row → drill (§7.3)
- [ ] Mỗi level component **tự gọi** `useXxxOutstandingFilters()` — KHÔNG nhận callbacks qua props
- [ ] `<LiveDot>` thay text "Cập nhật lúc..." + icon RefreshCw rời — click dot → refetch, Tooltip giải thích
- [ ] `formatNumber` cho tiền trong bảng (§6 financial-report-ui)
- [ ] `text-sm tabular-nums` đồng nhất (§1.7)
- [ ] KPI card pattern horizontal icon (§1.2a)
- [ ] Footer TỔNG CỘNG `font-semibold` (§8 financial-report-ui)
- [ ] Query hooks tách file, dùng centralized keys (§4.1, §4.2)
- [ ] KHÔNG `text-muted-foreground` cho cột Ước tính HH và Thời gian đặt
