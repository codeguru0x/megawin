# Tenant Dispatch — Stuck Orders UI Plan

> **Status**: Proposed. Backend đã sẵn sàng: `ListStuckOrdersUseCase` +
> `GET /api/tenant-dispatch/stuck-orders`. Plan này mô tả UI Backoffice để staff
> theo dõi và can thiệp orders đang retry quá nhiều lần.

## 0. Mục tiêu

1. **Visibility**: staff nhìn thấy ngay orders đang stuck (retry ≥ 50 lần) để
   kiểm tra tenant có vấn đề hay không.
2. **Debug**: cung cấp đủ context (tx, tenant, số lần retry, lỗi gần nhất, thời
   điểm retry kế tiếp) để staff tìm root cause trên Axiom log.
3. **Action tối thiểu**: chỉ có `Cancel order` + `Copy tx`. Không có "Force
   retry now" (đã bỏ cùng `RetryBatchUseCase`). Worker tự retry vô hạn.
4. **Tuân thủ `frontend-dev.mdc`**: PageHeader/icon gradient, KPI strip, table
   chuẩn, nuqs URL state, react-query keys, react-hook-form cho cancel confirm.

## 1. Scope

**Có trong plan:**

- Page `/operations/tenant-dispatch/stuck-orders` trong BO.
- KPI strip 4 số: total stuck / max retryCount / tenants affected / stuck > 1 ngày.
- FilterBar: `minRetryCount`, `tenantId`, `limit`, `skip`.
- DataTable: tx · tenant · gameId · sourceKind · retryCount · lastError · nextAttemptAt · createdAt · actions.
- Cancel order confirm dialog (dùng `CancelOrderUseCase` đã có).
- Copy tx button.
- Empty / loading / error states.

**Không scope:**

- Force retry now (không có backend).
- Edit order fields (không có use case).
- Bulk operations (cancel nhiều cùng lúc) — giai đoạn sau.
- Real-time subscription (polling 30s là đủ).

## 2. Architecture

```
apps/backoffice/src/app/(main)/operations/tenant-dispatch/
├── stuck-orders/
│   ├── page.tsx                         ← Suspense wrapper
│   └── _components/
│       ├── stuck-orders-content.tsx     ← Orchestrator: filters + kpis + table
│       ├── stuck-orders-kpi-strip.tsx
│       ├── stuck-orders-filter-bar.tsx
│       ├── stuck-orders-table.tsx
│       ├── stuck-order-row-actions.tsx  ← Copy tx + Cancel dropdown
│       └── cancel-order-dialog.tsx      ← Confirm dialog + react-hook-form
└── _lib/
    ├── queries.ts                       ← useStuckOrders, useCancelOrder
    ├── use-filters.ts                   ← nuqs filter state
    └── types.ts                         ← StuckOrderRow
```

Key files:
- Query keys: `apps/backoffice/src/lib/query-keys/tenant-dispatch.ts`.
- Navigation: thêm mục trong sidebar "Operations → Tenant dispatch → Stuck orders".

## 3. Backend API (đã có)

`GET /api/tenant-dispatch/stuck-orders?minRetryCount=50&tenantId=xxx&limit=100&skip=0`

Response (thông qua `withApi` envelope):

```typescript
{
  data: TenantDispatchOrderEntity[];  // repo.listStuck() result
}
```

`DELETE /api/tenant-dispatch/cancel-order` đã có: payload `{ tx }` → trả `{ cancelled: boolean }`.

## 4. Query Keys

```typescript
// apps/backoffice/src/lib/query-keys/tenant-dispatch.ts
import { MODULES } from "./modules";
const MODULE = MODULES.tenantDispatch;

export const tenantDispatchKeys = {
  all: [MODULE] as const,
  stuckOrders: (filter: {
    minRetryCount?: number;
    tenantId?: string;
    limit?: number;
    skip?: number;
  }) => [MODULE, "stuck-orders", filter] as const,
  batchProgress: (batchKey: string) =>
    [MODULE, "batch-progress", { batchKey }] as const,
  listBySource: (filter: { gameId: string; sourceKind: string; sourceId: string }) =>
    [MODULE, "list-by-source", filter] as const,
};
```

