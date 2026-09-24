# Tenant Dispatch UI — Plan

> **Status**: Proposed. Backend đã đủ: `ListStuckOrdersUseCase`,
> `ListOrdersBySourceUseCase`, `GetBatchProgressUseCase`, `CancelOrderUseCase`
> trong `@megawin/tenant-dispatch/use-cases/admin`. API routes đã có tại
> `/api/tenant-dispatch/*`. Plan này tập trung vào **BO frontend** — xây trang
> `Nhật ký Dispatch` nằm kế bên `Nhật ký API` trong menu "Giao dịch",
> học layout từ `reports/transactions/api-logs` và tuân thủ `frontend-dev.mdc`
> + `financial-report-ui.mdc`.

## 0. Mục tiêu

1. **Observability**: staff thấy toàn bộ dispatch orders trong outbox
   (`tenant_dispatch_orders`) để đối soát tenant — không cần mở DB.
2. **Triage nhanh**: 1 KPI strip + filter theo tenant/status/sourceKind/retry →
   tập trung vào orders bất thường (stuck, cancelled, high retry).
3. **Drill-down**: click order → drawer hiển thị đầy đủ payload, lỗi, timeline
   retry, metadata. Batch click → mở batch progress.
4. **Hành động tối thiểu**: `Cancel order` (đã có use case). Không copy id,
   không force retry — UI thuần đọc + huỷ khi cần.
5. **Tuân thủ rules**: `frontend-dev.mdc` (PageHeader gradient, KPI horizontal,
   Card spacing `gap-0 py-0`, table `pl-5`/`pr-5`, nuqs, react-query keys tập
   trung), `financial-report-ui.mdc` cho format số (bảng dùng `formatNumber`,
   KPI dùng `formatVNDCompact`).

## 1. Scope

**Trong scope:**

- Route `/reports/transactions/dispatch` — danh sách dispatch orders (kế
  `/reports/transactions/api-logs`). Bỏ cờ `comingSoon` trong sidebar.
- KPI strip 4 cards: Tổng orders · Đang chờ / Retry · Đã gửi · Đã huỷ +
  1 sub metric "stuck ≥ N".
- Filter bar: `tenantId` · `status` · `sourceKind` · `retry mode`
  (fresh / retrying / stuck) · `gameId` · date range `createdAt`.
- DataTable sticky header: thời gian tạo · status · loại nguồn · tenant · game
  · amount · retry · lỗi gần nhất · batch · actions.
- Drawer chi tiết (reuse pattern `TxLogDetailDrawer`): identity (tx,
  batchKey, sourceId), payload-like summary, error box, timeline attempt.
- Batch progress inline card khi click `batchKey` trong drawer hoặc chuyển sang
  sub page `/reports/transactions/dispatch/batches/[batchKey]`.
- Cancel order dialog (react-hook-form + Zod) có confirm checkbox.
- Polling 30s khi filter `status=Pending` hoặc `retry mode=stuck`; range mode
  dùng staleTime 15s, no auto-refetch.

**Ngoài scope:**

- Force retry now (không có backend).
- Bulk cancel.
- Edit amount / metadata (không có use case).
- Real-time subscription (SSE/WebSocket) — polling đủ.
- Cross-app trace giữa dispatch order ↔ tx log (Giai đoạn 2, cần backend join
  theo `tx`).

## 2. Cấu trúc thư mục

```
apps/backoffice/src/app/(main)/reports/transactions/dispatch/
├── page.tsx                                   ← Suspense wrapper (theo page.tsx của api-logs)
├── _components/
│   ├── dispatch-content.tsx                   ← Orchestrator: filter + kpi + table + drawer
│   ├── dispatch-kpi-strip.tsx                 ← 4 KPI cards horizontal
│   ├── dispatch-filter-bar.tsx                ← tenant/status/sourceKind/retryMode/game/date
│   ├── dispatch-table.tsx                     ← sticky header, pl-5/pr-5
│   ├── dispatch-detail-drawer.tsx             ← Sheet: identity/error/payload-like
│   ├── dispatch-cancel-dialog.tsx             ← RHF + Zod confirm
│   └── dispatch-retry-mode-select.tsx         ← fresh / retrying / stuck
├── _lib/
│   ├── use-filters.ts                         ← nuqs: tenant/status/sourceKind/retryMode/game/from/to/tx/detail
│   ├── use-queries.ts                         ← useDispatchList/Summary/Detail/BatchProgress + useCancelOrder
│   └── types.ts                               ← DispatchListRow, DispatchSummary, RetryMode
└── batches/
    └── [batchKey]/
        ├── page.tsx                           ← BatchProgress detail (reuse table, filter pre-applied)
        └── _components/
            └── batch-progress-card.tsx        ← KPI cố định cho 1 batch

apps/backoffice/src/app/api/tenant-dispatch/
├── orders/route.ts                ← (đã có — list-by-source) ← KHÔNG dùng cho list tổng
├── batch-progress/route.ts        ← (đã có)
├── stuck-orders/route.ts          ← (đã có)
├── cancel-order/route.ts          ← (đã có)
├── list/route.ts                  ← **MỚI** — list tổng có filter + cursor pagination + summary
├── summary/route.ts               ← **MỚI** — KPI counts theo range
└── [tx]/route.ts                  ← **MỚI** — get one by tx (detail drawer)

apps/backoffice/src/lib/query-keys/
└── tenant-dispatch.ts             ← **MỚI**: tenantDispatchKeys
```

