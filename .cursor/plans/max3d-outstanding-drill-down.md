# Max 3D Outstanding Drill-Down — Implementation Plan
# Dựa trên template Power 6/55, adapt cho Max 3D
# Cập nhật: 2026-03-26

## 0. Tổng quan scope

Thêm 4-level drill-down vào outstanding page Max 3D, cùng pattern với Power 6/55.
Max 3D **CÓ `lineCount`** (straight=1, combo3=3, combo6=6), label "Cặp số" thay "Dòng cược".

```
Level 1: Draw List        → /games/max3d/outstanding               (refactor page hiện tại)
Level 2: Tenant Breakdown → /games/max3d/outstanding?draw=xxx
Level 3: Player Breakdown → /games/max3d/outstanding?draw=xxx&tenant=T001
Level 4: Entry List       → /games/max3d/outstanding?draw=xxx&tenant=T001&player=ACC123
         + Entry Detail   → Dialog (reuse Max3dEntryDetailDialog outstanding mode)
```

### Khác biệt Max 3D so với Power 6/55

| Đặc điểm | Power 6/55 | Max 3D |
|---|---|---|
| Collection | `power655_ticket_entries` | `max3d_ticket_entries` |
| lineCount | CÓ (bao expand) | CÓ (combo expand: 1/3/6) |
| Label dòng cược | "Dòng cược" | "Cặp số" |
| Entry entity | `@megawin/game-power655/entities` | `@megawin/game-max3d/entities` |
| Collections enum | `Power655Collections` | `Max3dCollections` |
| EntryStatus import | `@megawin/game-core/entities` | `@megawin/game-core/entities` (giống) |
| Jackpot | CÓ (dual JP) | KHÔNG |
| Boards max | 5 (A-E) | 4 (A-D) |
| GameProduct | `GameProduct.Power655` | `GameProduct.Max3d` |
| EntryDetailDialog | `Power655EntryDetailDialog` | `Max3dEntryDetailDialog` |
| DrawId format | `YYYY-MM-DD.NNN` | `YYYY-MM-DD.NNN` (giống) |
| betCount | CÓ | CÓ |

---

## 1. BACKEND — Layers & Files

### 1A. Types mới — `repos/types/entry-outstanding.types.ts`

**File:** `packages/game-max3d-application/src/infras/repos/types/entry-outstanding.types.ts`

```typescript
/** Aggregate tenant cho 1 draw outstanding. Drill cấp 2. */
export interface OutstandingTenantBreakdownRow {
  tenantId: string;
  entryCount: number;
  playerCount: number;
  lineCount: number;         // Max 3D CÓ lineCount (1/3/6 tuỳ combo)
  totalStake: number;        // VND
  estimatedCommission: number; // VND
}

/** Aggregate player cho 1 draw × 1 tenant outstanding. Drill cấp 3. */
export interface OutstandingPlayerBreakdownRow {
  accountId: string;
  username: string;
  entryCount: number;
  lineCount: number;         // Max 3D CÓ
  totalStake: number;        // VND
  commissionAmount: number;  // VND
}
```

Re-export:
- `repos/types/index.ts` — thêm export 2 interfaces trên
- `repos/index.ts` — đã có `export type * from "./types"` → tự động

### 1B. Repo mới — `entry-outstanding-repo.ts`

**File:** `packages/game-max3d-application/src/infras/repos/entry-outstanding-repo.ts`

Class `EntryOutstandingRepository extends BaseRepo<any>` — 3 methods:

```
aggregateTenantsByDraw(drawId)
  → Filter: { drawId, status: "scheduled" }
  → Double-$group pattern (dedup players):
    Bước 1: group (accountId, tenantId) → metrics per player-tenant
    Bước 2: group tenantId → count playerCount + sum metrics
  → Sort: totalStake DESC
  → Return: OutstandingTenantBreakdownRow[]

aggregatePlayersByDrawAndTenant(drawId, tenantId)
  → Filter: { drawId, tenantId, status: "scheduled" }
  → Group by accountId, $first username
  → Sort: totalStake DESC
  → Return: OutstandingPlayerBreakdownRow[]

findEntriesByDrawTenantPlayer(drawId, tenantId, accountId)
  → Filter: { drawId, tenantId, accountId, status: "scheduled" }
  → Sort: createdAt DESC
  → Return: TicketEntryEntity[]
```

**Imports:**
- `Max3dCollections` từ `@megawin/game-max3d/entities`
- `EntryStatus` từ `@megawin/game-core/entities`
- `TicketEntryEntity` từ `@megawin/game-max3d/entities`
- `EntryMapper` từ `../mappers/entry-mapper`

Index đang có: `{ drawId: 1, tenantId: 1, accountId: 1 }`

Export từ `repos/index.ts`.

