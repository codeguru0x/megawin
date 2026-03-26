# Lotto 5/35 Outstanding Drill-Down — Implementation Plan
# Copy pattern từ Power 6/55, adapt cho Lotto 5/35
# Cập nhật: 2026-03-26

## 0. Tổng quan scope

Thêm 4-level drill-down vào outstanding page Lotto 5/35, cùng pattern với Power 6/55.
Lotto 5/35 hiện tại chỉ có Level 1 (flat list, 385 dòng monolithic) — cần refactor thành orchestrator + 4 levels.

```
Level 1: Draw List        → /games/lotto535/outstanding               (refactor page hiện tại)
Level 2: Tenant Breakdown → /games/lotto535/outstanding?draw=xxx
Level 3: Player Breakdown → /games/lotto535/outstanding?draw=xxx&tenant=T001
Level 4: Entry List       → /games/lotto535/outstanding?draw=xxx&tenant=T001&player=ACC123
         + Entry Detail   → Dialog (reuse Lotto535EntryDetailDialog outstanding mode)
```

### Khác biệt Lotto 5/35 vs Power 6/55

| Đặc điểm | Lotto 5/35 | Power 6/55 |
|---|---|---|
| lineCount | CÓ | CÓ |
| Board fields | `mainNumbers` + `specialNumbers` | `mainNumbers` (only) |
| Bonus number | `winningSpecial` (1 số ĐB 01–12) | `bonusNumber` (1 số từ pool còn lại) |
| Play types | `standard`, `mainCover4`, `mainCover`, `specialCover` | `standard`, `bao5`–`bao18` |
| Collection | `lotto535_ticket_entries` | `power655_ticket_entries` |
| Max boards | 5 (A-E) | 5 (A-E) |
| Prize tiers | `jackpot`, `tier1`–`tier5`, `consolation` (7 hạng) | `jackpot1`, `jackpot2`, `tier1`–`tier3` (5 hạng) |
| Split Cycle | CÓ (khi JP >= 12 tỷ, kỳ 21h) | KHÔNG |
| GameProduct | `Lotto535` | `Power655` |
| Operations link | `/games/lotto535/operations` | `/games/power655/operations` |
| Entity imports | `@megawin/game-lotto535/entities` | `@megawin/game-power655/entities` |
| Application imports | `@megawin/game-lotto535-application/*` | `@megawin/game-power655-application/*` |

Cấu trúc entry entity **đồng dạng**: cả hai đều có `lineCount`, `amount`, `tenant.commissionAmount`, `accountId`, `username`, `drawId`, `tenantId`, `status`.

---

## 1. BACKEND — Layers & Files

### 1A. Types mới — `repos/types/entry-outstanding.types.ts`

**File:** `packages/game-lotto535-application/src/infras/repos/types/entry-outstanding.types.ts`

```typescript
/** Aggregate tenant cho 1 draw outstanding. Drill cấp 2. */
export interface OutstandingTenantBreakdownRow {
  tenantId: string;
  entryCount: number;
  playerCount: number;
  lineCount: number;
  totalStake: number;        // VND
  estimatedCommission: number; // VND
}

/** Aggregate player cho 1 draw × 1 tenant outstanding. Drill cấp 3. */
export interface OutstandingPlayerBreakdownRow {
  accountId: string;
  username: string;
  entryCount: number;
  lineCount: number;
  totalStake: number;        // VND
  commissionAmount: number;  // VND
}
```

Re-export:
- `repos/types/index.ts` — thêm export 2 interfaces
- `repos/index.ts` — đã export `type * from "./types"` → tự động có

### 1B. Repo mới — `entry-outstanding-repo.ts`

**File:** `packages/game-lotto535-application/src/infras/repos/entry-outstanding-repo.ts`

Class `EntryOutstandingRepository extends BaseRepo<any>` — 3 methods:

```
aggregateTenantsByDraw(drawId)
  → Filter: { drawId, status: "scheduled" }
  → Double-$group: (accountId, tenantId) → tenantId
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

Copy 1:1 từ Power 6/55, thay:
- `Power655Collections.TicketEntries` → `Lotto535Collections.TicketEntries`
- Import `@megawin/game-lotto535/entities` thay `@megawin/game-power655/entities`

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

Import thêm `OutstandingTenantBreakdownRow`, `OutstandingPlayerBreakdownRow` từ `../../infras/repos`.

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

**Base:** `apps/backoffice/src/app/api/lotto535/reports/outstanding/`

```
draws/
  [drawId]/
    tenants/route.ts                              → ListOutstandingDrawTenantsUseCase
    [tenantId]/
      players/route.ts                            → ListOutstandingTenantPlayersUseCase
      [accountId]/
        entries/route.ts                          → ListOutstandingPlayerEntriesUseCase
```

Mỗi route:
- `withApi().auth({ roles: [CompanyRole.Staff] })`
- Use case singleton ở module level
- Pattern: `withApi().auth(...).handler(async ({ params }) => useCase.run(...))`

---

## 2. FRONTEND — Query Keys & Hooks

### 2A. Query Keys — `lib/query-keys/lotto535.ts`

Thêm outstanding drill-down keys (giữ nguyên `outstanding` hiện tại làm prefix):

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

Hook `useLotto535Outstanding` đổi key từ `outstanding` → `outstandingDraws`.

### 2B. Query Hooks — `use-report-queries.ts`

Sửa hook hiện có + thêm 3 hooks mới:

```typescript
// Sửa: đổi queryKey
export function useLotto535Outstanding() {
  return useQuery({
    queryKey: lotto535Keys.outstandingDraws,  // ← đổi từ .outstanding
    ...
  });
}

// 3 hooks mới
export function useLotto535OutstandingDrawTenants(drawId: string | null)
export function useLotto535OutstandingTenantPlayers(drawId: string, tenantId: string | null)
export function useLotto535OutstandingPlayerEntries(drawId: string, tenantId: string, accountId: string | null)
```

---

## 3. FRONTEND — Component Files

### 3A. Cấu trúc thư mục

```
apps/backoffice/src/app/(main)/games/lotto535/
├── outstanding/
│   └── page.tsx                                   ← Refactor: Suspense + <OutstandingContent />
├── _shared/
│   └── outstanding/
│       ├── use-outstanding-filters.ts             ← nuqs URL state + DrillLevel
│       ├── outstanding-content.tsx                ← Orchestrator
│       ├── outstanding-breadcrumb.tsx             ← Breadcrumb navigation
│       ├── outstanding-draw-list.tsx              ← Level 1
│       ├── outstanding-tenant-breakdown.tsx       ← Level 2
│       ├── outstanding-player-breakdown.tsx       ← Level 3
│       ├── outstanding-entry-list.tsx             ← Level 4 + EntryDetailDialog
│       └── index.ts                               ← Barrel export
└── financial-reports/_lib/
    ├── use-report-queries.ts                      ← +3 hooks, sửa 1 hook
    └── sections/
        └── entry-list.tsx                         ← Lotto535EntryDetailDialog (reuse)
```

### 3B. `use-outstanding-filters.ts`

```typescript
export type OutstandingDrillLevel = "list" | "draw-tenants" | "players" | "entries";