**Ghi chú**:
- Endpoint `GET /api/tenant-dispatch/list` cần use case mới ở
  `@megawin/tenant-dispatch/use-cases/admin/list-dispatch-orders.ts` (xem §4).
- `GET /api/tenant-dispatch/summary` cần use case mới
  `get-dispatch-summary.ts` — count theo status + stuck threshold.
- `GET /api/tenant-dispatch/[tx]` — dùng `findByTx` có sẵn trong repo
  → bọc use case `GetOrderByTxUseCase`.

## 3. Sidebar navigation

Cập nhật `apps/backoffice/src/navigation/sidebar/sidebar-items.ts` — NavGroup
`id: 3 "Giao dịch"`. **Chỉ giữ 2 mục**: Nhật ký Dispatch + Nhật ký API.
Các mục `history`, `place-bet-refunds` → **xoá** (chưa có endpoint).

```typescript
{
  title: "Giao dịch",
  items: [
    {
      title: "Nhật ký Dispatch",
      url: "/reports/transactions/dispatch",
      icon: Send,
    },
    {
      title: "Nhật ký API",
      url: "/reports/transactions/api-logs",
      icon: FileSearch,
    },
  ],
},
```

Thứ tự: Dispatch trước API logs (flow: outbox → gateway → log).

Auth: **KHÔNG** cần `CompanyRole.Admin` — tất cả `CompanyRole.Staff` trở lên
đều xem được. Áp dụng cho cả menu item và các API routes
(`list`, `summary`, `[tx]`, `cancel-order`, `batch-progress`, `stuck-orders`,
`orders`). Các route cũ đang gắn `Admin` cần hạ xuống `Staff`.

## 4. Backend — API Routes & Use Cases cần bổ sung

Tuân thủ `frontend-dev.mdc §5` (withApi + Zod body/query + Use Case).

### 4.1 Use cases mới trong `packages/tenant-dispatch/src/use-cases/admin/`

```typescript
// list-dispatch-orders.ts
export interface ListDispatchOrdersInput {
  tenantId?: string;
  gameId?: string;
  status?: DispatchOrderStatus;
  sourceKind?: DispatchSourceKind;
  /** "fresh" → retryCount $exists false; "retrying" → >=1; "stuck" → >= threshold. */
  retryMode?: "fresh" | "retrying" | "stuck";
  /** Ngưỡng stuck (override default `RETRY_ALERT_THRESHOLD`). */
  stuckMinRetry?: number;
  /** createdAt >= from. */
  from?: Date;
  /** createdAt <= to. */
  to?: Date;
  /** Cursor: `"{createdAt.iso}|{id}"` — giống tx-logs pagination. */
  cursor?: { createdAt: string; id: string } | null;
  limit?: number;
}

export interface ListDispatchOrdersOutput {
  data: TenantDispatchOrderEntity[];
  nextCursor: { createdAt: string; id: string } | null;
}
```

```typescript
// get-dispatch-summary.ts
export interface GetDispatchSummaryInput {
  tenantId?: string;
  gameId?: string;
  from?: Date;
  to?: Date;
  stuckMinRetry?: number;
}

export interface GetDispatchSummaryOutput {
  total: number;
  pending: number;
  dispatched: number;
  cancelled: number;
  /** retryCount >= threshold AND status = Pending. */
  stuck: number;
  /** retryCount >= 1 AND status = Pending (retrying, chưa stuck). */
  retrying: number;
  /** Tổng amount (VND) các orders trong range. */
  totalAmount: number;
  /** Tổng amount đã dispatched. */
  dispatchedAmount: number;
}
```

```typescript
// get-order-by-tx.ts
export interface GetOrderByTxInput {
  tx: string;
}
export type GetOrderByTxOutput = TenantDispatchOrderEntity | null;
```

Export qua `use-cases/admin/index.ts`.

### 4.2 Repo methods mới trong `DispatchOrderRepository`

File: `packages/tenant-dispatch/src/infras/repos/dispatch-order-repo.ts`.

**Tuân thủ `mongodb-repository-architecture.mdc`**:

1. File `*-repo.ts` CHỈ chứa class + query logic — không khai báo `interface`/`type`.
2. Types tách vào `repos/types/dispatch-order.types.ts` + barrel
   `repos/types/index.ts` re-export.
3. Aggregate pipeline mỗi stage có comment tiếng Việt giải thích mục đích.
4. Result map sang named interface (không return raw `any`).
5. Use case KHÔNG được viết `$match`/`aggregate(...)` trực tiếp — chỉ gọi repo method.
6. API route KHÔNG khởi tạo repo trực tiếp — chỉ gọi use case.

Types tách vào `repos/types/dispatch-order.types.ts`:

```typescript
// repos/types/dispatch-order.types.ts
export interface ListDispatchOrdersFilter {
  tenantId?: string;
  gameId?: string;
  status?: DispatchOrderStatus;
  sourceKind?: DispatchSourceKind;
  retryMode?: "fresh" | "retrying" | "stuck";
  stuckMinRetry?: number;
  from?: Date;
  to?: Date;
  cursor?: { createdAt: Date; id: ObjectId } | null;
  limit: number;
}

export interface DispatchSummary {
  total: number;
  pending: number;
  dispatched: number;
  cancelled: number;
  retrying: number;
  stuck: number;
  totalAmount: number;
  dispatchedAmount: number;
}
```

Methods:

- `listWithCursor(filter: ListDispatchOrdersFilter): Promise<{ data: TenantDispatchOrderEntity[]; nextCursor: ... | null }>`
  - Build Mongo filter theo spec:
    - `retryMode === "fresh"`: `{ retryCount: { $exists: false } }`
    - `retryMode === "retrying"`: `{ retryCount: { $gte: 1, $lt: stuckMinRetry ?? RETRY_ALERT_THRESHOLD } }`
    - `retryMode === "stuck"`: `{ retryCount: { $gte: stuckMinRetry ?? RETRY_ALERT_THRESHOLD } }`
  - Cursor: sort `{ createdAt: -1, _id: -1 }`, tie-break `_id` (giống
    `TxLogRepository.listWithCursor`).
  - `limit + 1` để detect `nextCursor`.
- `aggregateSummary(filter: Pick<..., "tenantId"|"gameId"|"from"|"to"|"stuckMinRetry">): Promise<DispatchSummary>`
  - `$match` trong range → `$facet` 2 nhánh:
    - `byStatus`: `$group _id: $status` với `sum: 1` + `sum: $amount`.
    - `retryBuckets`: `$match { status: Pending }` → `$group` 2 bucket
      `retrying` (`>= 1 AND < threshold`) và `stuck` (`>= threshold`).
  - Compose output tổng.

### 4.3 API Routes mới

```typescript
// apps/backoffice/src/app/api/tenant-dispatch/list/route.ts
export const GET = withApi()
  .auth({ roles: [CompanyRole.Admin] })
  .query(listDispatchOrdersQuerySchema)   // _lib/schema.ts
  .handler(async ({ query }) => useCase.run(query));
```

```typescript
// apps/backoffice/src/app/api/tenant-dispatch/summary/route.ts
export const GET = withApi()
  .auth({ roles: [CompanyRole.Admin] })
  .query(summaryQuerySchema)
  .handler(async ({ query }) => useCase.run(query));
```

```typescript
// apps/backoffice/src/app/api/tenant-dispatch/[tx]/route.ts
export const GET = withApi()
  .auth({ roles: [CompanyRole.Admin] })
  .handler(async ({ params }) => useCase.run({ tx: params.tx }));
```

Zod schemas append vào `_lib/schema.ts`:

```typescript
export const listDispatchOrdersQuerySchema = z.object({
  tenantId: z.string().min(1).optional(),
  gameId: z.string().min(1).optional(),
  status: z.enum(statusValues).optional(),
  sourceKind: z.enum(sourceKindValues).optional(),
  retryMode: z.enum(["fresh", "retrying", "stuck"]).optional(),
  stuckMinRetry: z.coerce.number().int().min(1).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const summaryQuerySchema = listDispatchOrdersQuerySchema.pick({
  tenantId: true,
  gameId: true,
  from: true,
  to: true,
  stuckMinRetry: true,
});
```

**Use case chuyển `from`/`to` YYYY-MM-DD → Date** qua `getFinancialDate` /
`startOfDayVN`/`endOfDayVN` (tuỳ util đang có), cursor string → object trong
use case (pattern giống `ListTxLogsUseCase`).

## 5. Display Labels — đặt trong package

Tuân thủ `frontend-dev.mdc §2` — **KHÔNG hardcode `Record<string, string>`**
trong component. Tạo labels package-side:

```
packages/tenant-dispatch/src/shared/labels/
├── index.ts                       ← barrel
└── dispatch-labels.ts
```

```typescript
// packages/tenant-dispatch/src/shared/labels/dispatch-labels.ts
import { DispatchOrderStatus, DispatchSourceKind } from "../../entities/enums";

/** Label hiển thị cho status. */
export const DISPATCH_ORDER_STATUS_LABELS: Record<DispatchOrderStatus, string> = {
  [DispatchOrderStatus.Pending]: "Đang chờ",
  [DispatchOrderStatus.Dispatched]: "Đã gửi",
  [DispatchOrderStatus.Cancelled]: "Đã huỷ",
};

/** Badge variant theo status — dùng cho shadcn Badge. */
export const DISPATCH_ORDER_STATUS_VARIANT: Record<
  DispatchOrderStatus,
  "default" | "secondary" | "outline"
> = {
  [DispatchOrderStatus.Pending]: "secondary",
  [DispatchOrderStatus.Dispatched]: "default",
  [DispatchOrderStatus.Cancelled]: "outline",
};

/** Label cho loại nguồn nội bộ. */
export const DISPATCH_SOURCE_KIND_LABELS: Record<DispatchSourceKind, string> = {
  [DispatchSourceKind.Payout]: "Trả thưởng",
  [DispatchSourceKind.Refund]: "Hoàn tiền cược",
  [DispatchSourceKind.Reversal]: "Thu hồi (re-settle)",
};

/** Label cho retry mode (FE-only enum, không trong entity). */
export const RETRY_MODE_LABELS: Record<"fresh" | "retrying" | "stuck", string> = {
  fresh: "Mới",
  retrying: "Đang retry",
  stuck: "Stuck",
};
```