### 1C. Use Case types — `use-cases/reports/types.ts`

Thêm 6 interfaces vào cuối file (sau `SyncOutstandingResult`):

```typescript
// ─── Outstanding Drill-Down ──────────────────────────────────────────────────

export interface ListOutstandingDrawTenantsInput { drawId: string; }
export interface ListOutstandingDrawTenantsOutput { data: OutstandingTenantBreakdownRow[]; }

export interface ListOutstandingTenantPlayersInput { drawId: string; tenantId: string; }
export interface ListOutstandingTenantPlayersOutput { data: OutstandingPlayerBreakdownRow[]; }

export interface ListOutstandingPlayerEntriesInput { drawId: string; tenantId: string; accountId: string; }
export interface ListOutstandingPlayerEntriesOutput { data: TicketEntryEntity[]; }
```

Import thêm `OutstandingTenantBreakdownRow`, `OutstandingPlayerBreakdownRow` từ `../../infras/repos`.

### 1D. Use Cases mới — `use-cases/reports/`

| File | Class | Repo method |
|---|---|---|
| `list-outstanding-draw-tenants.ts` | `ListOutstandingDrawTenantsUseCase` | `repo.aggregateTenantsByDraw(drawId)` |
| `list-outstanding-tenant-players.ts` | `ListOutstandingTenantPlayersUseCase` | `repo.aggregatePlayersByDrawAndTenant(drawId, tenantId)` |
| `list-outstanding-player-entries.ts` | `ListOutstandingPlayerEntriesUseCase` | `repo.findEntriesByDrawTenantPlayer(drawId, tenantId, accountId)` |

Mỗi use case:
- `private readonly repo = new EntryOutstandingRepository()`
- KHÔNG MongoDB query trực tiếp
- Export từ `use-cases/reports/index.ts`

### 1E. API Routes mới

**Base:** `apps/backoffice/src/app/api/max3d/reports/outstanding/`

```
draws/[drawId]/
  tenants/route.ts                              → ListOutstandingDrawTenantsUseCase
  tenants/[tenantId]/
    players/route.ts                            → ListOutstandingTenantPlayersUseCase
    players/[accountId]/
      entries/route.ts                          → ListOutstandingPlayerEntriesUseCase
```

Mỗi route:
- `withApi().auth({ roles: [CompanyRole.Staff] })`
- Use case singleton ở module level
- params từ dynamic route segment (Next.js)

---

## 2. FRONTEND — Query Keys & Hooks

### 2A. Query Keys — `lib/query-keys/max3d.ts`

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

**Hook hiện có** `useMax3DOutstanding` đổi key từ `outstanding` → `outstandingDraws`.

### 2B. Query Hooks — `use-report-queries.ts`

Sửa hook hiện có + thêm 3 hooks mới:

```typescript
// Sửa hook hiện có: đổi queryKey
export function useMax3DOutstanding() {
  return useQuery({
    queryKey: max3dKeys.outstandingDraws,  // ← đổi từ .outstanding
    ...
  });
}

// 3 hooks mới
export function useMax3DOutstandingDrawTenants(drawId: string | null)
export function useMax3DOutstandingTenantPlayers(drawId: string, tenantId: string | null)
export function useMax3DOutstandingPlayerEntries(drawId: string, tenantId: string, accountId: string | null)
```

Import types mới từ `@megawin/game-max3d-application/use-cases/reports`:
- `ListOutstandingDrawTenantsOutput`
- `ListOutstandingTenantPlayersOutput`
- `ListOutstandingPlayerEntriesOutput`

---

## 3. FRONTEND — Component Files

### 3A. Cấu trúc thư mục

```
apps/backoffice/src/app/(main)/games/max3d/
├── outstanding/
│   └── page.tsx                                   ← Refactor: Suspense + <OutstandingContent />
├── _shared/
│   └── outstanding/
│       ├── use-outstanding-filters.ts             ← nuqs URL state + DrillLevel + navigateTo*
│       ├── outstanding-content.tsx                ← Orchestrator (render đúng level)
│       ├── outstanding-breadcrumb.tsx             ← Breadcrumb navigation
│       ├── outstanding-draw-list.tsx              ← Level 1 (refactor từ page.tsx hiện tại)
│       ├── outstanding-tenant-breakdown.tsx       ← Level 2
│       ├── outstanding-player-breakdown.tsx       ← Level 3
│       ├── outstanding-entry-list.tsx             ← Level 4 + Max3dEntryDetailDialog
│       └── index.ts                               ← Barrel export
└── financial-reports/_lib/
    ├── use-report-queries.ts                      ← +3 hooks mới, sửa 1 hook
    └── sections/
        └── entry-list.tsx                         ← Max3dEntryDetailDialog (reuse)
```