export function useLotto535OutstandingFilters() {
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
  const navigateToPlayer(id: string, username?: string)
}
```

Copy 1:1 từ Power 6/55, thay function name prefix.

### 3C. `outstanding-breadcrumb.tsx`

Pattern: `[Outstanding] > [2026-03-20.001] > [VL-HCM] > username_display`
Copy 1:1 từ Power 6/55, thay `usePower655OutstandingFilters` → `useLotto535OutstandingFilters`.

### 3D. `outstanding-draw-list.tsx` — Level 1

Cột (8 cột):

| # | Cột | Align | Format |
|---|---|---|---|
| 1 | Ngày tài chính | left, pl-5 | text `tabular-nums` |
| 2 | Kỳ quay | left | `<Link>` → `/games/lotto535/operations?draw=xxx` |
| 3 | Người chơi | right | `formatNumber tabular-nums` |
| 4 | Đại lý | right | `formatNumber tabular-nums` |
| 5 | Lượt cược | right | `formatNumber tabular-nums` |
| 6 | Dòng cược | right | `formatNumber tabular-nums` |
| 7 | Ước tính HH | right | `formatNumber tabular-nums` |
| 8 | Tổng tiền cược | right, pr-5 | `formatNumber tabular-nums font-medium` |

Click row: `navigateToDraw(drawId)` — KHÔNG icon chevron.
Cột drawId: `<Link>` bao toàn bộ cell + `e.stopPropagation()` — click drawId → Operations, click row → drill.
Icon `ExternalLink` hover-only bên cạnh drawId text.
Footer TỔNG CỘNG: colSpan=4, sum cột số, `font-semibold`.
Bỏ `text-muted-foreground` khỏi cột "Ước tính HH".

### 3E. `outstanding-tenant-breakdown.tsx` — Level 2

Data: `useLotto535OutstandingDrawTenants(drawId)`
Click row: `navigateToTenant(tenantId)` — KHÔNG icon chevron.

| # | Cột | Align | Format |
|---|---|---|---|
| 1 | Đại lý | left, pl-5 | text `font-medium` |
| 2 | Lượt cược | right | `formatNumber tabular-nums` |
| 3 | Người chơi | right | `formatNumber tabular-nums` |
| 4 | Dòng cược | right | `formatNumber tabular-nums` |
| 5 | Ước tính HH | right | `formatNumber tabular-nums` |
| 6 | Tổng tiền cược | right, pr-5 | `formatNumber tabular-nums font-medium` |

Card: icon `Building2`, title `"Đại lý — Kỳ {drawId}"`, description `"{n} đại lý · Click để xem players"`.
Footer TỔNG CỘNG: colSpan=1, sum cột số.

### 3F. `outstanding-player-breakdown.tsx` — Level 3

Data: `useLotto535OutstandingTenantPlayers(drawId, tenantId)`
Click row: `navigateToPlayer(accountId, username)` — KHÔNG icon chevron.
KHÔNG cột Payout/Lãi lỗ (outstanding = chưa settle).

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

Data: `useLotto535OutstandingPlayerEntries(drawId, tenantId, accountId)`
Click row: mở `Lotto535EntryDetailDialog` (reuse từ financial-reports).
Dialog outstanding mode: `status === "scheduled"` → ẩn result/payout, hiện "Đang chờ quay số".

| # | Cột | Align | Format |
|---|---|---|---|
| 1 | Mã vé | left, pl-5 | text `font-mono` |
| 2 | Dòng cược | right | `formatNumber tabular-nums` |
| 3 | Ước tính HH | right | `formatNumber tabular-nums` |
| 4 | Tiền cược | right | `formatNumber tabular-nums font-medium` |
| 5 | Thời gian đặt | left, pr-5 | `displayVNDateTime` `tabular-nums` |

Card: icon `Ticket`, title `"Entries — {playerName ?? accountId}"`, description `"{n} entries · Kỳ {drawId} · {tenantId}"`.
Footer TỔNG CỘNG: sum lineCount, commission, amount.

### 3H. `outstanding-content.tsx` — Orchestrator

```
- useLotto535OutstandingFilters() → drawId, tenantId, playerId, playerName, level
- useLotto535Outstanding() → data, isLoading, error, isFetching, refetch
- PageHeader:
  - Icon gradient: GAME_COLORS[GameProduct.Lotto535]
  - Title: "Lotto 5/35 — Outstanding"
  - <LiveDot> (animated ping dot)
    - Click → refetch()
    - Tooltip: "Tự động refresh mỗi 60s · Nhấn để lấy dữ liệu mới nhất"
    - KHÔNG text "Cập nhật lúc..." hay icon RefreshCw button rời