Cập nhật `packages/tenant-dispatch/src/index.ts` export barrel mới và
`package.json` exports thêm `./shared/labels`:

```json
"./shared/labels": {
  "types": "./dist/shared/labels/index.d.ts",
  "import": "./dist/shared/labels/index.js",
  "require": "./dist/shared/labels/index.cjs"
}
```

Reuse `GAME_LABELS` từ `@megawin/game-core/labels` cho cột `gameId`.

## 6. Query Keys

File mới `apps/backoffice/src/lib/query-keys/tenant-dispatch.ts`:

```typescript
import { MODULES } from "./modules";

const MODULE = MODULES.tenantDispatch;

export const tenantDispatchKeys = {
  all: [MODULE] as const,
  list: (filters: {
    tenantId?: string;
    gameId?: string;
    status?: string;
    sourceKind?: string;
    retryMode?: string;
    stuckMinRetry?: number;
    from?: string;
    to?: string;
  }) => [MODULE, "list", filters] as const,
  summary: (filters: {
    tenantId?: string;
    gameId?: string;
    from?: string;
    to?: string;
    stuckMinRetry?: number;
  }) => [MODULE, "summary", filters] as const,
  byTx: (tx: string) => [MODULE, "tx", tx] as const,
  batchProgress: (batchKey: string) => [MODULE, "batch-progress", batchKey] as const,
};
```

Cập nhật `modules.ts` thêm:

```typescript
tenantDispatch: "tenant-dispatch",
```

Cập nhật `query-keys/index.ts` re-export `tenantDispatchKeys`.

## 7. URL State (nuqs)

File `_lib/use-filters.ts` — pattern giống `useTxLogFilters`:

```typescript
"use client";

import { useQueryStates, parseAsString, parseAsStringLiteral, parseAsInteger } from "nuqs";
import { subDays } from "date-fns";
import { todayVN, formatVNDate, TZDate, VN_TIMEZONE } from "@megawin/shared/utils";
import { DispatchOrderStatus, DispatchSourceKind } from "@megawin/tenant-dispatch/entities";

const STATUS_VALUES = Object.values(DispatchOrderStatus) as [DispatchOrderStatus, ...DispatchOrderStatus[]];
const KIND_VALUES = Object.values(DispatchSourceKind) as [DispatchSourceKind, ...DispatchSourceKind[]];
const RETRY_MODES = ["fresh", "retrying", "stuck"] as const;

export function useDispatchFilters() {
  const today = todayVN();
  const sevenDaysAgo = formatVNDate(subDays(new TZDate(new Date(), VN_TIMEZONE), 6));

  const [state, setState] = useQueryStates(
    {
      tx: parseAsString.withDefault(""),
      tenantId: parseAsString,
      gameId: parseAsString,
      status: parseAsStringLiteral(STATUS_VALUES),
      sourceKind: parseAsStringLiteral(KIND_VALUES),
      retryMode: parseAsStringLiteral(RETRY_MODES),
      stuckMinRetry: parseAsInteger,
      from: parseAsString.withDefault(sevenDaysAgo),
      to: parseAsString.withDefault(today),
      detail: parseAsString.withDefault(""),
    },
    { history: "push", shallow: false },
  );

  const isTxMode = !!state.tx;
  // helper reset / setters (tuân thủ tx-log pattern: clear detail khi đổi filter)
  // ...
  return { ...state, isTxMode, setState, /* setters */ };
}
```

URL examples:

```
/reports/transactions/dispatch
  ?from=2026-04-25&to=2026-05-02
  &status=pending
  &retryMode=stuck
  &tenantId=VL-HCM
  &gameId=keno

/reports/transactions/dispatch?tx=018f6e...     ← "by tx" mode — ignore filter khác
/reports/transactions/dispatch/batches/keno:settle:2026-04-18.095:payout
```

Default:
- `from` = today − 6
- `to` = today
- Không set `status`/`sourceKind`/`retryMode`/`stuckMinRetry` = "Tất cả".

## 8. Query hooks — `_lib/use-queries.ts`

Tuân thủ `frontend-dev.mdc §4.2` — tách file query. Shape chuẩn giống
`tx-logs/_lib/use-queries.ts`:

```typescript
export function useDispatchList(filters: DispatchListFilters) {
  return useInfiniteQuery({
    queryKey: tenantDispatchKeys.list({ /* normalized, exclude cursor */ }),
    enabled: filters.tx ? !!filters.tx : !!(filters.from && filters.to),
    initialPageParam: null as { createdAt: string; id: string } | null,
    queryFn: ({ pageParam }) => apiClient.get<ListDispatchOrdersOutput>(
      "/tenant-dispatch/list",
      { params: { ...filters, cursor: serializeCursor(pageParam) } },
    ),
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 15_000,
    // Polling 30s khi user đang xem live (status=Pending hoặc retryMode=stuck)
    refetchInterval: (query) =>
      filters.status === "pending" || filters.retryMode === "stuck" ? 30_000 : false,
  });
}

export function useDispatchSummary(filters: DispatchSummaryFilters) {
  return useQuery({
    queryKey: tenantDispatchKeys.summary(filters),
    enabled: !!(filters.from && filters.to),
    queryFn: () => apiClient.get<GetDispatchSummaryOutput>("/tenant-dispatch/summary", {
      params: filters,
    }),
    staleTime: 15_000,
  });
}

export function useDispatchDetail(tx: string | null) {
  return useQuery({
    queryKey: tx ? tenantDispatchKeys.byTx(tx) : tenantDispatchKeys.all,
    enabled: !!tx,
    queryFn: () => apiClient.get<GetOrderByTxOutput>(
      `/tenant-dispatch/${encodeURIComponent(tx!)}`,
    ),
  });
}

export function useBatchProgress(batchKey: string | null) {
  return useQuery({
    queryKey: batchKey ? tenantDispatchKeys.batchProgress(batchKey) : tenantDispatchKeys.all,
    enabled: !!batchKey,
    queryFn: () => apiClient.get<BatchProgress>("/tenant-dispatch/batch-progress", {
      params: { batchKey },
    }),
    refetchInterval: 30_000,
  });
}

export function useCancelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tx: string) =>
      apiClient.post<CancelOrderOutput>("/tenant-dispatch/cancel-order", { tx }),
    onSuccess: (res, tx) => {
      qc.invalidateQueries({ queryKey: tenantDispatchKeys.all });
      toast.success(
        res.cancelled ? `Đã huỷ order ${tx.slice(0, 8)}…` : "Order đã dispatched trước đó.",
      );
    },
    onError: (err) => {
      const msg = err instanceof ApiClientError ? err.message : "Không thể huỷ order.";
      toast.error(msg);
    },
  });
}
```

Lưu ý `apiClient.post` (KHÔNG `delete`) vì route `cancel-order` backend dùng
`withApi().body(...)` → POST (đã verify ở `cancel-order/route.ts`).

## 9. UI Layout — theo `frontend-dev.mdc §1.3`

### 9.1 `page.tsx` (copy pattern từ `api-logs/page.tsx`)

```tsx
"use client";

import { Suspense } from "react";
import { Send } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SYSTEM_ICON_GRADIENT } from "@/lib/game-colors";
import { DispatchContent } from "./_components/dispatch-content";

function DispatchPageInner() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${SYSTEM_ICON_GRADIENT} shadow-sm`}
          >
            <Send className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Nhật ký Dispatch
            </h1>
            <p className="text-xs text-muted-foreground">
              Outbox lệnh giao dịch tenant — chờ worker dispatch, retry, hoặc cancel.
            </p>
          </div>
        </div>
      </div>

      <DispatchContent />
    </div>
  );
}