Thêm module ID `tenantDispatch: "tenant-dispatch"` vào `modules.ts`.

## 5. URL state (nuqs)

```typescript
// _lib/use-filters.ts
"use client";

import { useQueryState, parseAsInteger, parseAsString } from "nuqs";

export function useStuckOrdersFilters() {
  const [minRetryCount, setMinRetryCount] = useQueryState(
    "minRetry",
    parseAsInteger.withDefault(50),
  );
  const [tenantId, setTenantId] = useQueryState("tenant", parseAsString);
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));

  const limit = 50;
  const skip = (page - 1) * limit;

  return {
    filters: {
      minRetryCount,
      tenantId: tenantId ?? undefined,
      limit,
      skip,
    },
    setMinRetryCount,
    setTenantId,
    page,
    setPage,
    reset: () => {
      setMinRetryCount(null);
      setTenantId(null);
      setPage(null);
    },
  };
}
```

Defaults:
- `minRetry = 50` (default = `RETRY_ALERT_THRESHOLD`).
- `page = 1`.
- Xoá param khi bằng default để URL sạch.

## 6. Query hooks

```typescript
// _lib/queries.ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient, ApiClientError } from "@megawin/next/client";

import { tenantDispatchKeys } from "@/lib/query-keys/tenant-dispatch";
import type { TenantDispatchOrderEntity } from "@megawin/tenant-dispatch/entities";

interface StuckOrdersFilter {
  minRetryCount?: number;
  tenantId?: string;
  limit?: number;
  skip?: number;
}

interface StuckOrdersResponse {
  data: TenantDispatchOrderEntity[];
}

export function useStuckOrders(filter: StuckOrdersFilter) {
  return useQuery({
    queryKey: tenantDispatchKeys.stuckOrders(filter),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filter.minRetryCount != null)
        params.set("minRetryCount", String(filter.minRetryCount));
      if (filter.tenantId) params.set("tenantId", filter.tenantId);
      if (filter.limit != null) params.set("limit", String(filter.limit));
      if (filter.skip != null) params.set("skip", String(filter.skip));
      return apiClient.get<StuckOrdersResponse>(
        `/tenant-dispatch/stuck-orders?${params.toString()}`,
      );
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function useCancelOrder() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (tx: string) =>
      apiClient.delete<{ cancelled: boolean }>("/tenant-dispatch/cancel-order", {
        tx,
      }),
    onSuccess: (res, tx) => {
      qc.invalidateQueries({ queryKey: tenantDispatchKeys.all });
      toast.success(res.cancelled ? `Đã huỷ order ${tx}.` : "Order đã dispatched.");
    },
    onError: (err) => {
      const message = err instanceof ApiClientError ? err.message : "Không thể huỷ order.";
      toast.error(message);
    },
  });
}
```

Lưu ý: `apiClient.delete` chấp nhận body payload theo convention hiện tại; nếu
build fail, dùng `apiClient.post("/tenant-dispatch/cancel-order", { tx })`
(backend `withApi().body()` nhận POST phổ biến hơn). **Xác minh** bằng cách đọc
`apps/backoffice/src/app/api/tenant-dispatch/cancel-order/route.ts` trước khi
code.

## 7. Page layout (theo `frontend-dev.mdc` §1.3)

```
1. PageHeader  ← icon AlertTriangle + SYSTEM_ICON_GRADIENT · title "Stuck orders"
2. FilterBar   ← minRetryCount input + tenant select + reset
3. KPI strip   ← 4 cards horizontal
4. DataTable   ← sticky header, pagination (nuqs), row click → order detail drawer (optional)
5. States      ← skeleton / empty / error
```

### 7.1 PageHeader