- KpiStrip: chỉ level=list (5 cards: kỳ, entries, lines, HH, cược)
- Breadcrumb: level≠list
- Level components: KHÔNG truyền callbacks qua props — mỗi child tự gọi hook
```

### 3I. `page.tsx` — Refactor

```typescript
"use client";
export default function Lotto535OutstandingPage() {
  return (
    <Suspense fallback={<OutstandingPageSkeleton />}>
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
| Bảng mọi cột tiền | `formatNumber` | `3,270,000` |
| Bảng mọi cột count | `formatNumber` | `327` |
| Footer TỔNG CỘNG tiền | `formatNumber` + `font-semibold` | `3,270,000` |
| Thời gian | `displayVNDateTime` | `26/03/2026 14:28` |

KHÔNG `text-muted-foreground` cho cột Ước tính HH và Thời gian đặt.

---

## 5. Thứ tự implement

| # | Task | Files |
|---|---|---|
| 1 | Types mới | `repos/types/entry-outstanding.types.ts` + cập nhật `types/index.ts` |
| 2 | Repo mới | `repos/entry-outstanding-repo.ts` + cập nhật `repos/index.ts` |
| 3 | Use case types | `use-cases/reports/types.ts` |
| 4 | Use cases (3) | 3 files mới + cập nhật `index.ts` |
| 5 | API routes (3) | 3 route files mới |
| 6 | Query keys | `lib/query-keys/lotto535.ts` |
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
| 17 | Type check | `pnpm --filter @megawin/game-lotto535-application check-types` |

---

## 6. Entry Detail Dialog — Lotto 5/35 Specs

Reuse `Lotto535EntryDetailDialog` từ `financial-reports/_lib/sections/entry-list.tsx`.

**Board structure:** Mỗi board chọn **5 số chính** (01–35) + **1–N số đặc biệt** (01–12, tùy playType).
**Số quay:** 5 main + 1 special (`winningMain: string[]`, `winningSpecial: string`).
**Highlight logic:**
- Main trùng `winningMain` → `variant="matched"` (xanh primary)
- Special trùng `winningSpecial` → `variant="bonus"` (amber)

**Board fields:** `board.mainNumbers: string[]`, `board.specialNumbers: string[]`, `board.playType`, `board.expandedLines`, `board.betCount`

**Play types:** `standard` (1M×1S), `mainCover4` (31 lines), `mainCover` (C(N,5) lines), `specialCover` (K lines)

**Outstanding mode:** `status === "scheduled"` → ẩn result/payout sections, hiện "Kết quả có sau kỳ quay".

**Board display (2 nhóm ngăn cách bằng `|`):**
```
Board A  [03] [11] [19] [25] [31]  |  🟡07
Board B  [Bao 6]  [03] [11] [19] [25] [31] [35]  |  🟡07  (C(6,5) = 6 lines)
Board C  [specialCover]  [03] [11] [19] [25] [31]  |  🟡02 🟡07 🟡12  (3 ĐB = 3 lines)
```

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
- [ ] `playerName` lưu username vào URL khi `navigateToPlayer(id, username)`
- [ ] Breadcrumb cho view >= 2 levels (§7.2) — Level 4 hiển thị `playerName ?? playerId`
- [ ] Click row drill — KHÔNG icon chevron cuối row (§7.3)
- [ ] Cột drawId: `<Link>` bao toàn bộ cell + `e.stopPropagation()`
- [ ] Mỗi level component **tự gọi** `useLotto535OutstandingFilters()`
- [ ] `<LiveDot>` thay text "Cập nhật lúc..." + icon RefreshCw
- [ ] `formatNumber` cho tiền trong bảng
- [ ] `text-sm tabular-nums` đồng nhất
- [ ] Footer TỔNG CỘNG `font-semibold`
- [ ] KHÔNG `text-muted-foreground` cho cột Ước tính HH và Thời gian đặt