export default function DispatchPage() {
  return (
    <Suspense fallback={/* skeleton matching layout — 3 blocks */}>
      <DispatchPageInner />
    </Suspense>
  );
}
```

### 9.2 `DispatchContent` — orchestrator

```tsx
export function DispatchContent() {
  const filters = useDispatchFilters();
  const summary = useDispatchSummary({ /* chỉ từ from/to/tenant/game/stuckMinRetry */ });
  const list = useDispatchList({ /* đầy đủ filter + tx mode */ });
  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.data) ?? [], [list.data]);

  return (
    <div className="flex flex-col gap-4">
      <DispatchFilterBar />
      {!filters.isTxMode && (
        <DispatchKpiStrip data={summary.data} isLoading={summary.isLoading} />
      )}
      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="px-0 pb-0 pt-0">
          <DispatchTable rows={rows} ... onOpenDetail={filters.openDetail} />
        </CardContent>
      </Card>
      <DispatchDetailDrawer tx={filters.detail || null} onClose={filters.closeDetail} />
    </div>
  );
}
```

### 9.3 KPI strip (`§1.2a` horizontal pattern)

4 cards, grid `grid-cols-2 sm:grid-cols-2 lg:grid-cols-4`:

| Label | Value | Sub | Icon | Color | Formatter |
|---|---|---|---|---|---|
| Tổng orders | `total` | `formatVNDCompact(totalAmount)` | `FileStack` | indigo | `formatNumber` |
| Đang chờ | `pending` | `retrying X · stuck Y` | `Loader2` | amber | `formatNumber` |
| Đã gửi | `dispatched` | `formatVNDCompact(dispatchedAmount)` | `CheckCircle2` | emerald | `formatNumber` |
| Đã huỷ | `cancelled` | `—` hoặc `"Không có"` | `XCircle` | rose | `formatNumber` |

Quy tắc:
- Value KPI dùng `formatNumber` (count) — giống `TxLogKpiStrip`.
- Amount sub dùng `formatVNDCompact` (2.5 tỷ / 450 triệu) theo
  `financial-report-ui.mdc §6.1` tầng KPI.
- `stuck > 0` → valueClass cho card "Đang chờ" = `text-loss`.
- Placeholder `"—"` khi loading + chưa có data (pattern `TxLogKpiStrip`).

### 9.4 FilterBar (theo pattern `TxLogFilterBar`)

Layout `grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4`:

- **Cột 1**: input tìm `tx` (UUIDv7) — Enter commit, ESC clear.
  Khi `isTxMode` → disable cluster phải.
- **Cột 3-4**: cluster phải (right-aligned)
  - `FinancialDateRangePicker` (reuse từ `@/components/date-picker`) —
    disabled khi `isTxMode`.
  - Select `tenantId` (Combobox tenant list — reuse hook `useTenants` nếu có,
    nếu chưa có thì text input plain).
  - Select `status` (`DISPATCH_ORDER_STATUS_LABELS`).
  - Select `sourceKind` (`DISPATCH_SOURCE_KIND_LABELS`).
  - Select `retryMode` (`RETRY_MODE_LABELS`) — khi chọn `stuck` mở thêm
    number input `stuckMinRetry` (default `RETRY_ALERT_THRESHOLD = 50`).
  - Select `gameId` (reuse `GameProduct` values + `GAME_LABELS`).

Reset button tách riêng bên phải cluster — click clear tất cả nuqs state.

### 9.5 DataTable (theo `TxLogTable` + `frontend-dev.mdc §1.7 / §1.7a`)

`Card className="gap-0 overflow-hidden py-0"` → `CardContent className="px-0 pb-0 pt-0"` → Table. Do outer container bỏ padding, **BẮT BUỘC** `pl-5`
cho cột đầu + `pr-5` cho cột cuối ở mọi `TableHead` / `TableCell` (§1.7a).

Columns (11 cột, phân bổ width cố định):

| # | Cột | Width | Header | Cell |
|---|---|---|---|---|
| 1 | createdAt | 160 | "Thời gian" (`pl-5`) | `displayVNDateTime` · `font-mono text-xs tabular-nums` |
| 2 | status | 60 | "Trạng thái" (center) | Icon: `Loader2` (pending, amber spin), `CheckCircle2` (dispatched, profit), `XCircle` (cancelled, muted). `aria-label` theo `DISPATCH_ORDER_STATUS_LABELS`. |
| 3 | sourceKind | 90 | "Loại" | `DISPATCH_SOURCE_KIND_LABELS[kind]` · `text-xs text-muted-foreground` |
| 4 | tenantId | 110 | "Tenant" | `font-mono text-xs` |
| 5 | gameId | 90 | "Game" | `GAME_LABELS[gameId as GameProduct] ?? gameId` (cast an toàn §2.2) |
| 6 | amount | 120 | "Số tiền" (right) | `formatNumber(amount)` · `tabular-nums text-sm` |
| 7 | retryCount | 70 | "Retry" (center) | Badge theo ngưỡng: missing → `"—"` muted · 1-9 → muted · 10-49 → amber · ≥ 50 → `text-loss` bold |
| 8 | lastError | flex | "Lỗi gần nhất" | `[CODE]` badge `bg-destructive/10 text-destructive` + message truncate · empty → `—` |
| 9 | nextAttemptAt | 130 | "Next retry" | `displayVNDateTime` relative · chỉ hiện khi `status === Pending` |
| 10 | batchKey | 160 | "Batch" | Link button short (8 char + `…`) → `router.push('/reports/transactions/dispatch/batches/{batchKey}')` · `stopPropagation` để không trigger onOpenDetail |
| 11 | actions | 40 | `pr-5` | Dropdown: Xem chi tiết · Huỷ order (chỉ khi status=Pending) |

**Row click** (bất kỳ cell trừ batch button + actions) → `onOpenDetail(row.tx)`
— `setState.detail = tx` → drawer mở (pattern `§7.3` rule `frontend-dev.mdc`:
không cần icon chevron vì click row đã đủ).

Row class: `cursor-pointer hover:bg-muted/40 h-11`.

Pagination: button "Tải thêm" ở footer (giống `TxLogTable` infinite query).

Empty state + Loading state: reuse 2 khối dùng trong `TxLogTable`.

### 9.6 Detail Drawer (`DispatchDetailDrawer`)

Reuse đúng layout `TxLogDetailDrawer`:

```
Sheet (max-w-[640px])
├── SheetHeader: title "Chi tiết dispatch order" + description
├── ScrollArea
│   ├── Summary row: Badge status + Badge sourceKind + tenantId + amount + createdAt
│   ├── Identity box (bordered)
│   │   - Tx ID (chỉ hiển thị, font-mono, không copy button)
│   │   - Batch Key (font-mono + link "Xem batch" → /batches/[batchKey])
│   │   - Source ID (gameId + sourceKind → link "Xem orders cùng nguồn"
│   │     → dùng endpoint đã có /api/tenant-dispatch/orders)
│   │   - Account ID + username
│   ├── Retry timeline box
│   │   - retryCount (0 fresh / N lần)
│   │   - lastError box (badge [CODE] + full message)
│   │   - lastAttemptAt
│   │   - nextAttemptAt (relative + absolute)
│   ├── Payload section (stable metadata gửi tenant)
│   │   - JSON pretty-print: { tx, tenantId, action, reason, amount, currency, force, gameId, roundIds, description, metadata }
│   └── Source Context box (internal — monospace JSON, nhỏ hơn)
│       - { sourceKind, sourceId, sourceContext }
└── Footer actions
    - Huỷ order button (disabled khi status !== Pending) → mở DispatchCancelDialog