```tsx
import { AlertTriangle } from "lucide-react";
import { SYSTEM_ICON_GRADIENT } from "@/lib/game-colors";

<div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
  <div className="flex items-center gap-3">
    <div
      className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${SYSTEM_ICON_GRADIENT} shadow-sm`}
    >
      <AlertTriangle className="size-4.5 text-white" />
    </div>
    <div>
      <h1 className="text-lg font-semibold tracking-tight text-foreground">
        Stuck orders
      </h1>
      <p className="text-xs text-muted-foreground">
        Orders đang retry vượt ngưỡng — staff cần kiểm tra tenant để tránh treo kéo dài.
      </p>
    </div>
  </div>
  <div className="flex items-center gap-2">
    <Button variant="outline" size="sm" onClick={() => refetch()}>
      <RefreshCw className="size-3.5" />
      Refresh
    </Button>
  </div>
</div>
```

### 7.2 KPI strip (horizontal pattern §1.2a)

4 KPI cards (grid `sm:grid-cols-4`):

| Label              | Value                                           | Icon           | Color  |
| ------------------ | ----------------------------------------------- | -------------- | ------ |
| Tổng stuck         | `data.length`                                   | `AlertTriangle`| rose   |
| Max retryCount     | `max(retryCount)`                               | `RotateCw`     | amber  |
| Tenants bị ảnh hưởng | `new Set(data.map(d=>d.tenantId)).size`       | `Building2`    | blue   |
| Stuck > 24 giờ     | count `createdAt < now - 24h`                   | `Clock`        | violet |

Dùng KpiCard pattern chuẩn.

### 7.3 FilterBar

- `minRetryCount`: `NumberInput` (min 1) với tooltip "Ngưỡng tối thiểu retryCount".
- `tenantId`: `Combobox` load từ `useTenants()` (đã có trong BO) — optional.
- Reset button → `filters.reset()`.

### 7.4 DataTable

Columns:

| Cột            | Header          | Cell                                                           |
| -------------- | --------------- | -------------------------------------------------------------- |
| tx             | TX              | `font-mono text-xs` — truncate 8 ký tự, tooltip full           |
| tenantId       | Tenant          | badge hoặc plain text                                          |
| gameId         | Game            | `GAME_LABELS[gameId as GameProduct] ?? gameId`                 |
| sourceKind     | Loại            | label map cho `payout`/`refund`/`reversal`                     |
| amount         | Amount          | right-align, `tabular-nums`, `formatNumber`                    |
| retryCount     | Retry           | badge variant theo mức (50-100: amber; 100-200: orange; >200: red) |
| lastError      | Lỗi gần nhất    | truncate 1 dòng, tooltip full, text xs                         |
| nextAttemptAt  | Next retry      | `displayVNTime`, relative (`vài phút nữa`)                     |
| createdAt      | Created         | `displayVNTime`                                                |
| actions        | —               | dropdown: Copy tx · Cancel                                     |

Quy tắc:
- `CardContent className="p-0"` → `pl-5` cho cột `tx`, `pr-5` cho cột `actions`.
- Sticky header + row height `h-11`.
- Không icon chevron cuối row — stuck orders không drill-down (detail qua drawer onclick).

### 7.5 Cancel dialog

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-rose-500 to-rose-600 shadow-sm">
          <XCircle className="size-4.5 text-white" />
        </div>
        <div>
          <DialogTitle>Huỷ order</DialogTitle>
          <DialogDescription className="text-xs">
            Action này không thể hoàn tác. Worker sẽ không dispatch order này nữa.
          </DialogDescription>
        </div>
      </div>
    </DialogHeader>
    {/* tx readonly display + confirm checkbox */}
    <Button variant="destructive" onClick={() => mutation.mutate(tx)} disabled={mutation.isPending}>
      {mutation.isPending ? "Đang huỷ..." : "Xác nhận huỷ"}
    </Button>
  </DialogContent>
</Dialog>
```

Confirm bằng react-hook-form + Zod (dù chỉ 1 checkbox "Tôi xác nhận") vì §5b yêu
cầu khi có mutation.

## 8. Display labels