### 3B. `use-outstanding-filters.ts`

```typescript
export type OutstandingDrillLevel = "list" | "draw-tenants" | "players" | "entries";

export function useMax3DOutstandingFilters() {
  const [drawId, setDrawId] = useQueryState("draw", parseAsString);
  const [tenantId, setTenantId] = useQueryState("tenant", parseAsString);
  const [playerId, setPlayerId] = useQueryState("player", parseAsString);
  const [playerName, setPlayerName] = useQueryState("playerName", parseAsString);

  const level: OutstandingDrillLevel = playerId
    ? "entries"
    : tenantId && drawId ? "players"
    : drawId ? "draw-tenants"
    : "list";

  const navigateToList    // → clear draw, tenant, player, playerName
  const navigateToDraw    // → set draw, clear tenant, player, playerName
  const navigateToTenant  // → set tenant, clear player, playerName
  const navigateToPlayer(id: string, username?: string) // → set player + playerName
}
```

### 3C. `outstanding-breadcrumb.tsx`

Pattern: `[Outstanding] > [2026-03-20.001] > [VL-HCM] > username_display`
- `Button variant="ghost" size="sm"` cho segments trước current
- `span bg-secondary` cho current level
- `ChevronRight size-3 text-muted-foreground` giữa segments
- **Level 4**: hiển thị `playerName ?? playerId`

### 3D. `outstanding-draw-list.tsx` — Level 1

Tự gọi `useMax3DOutstandingFilters()` để lấy `navigateToDraw`.

- `<TableRow onClick={() => navigateToDraw(drawId)} className="cursor-pointer hover:bg-muted/50">`
- KHÔNG icon chevron cuối row
- Cột drawId: `<Link href="/games/max3d/operations?draw=xxx">` với `e.stopPropagation()` — click drawId đi Operations, click row drill vào tenants
- Icon `ExternalLink` hover-only bên cạnh drawId text

Cột (8 cột, pl-5 / pr-5 cho đầu cuối):

| # | Cột | Align | Format |
|---|---|---|---|
| 1 | Ngày tài chính | left, pl-5 | text `tabular-nums` |
| 2 | Kỳ quay | left | `<Link>` bao toàn bộ + icon ExternalLink hover |
| 3 | Người chơi | right | `formatNumber tabular-nums` |
| 4 | Đại lý | right | `formatNumber tabular-nums` |
| 5 | Lượt cược | right | `formatNumber tabular-nums` |
| 6 | Cặp số | right | `formatNumber tabular-nums` |
| 7 | Ước tính HH | right | `formatNumber tabular-nums` |
| 8 | Tổng tiền cược | right, pr-5 | `formatNumber tabular-nums font-medium` |

Footer TỔNG CỘNG: colSpan=4 cho cột text, sum cột số, `font-semibold`.

**Label đặc biệt Max 3D**: Cột 6 dùng "Cặp số" thay "Dòng cược" (theo Power 6/55 plan §6).

### 3E. `outstanding-tenant-breakdown.tsx` — Level 2

Data: `useMax3DOutstandingDrawTenants(drawId)`
Click row: `navigateToTenant(tenantId)` — KHÔNG icon chevron

| # | Cột | Align | Format |
|---|---|---|---|
| 1 | Đại lý | left, pl-5 | text `font-medium` |
| 2 | Lượt cược | right | `formatNumber tabular-nums` |
| 3 | Người chơi | right | `formatNumber tabular-nums` |
| 4 | Cặp số | right | `formatNumber tabular-nums` |
| 5 | Ước tính HH | right | `formatNumber tabular-nums` |
| 6 | Tổng tiền cược | right, pr-5 | `formatNumber tabular-nums font-medium` |

Card: icon `Building2`, title `"Đại lý — Kỳ {drawId}"`, description `"{n} đại lý · Click để xem players"`
Footer TỔNG CỘNG: colSpan=1, sum cột số.

### 3F. `outstanding-player-breakdown.tsx` — Level 3

Data: `useMax3DOutstandingTenantPlayers(drawId, tenantId)`
Click row: `navigateToPlayer(accountId, username)` — KHÔNG icon chevron
KHÔNG cột Payout/Lãi lỗ (outstanding = chưa settle)

| # | Cột | Align | Format |
|---|---|---|---|
| 1 | Người chơi | left, pl-5 | text `font-medium` (username fallback accountId) |
| 2 | Lượt cược | right | `formatNumber tabular-nums` |
| 3 | Cặp số | right | `formatNumber tabular-nums` |
| 4 | Ước tính HH | right | `formatNumber tabular-nums` |
| 5 | Tổng tiền cược | right, pr-5 | `formatNumber tabular-nums font-medium` |