```

**KHÔNG** dùng `CopyButton` — drawer thuần đọc, không có action copy cho bất
kỳ field nào.

### 9.7 Cancel Dialog (`DispatchCancelDialog`)

Tuân thủ `frontend-dev.mdc §5b` (RHF + Zod) + `§5b.4` (Dialog header icon):

```tsx
const schema = z.object({
  confirm: z.boolean().refine((v) => v, { message: "Xác nhận huỷ bắt buộc." }),
});

function DispatchCancelDialog({ tx, open, onOpenChange }) {
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { confirm: false } });
  const mutation = useCancelOrder();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-rose-500 to-rose-600 shadow-sm">
              <XCircle className="size-4.5 text-white" />
            </div>
            <div>
              <DialogTitle>Huỷ order dispatch</DialogTitle>
              <DialogDescription className="text-xs">
                Worker sẽ không dispatch order này nữa. Action không thể hoàn tác.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(() => mutation.mutate(tx, {
            onSuccess: () => { onOpenChange(false); form.reset(); },
          }))}>
            <div className="rounded-md border bg-muted/30 p-3 font-mono text-xs">{tx}</div>
            <FormField name="confirm" render={({ field }) => (
              <FormItem className="flex items-center gap-2">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel className="text-xs">Tôi xác nhận huỷ order này.</FormLabel>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} type="button">Đóng</Button>
              <Button variant="destructive" type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Đang huỷ…" : "Xác nhận huỷ"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

### 9.8 Batch Progress sub-page

`/reports/transactions/dispatch/batches/[batchKey]/page.tsx` —
page riêng hiển thị:

- PageHeader icon `Layers` + title `Batch {shortKey}` + description
  `batchKey` đầy đủ (plain text).
- `BatchProgressCard` KPI 4 cards: `total` · `pending` · `dispatched` ·
  `cancelled` + progress bar % dispatched · `firstCreatedAt` · `lastDispatchedAt`
  · `dispatchedAmount` (VNDCompact).
- DataTable reuse `DispatchTable` với preset filter `batchKey` (endpoint
  `/api/tenant-dispatch/orders` nhận `gameId + sourceKind + sourceId` nhưng
  BatchKey không map 1-1. **Giải pháp**: endpoint mới
  `GET /api/tenant-dispatch/list?batchKey=...` — append `batchKey` vào
  `listDispatchOrdersQuerySchema` + filter repo thêm nhánh `batchKey`. Cheap,
  idempotent với Schema tập trung).

## 10. Loading / Empty / Error States (frontend-dev.mdc §1.6)

- **Loading**: skeleton match layout — 4 KPI cards + Table với 10 row
  `h-11`. Tuyệt đối không dùng 1 block skeleton đơn giản.
- **Empty** (list.data.pages.length === 0):
  - `isTxMode`: "Không tìm thấy order với Tx này." + gợi ý xoá filter.
  - `retryMode=stuck` + count = 0: "Không có order stuck ✓" màu profit.
  - default: "Không có dispatch order nào phù hợp." + "Thử nới filter hoặc xoá retry mode."
- **Error**: error card với retry button, giữ nguyên KPI cache nếu còn stale.
- **Detail drawer error**: reuse layout `TxLogDetailDrawer` (AlertCircle + message).

## 11. Format Số & Color Coding

Tuân thủ `financial-report-ui.mdc §6`:

| Vị trí | Formatter |
|---|---|
| KPI value (count) | `formatNumber(count)` |
| KPI sub (amount) | `formatVNDCompact(amount)` |
| Bảng cột `amount` | `formatNumber(amount)` — **KHÔNG `formatVND`/`formatVNDCompact`** |
| Bảng cột `retryCount` | `formatNumber(retryCount)` hoặc `—` khi missing |
| Drawer `amount` | `formatVND(amount)` (hiển thị full với ký tự ₫) |
| Thời gian | `displayVNDateTime` (bảng) · `displayVNDateTime` + relative (drawer) |

Color coding:

- Status icon:
  - `Pending` → `text-amber-500 animate-spin` nếu là `Loader2`
  - `Dispatched` → `text-profit`
  - `Cancelled` → `text-muted-foreground`
- `retryCount`:
  - missing (fresh) → `text-muted-foreground`
  - `1-9` → `text-muted-foreground`
  - `10-49` → `text-warning`
  - `>= RETRY_ALERT_THRESHOLD (50)` → `text-loss font-semibold`
- `lastError` code badge: `bg-destructive/10 text-destructive` (outer reject)
  hoặc `bg-amber-500/15 text-amber-700 dark:text-amber-400` (per-item fail).
  Phân biệt bằng prefix `"Outer fail: "` trong message (xem
  `dispatch-order.ts §lastError`).

## 12. Polling & Refetch

- List query: `refetchInterval: 30_000` **chỉ khi** `status === "pending"`
  hoặc `retryMode === "stuck"`. Các mode khác `false` (static historical view).
- Summary query: `staleTime: 15_000`, không auto-refetch — người dùng manual
  refresh hoặc đổi filter.
- Detail drawer: fetch once; khi mutation cancel thành công → invalidate
  `tenantDispatchKeys.all`.
- Batch progress page: `refetchInterval: 30_000` vì batch có thể đang
  dispatch.

## 13. Testing

- **Unit** (jest): `listWithCursor` filter builder (retryMode variants +
  cursor boundary) · `aggregateSummary` pipeline output shape.
- **Unit** (nuqs): `useDispatchFilters` — default range, reset, isTxMode toggle.
- **Component**: `DispatchCancelDialog` RHF flow (submit disabled until
  checkbox, mutation pending state, toast trên success/fail).
- **E2E** (playwright):
  1. Admin login → `/reports/transactions/dispatch`.
  2. Filter `retryMode=stuck`, `stuckMinRetry=50` → KPI phản ánh đúng.
  3. Click row → drawer hiển thị đủ fields.
  4. Cancel order → confirm dialog → toast success → row update status.
  5. Click batchKey → navigate batch page → progress card đầy đủ.
  6. Refresh → URL state giữ nguyên.

## 14. Acceptance Criteria

- [ ] Admin vào `/reports/transactions/dispatch` thấy list + KPI + filter + drawer.
- [ ] URL state persist qua reload (tenantId/status/retryMode/from/to/detail).
- [ ] Cancel order chỉ khả dụng khi `status === Pending`; thành công → row
      mất khỏi Pending filter sau refetch.
- [ ] Stuck orders (≥ 50 retry) hiển thị `text-loss` + valueClass KPI "Đang chờ" đổi.
- [ ] Dark mode: contrast đạt (icon Pending spin vàng, Cancelled muted).
- [ ] Bảng dùng `formatNumber` cho mọi cột số; KPI dùng `formatVNDCompact`.
- [ ] `pl-5`/`pr-5` cho cột đầu/cuối (rule §1.7a).
- [ ] Card `gap-0 py-0`, CardContent `px-0 pt-0 pb-0` (outer container zero padding).
- [ ] Dialog cancel có header icon gradient (§5b.4).
- [ ] KHÔNG có hardcode label `Record<string, string>` trong component.
- [ ] KHÔNG gọi repo trực tiếp từ route — mọi route đều đi qua use case.
- [ ] `types` tách ra `repos/types/` — file repo chỉ chứa query logic
      (tuân thủ `mongodb-repository-architecture.mdc §2`).
- [ ] ReadLints trên tất cả file mới clean.

## 15. Thứ tự implement (incremental PR-friendly)

1. **Package backend** — `packages/tenant-dispatch`:
   1.1. Thêm `shared/labels/` + export barrel + package.json exports.
   1.2. Thêm types vào `repos/types/dispatch-order.types.ts`
        (`ListDispatchOrdersFilter`, `DispatchSummary`).
   1.3. Thêm methods `listWithCursor`, `aggregateSummary` vào
        `DispatchOrderRepository`.
   1.4. Thêm use cases `list-dispatch-orders`, `get-dispatch-summary`,
        `get-order-by-tx` + update `use-cases/admin/index.ts`.
   1.5. Build + type-check: `pnpm --filter @megawin/tenant-dispatch check-types`.

2. **BO API routes** — `apps/backoffice/src/app/api/tenant-dispatch`:
   2.1. Append Zod schemas vào `_lib/schema.ts`.
   2.2. Thêm 3 routes: `list/route.ts`, `summary/route.ts`, `[tx]/route.ts`.

3. **BO query-keys** — `apps/backoffice/src/lib/query-keys`:
   3.1. Thêm `tenantDispatch` vào `modules.ts`.
   3.2. Tạo `tenant-dispatch.ts` + export qua `index.ts`.

4. **BO frontend trang dispatch**:
   4.1. `_lib/use-filters.ts`, `_lib/use-queries.ts`, `_lib/types.ts`.
   4.2. `_components/dispatch-kpi-strip.tsx`, `dispatch-filter-bar.tsx`.
   4.3. `_components/dispatch-table.tsx` (reuse column constants).
   4.4. `_components/dispatch-detail-drawer.tsx`.
   4.5. `_components/dispatch-cancel-dialog.tsx`.
   4.6. `_components/dispatch-content.tsx` + `page.tsx`.

5. **Batch progress sub-page**:
   5.1. `batches/[batchKey]/_components/batch-progress-card.tsx`.
   5.2. `batches/[batchKey]/page.tsx` (reuse `DispatchTable` với filter batchKey).

6. **Sidebar**: cập nhật `sidebar-items.ts` — bỏ `comingSoon` cho Dispatch,
   đặt trước API logs trong group `"Giao dịch"`.

7. **Testing**: unit → component → E2E.

## 16. Follow-up ideas (ngoài scope)

- **Cross-link tx log ↔ dispatch order**: drawer hiện link "Xem API log tương
  ứng" (route `/reports/transactions/api-logs?tx={tx}`) — join qua
  `tx` field (đã cùng UUID giữa outbox + tx_logs).
- **Tenant health ranking**: aggregate stuck + cancel count per tenantId trong
  24h/7d → highlight tenant có issue.
- **Force retry now** (cần use case backend) — reset `nextAttemptAt = now`
  thay vì huỷ order.
- **Bulk cancel** — checkbox multi-select + confirm N orders.
- **CSV export** bảng list (áp dụng filter hiện tại).
- **Error code histogram** — top 10 `[CODE]` trong 24h để phát hiện regression.