Thêm `DISPATCH_SOURCE_KIND_LABELS` + `DISPATCH_ORDER_STATUS_LABELS` trong
`packages/tenant-dispatch/src/labels/` (tạo folder nếu chưa có) — **KHÔNG**
hardcode `Record<string, string>` trong component.

```typescript
// packages/tenant-dispatch/src/labels/index.ts
import { DispatchSourceKind, DispatchOrderStatus } from "../entities/enums";

export const DISPATCH_SOURCE_KIND_LABELS: Record<DispatchSourceKind, string> = {
  [DispatchSourceKind.Payout]: "Trả thưởng",
  [DispatchSourceKind.Refund]: "Hoàn tiền cược",
  [DispatchSourceKind.Reversal]: "Thu hồi (re-settle)",
};

export const DISPATCH_ORDER_STATUS_LABELS: Record<DispatchOrderStatus, string> = {
  [DispatchOrderStatus.Pending]: "Đang chờ",
  [DispatchOrderStatus.Dispatched]: "Đã gửi",
  [DispatchOrderStatus.Cancelled]: "Đã huỷ",
};
```

Export qua `@megawin/tenant-dispatch/labels` trong `package.json` exports.

## 9. Navigation entry

Thêm sidebar menu dưới "Operations":

```tsx
// Sidebar item
{
  label: "Tenant dispatch",
  icon: Send,
  children: [
    { label: "Stuck orders", href: "/operations/tenant-dispatch/stuck-orders" },
    // (tương lai: batch progress, order detail search)
  ],
}
```

Auth: yêu cầu `CompanyRole.Admin` (giống các admin operations pages khác).

## 10. Polling strategy

- `refetchInterval: 30_000` (30s) — data gần real-time đủ cho debug.
- Khi cửa sổ không visible → React Query auto-pause (`refetchOnWindowFocus: true`).
- Polling dừng khi error 3 lần liên tiếp (default query behavior).

## 11. Edge cases

| Case                                         | Xử lý UI                                                      |
| -------------------------------------------- | ------------------------------------------------------------- |
| Không có stuck order                         | Empty state "Không có order nào stuck ✓" — màu xanh nhẹ.     |
| Order tự recover giữa lúc hiển thị           | Next polling cycle sẽ rớt khỏi list → row fade-out animation. |
| Cancel action conflict (order vừa dispatched)| `mutation.onSuccess` check `cancelled=false` → toast warn.   |
| Hàng nghìn stuck orders                      | Pagination `limit=50` + `skip` — backend giới hạn `limit ≤ 500`. |

## 12. Testing

- Unit: `use-filters.ts` nuqs defaults.
- Component: cancel dialog flow với MSW mock.
- Visual: screenshot test KPI strip + table trong dark/light mode.
- E2E (playwright): staff đăng nhập → vào page → filter tenant → cancel 1 order → toast success → polling thấy row biến mất.

## 13. Acceptance criteria

- [ ] Staff truy cập `/operations/tenant-dispatch/stuck-orders` thấy danh sách orders `retryCount ≥ 50`.
- [ ] Filter by tenantId / minRetryCount hoạt động + persist vào URL.
- [ ] KPI strip hiện 4 chỉ số chính xác.
- [ ] Cancel action đổi status order sang `Cancelled`, row rớt khỏi list sau refetch.
- [ ] Dark mode không washed-out; tabular-nums cho mọi số.
- [ ] Tuân thủ `frontend-dev.mdc` checklist §6 (font size, Card spacing, icon patterns, pl-5/pr-5...).
- [ ] Không có hardcode label / color / queryKey.

## 14. Follow-up ideas (ngoài scope)

- **Tenant health view**: aggregate stuck theo tenant → rank tenant đang fail nhiều nhất.
- **Error clustering**: group stuck theo prefix `[CODE]` của `lastError` → top 5 error codes.
- **Axiom deep-link**: từ `tx` → click mở Axiom search `| where tx == "xxx"` trong tab mới.
- **Bulk cancel**: checkbox multi-select + confirm dialog cancel N orders.
- **Retry time histogram**: chart số orders theo `nextAttemptAt` buckets (5p/15p/30p+).