Card: icon `Users`, title `"Players — Kỳ {drawId} / {tenantId}"`.
Footer TỔNG CỘNG: colSpan=1, sum cột số.

### 3G. `outstanding-entry-list.tsx` — Level 4

Data: `useMax3DOutstandingPlayerEntries(drawId, tenantId, accountId)`
Click row: mở `Max3dEntryDetailDialog` (import từ `financial-reports/_lib/sections/entry-list.tsx`)
Dialog ở outstanding mode: `status === "scheduled"` → ẩn result/payout, hiện "Đang chờ quay số"

| # | Cột | Align | Format |
|---|---|---|---|
| 1 | Mã vé | left, pl-5 | text `font-mono` |
| 2 | Cặp số | right | `formatNumber tabular-nums` |
| 3 | Ước tính HH | right | `formatNumber tabular-nums` |
| 4 | Tiền cược | right | `formatNumber tabular-nums font-medium` |
| 5 | Thời gian đặt | left, pr-5 | `displayVNDateTime` `tabular-nums` |

Card: icon `Ticket`, title `"Entries — {playerName ?? accountId}"`, description `"{n} entries · Kỳ {drawId} · {tenantId}"`.
Footer TỔNG CỘNG: sum lineCount, commission, amount.

### 3H. `outstanding-content.tsx` — Orchestrator

```
- useMax3DOutstandingFilters() → drawId, tenantId, playerId, playerName, level
- useMax3DOutstanding() → data, isLoading, error, isFetching, refetch
- PageHeader:
  - Bên trái: icon gradient (GAME_COLORS[GameProduct.Max3d]) + title "Max 3D — Outstanding" + subtitle "Entries chưa settle"
  - Bên phải: <LiveDot> — animated ping dot (xanh / amber khi fetching)
    - Click → refetch()
    - Tooltip: "Tự động refresh mỗi 60s · Nhấn để lấy dữ liệu mới nhất"
- KpiStrip: chỉ level=list (5 cards: Kỳ đang hoạt động, Lượt cược, Cặp số, Ước tính HH, Tổng cược)
- Breadcrumb: level≠list, nhận playerName
- Level components: KHÔNG truyền callbacks qua props — mỗi child tự gọi hook
```

### 3I. `page.tsx` — Minimal wrapper

```typescript
"use client";
export default function Max3DOutstandingPage() {
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

Font-size toàn bộ bảng: `text-sm`. KHÔNG `text-muted-foreground` cho cột Ước tính HH và Thời gian đặt.

---

## 5. Entry Detail Dialog — Max 3D Specifics

Reuse `Max3dEntryDetailDialog` từ `financial-reports/_lib/sections/entry-list.tsx`.

Dialog đã hỗ trợ `isScheduled` mode:
- Ẩn kết quả / trả thưởng / giải trúng
- Hiển thị "Kết quả có sau kỳ quay"
- Chỉ hiển thị: metadata + financial KPI (2 ô: Tiền cược + Hoa hồng) + bộ số đã chọn

**Max 3D dialog đặc biệt:**
- 2 play modes: `basic` (1 triplet) vs `plus` (2 triplets)
- Board display: triplet "096" hoặc cặp "096 + 389"
- PlayType badge: `straight` | `combo3` | `combo6` (basic), `straight` (plus)
- betCount badge nếu > 1
- Max 4 boards (A-D)

---

## 6. Thứ tự implement

| # | Task | Files |
|---|---|---|
| 1 | Types mới | `repos/types/entry-outstanding.types.ts` + cập nhật `types/index.ts` |
| 2 | Repo mới | `repos/entry-outstanding-repo.ts` + cập nhật `repos/index.ts` |
| 3 | Use case types | `use-cases/reports/types.ts` |
| 4 | Use cases (3) | 3 files mới + cập nhật `index.ts` |
| 5 | API routes (3) | 3 route files mới |
| 6 | Query keys | `lib/query-keys/max3d.ts` |
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
| 17 | Type check | `pnpm --filter @megawin/game-max3d-application check-types` |

---

## 7. Checklist rules

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
- [ ] Mỗi level component **tự gọi** `useMax3DOutstandingFilters()` — KHÔNG nhận callbacks qua props
- [ ] `<LiveDot>` thay text "Cập nhật lúc..." + icon RefreshCw rời — click dot → refetch, Tooltip giải thích
- [ ] `formatNumber` cho tiền trong bảng
- [ ] `text-sm tabular-nums` đồng nhất
- [ ] KPI card pattern horizontal icon
- [ ] Footer TỔNG CỘNG `font-semibold`
- [ ] Query hooks tách file, dùng centralized keys
- [ ] KHÔNG `text-muted-foreground` cho cột Ước tính HH và Thời gian đặt
- [ ] Label "Cặp số" thay "Dòng cược" cho Max 3D
