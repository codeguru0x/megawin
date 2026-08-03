# p1-01 — Backoffice: trang "Workers health" (`/system/workers`)

> **Nguồn:** `.cursor/analysis/system-worker-health.analysis.md` §5.5 + §5.5.1 (+ §2.3 nợ đang trả, §2.4 `kind`)
> **Phase:** P1 · **Phụ thuộc:** p0-01 (bắt buộc — cần `stalledItems`, `description`, `kind`, `listByKind`); khuyến nghị merge SAU p0-02
> **Phạm vi:** `packages/worker-core` (use-case admin + labels) + `apps/backoffice` (route mỏng + trang).
> **SỬA 03/08:** use-case chuyển từ tầng app → **`worker-core`** (§2.2). Repo dùng `listByKind` của
> p0-01 thay `listAll` (§2.1).

## 1. Mục tiêu

`worker_locks` chứa `lastError`, `lastSuccessAt`, `cursor`, kill-switch `isEnabled`, và (sau p0-01)
`stalledItems` — nhưng **không UI nào đọc** (grep `worker_locks|WorkerLockRepository` trong
`apps/backoffice`: 0 kết quả). Kill-switch hiện phải bật/tắt bằng mongo shell, đúng như JSDoc field đó
hướng dẫn. Repo cũng không có convention CloudWatch alarm/metric filter nào cho worker.

Nghĩa là: **9 worker app đang chạy production mà ops không có kênh nào xem sức khoẻ.** Plan này trả nợ
đó cho cả 9 worker, đồng thời là nơi hiển thị tín hiệu `stalledItems` mà p0-02 vừa chuyển sang.

Worker trong phạm vi: `worker-keno`, `worker-bingo18`, `worker-max3d`, `worker-max3dpro`,
`worker-mega645`, `worker-power655`, `worker-lotto535`, `worker-game-core`, `worker-tenant-dispatch`
(mỗi app có ≥1 `lockKey`).

## 2. Thiết kế

### 2.1. Repo — dùng `listByKind` của p0-01, KHÔNG thêm `listAll`

`listByKind(WorkerLockKind.Worker)` đã có từ p0-01 §2.6c — plan này **không thêm method repo nào**.

> **Vì sao không `listAll()`** (bản đầu của plan này đề xuất, đã bỏ): `worker_locks` chứa **2 loại doc**.
> `DistributedMutex` ghi vào cùng collection với `lockKey` động `keno:resettle:${drawId}` ⇒ số doc
> tăng theo nghiệp vụ, không phải theo số worker. `listAll()` sẽ trả cả chúng ⇒ sau vài tháng trang này
> chìm trong hàng trăm dòng resettle. Chi tiết: analysis §2.4.
>
> Khẳng định *"số worker là hằng số nhỏ (~10–15), tăng theo số game chứ không theo dữ liệu"* trong bản
> đầu **chỉ đúng khi đã filter `kind`**. Không filter thì nó sai.

Không thêm filter `failCount`/threshold ở tầng repo: lọc "worker nào đáng chú ý" là việc **hiển thị**,
làm ở client trên tập ~15 doc rẻ hơn query có điều kiện (và tránh vẽ index mới). Khác `listStuck` của
`tenant-dispatch` (`dispatch-order-repo.ts:288-307`) — ở đó tập dữ liệu là **order**, tăng vô hạn theo
lưu lượng nên buộc lọc + sort ở DB.

### 2.2. Use-case — đặt trong `worker-core`, app chỉ có route mỏng

> **Bản đầu của plan này nói đặt ở tầng app. SAI** — lý do "worker-core không có `@megawin/next`" là mô
> tả hiện trạng, không phải ràng buộc. Xem analysis §5.5.1.

**Tiền lệ quyết định — `packages/tenant-dispatch`:** package **worker** (dep `@megawin/worker-core`) và
nó dep luôn `@megawin/next`, có `use-cases/admin/` gồm **8 `NextApiUseCase`** cho BO, export qua subpath
`./use-cases/admin`. Route BO chỉ 20 dòng:

```1:20:apps/backoffice/src/app/api/tenant-dispatch/stuck-orders/route.ts
import { CompanyRole } from "@megawin/identity/entities";
import { ListStuckOrdersUseCase } from "@megawin/tenant-dispatch/use-cases/admin";

import { withApi } from "@/lib/api";

import { listStuckOrdersQuerySchema } from "../_lib/schema";

const useCase = new ListStuckOrdersUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(listStuckOrdersQuerySchema)
  .handler(async ({ query }) => useCase.run({ minRetryCount: query.minRetryCount, ... }));
```

**Lý do mạnh nhất** — chính JSDoc trong `worker-core` đã phê phán đúng điều bản đầu định làm:

```29:31:packages/worker-core/src/use-cases/lock/distributed-mutex.ts
 * - Gọi trực tiếp `WorkerLockRepository` từ business layer làm **leak
 *   infrastructure detail** (`ownerToken`, `expiresAt`, `tryAcquire`) ra
 *   BO use case → 6 game khác sẽ copy-paste cùng pattern.
```

Use-case ở app buộc `apps/backoffice` import `WorkerLockRepository` ⇒ leak `ownerToken`/`expiresAt` ra
app, trái cả `mongodb.mdc` (repo chỉ gọi trong package sở hữu nó).

**`get-dashboard-draws.ts` KHÔNG phải tiền lệ cho ca này:** nó orchestrate repo của **7 game khác nhau**
— không package nào là chủ sở hữu tự nhiên, nên app là nơi đúng. `worker_locks` có chủ rõ ràng.

Cấu trúc:

```
packages/worker-core/
├── src/use-cases/admin/
│   ├── list-workers-health.ts    # NextApiUseCase — listByKind(Worker) + derive state
│   ├── set-worker-enabled.ts     # NextApiUseCase — toggle isEnabled + audit log
│   ├── types.ts                  # WorkerHealthRow, WorkerRunState
│   └── index.ts
├── src/shared/labels/            # theo tiền lệ tenant-dispatch ./shared/labels
│   ├── worker-labels.ts          # WORKER_RUN_STATE_LABELS + badge variant
│   └── index.ts
└── package.json                  # + dep @megawin/next, @megawin/audit
                                  # + subpath ./use-cases/admin, ./shared/labels

apps/backoffice/src/app/api/system/workers/
├── _lib/schema.ts                # zod cho PATCH body / GET query
└── route.ts                      # GET + PATCH, ~20 dòng
```

**Bundle-size — kiểm tra rồi, an toàn:** `use-cases/admin` là subpath export **riêng**. Worker Lambda
import `@megawin/worker-core/use-cases` (hoặc `./entities`) không kéo `next` vào bundle. Đây đúng cách
`tenant-dispatch` đang chạy: dep `@megawin/next` + 9 worker vẫn deploy bình thường.

Lợi ích kèm theo: `WorkerHealthRow`/`WorkerRunState`/labels tái dùng được nếu sau này có app ops riêng;
mọi thay đổi shape sức khoẻ worker nằm **1 chỗ** cùng nơi định nghĩa `WorkerLockDoc`.

### 2.3. Derive trạng thái — ở SERVER, không ở FE

Bảng trạng thái đã tồn tại trong JSDoc `WorkerLockDoc` (`worker-lock.ts:14-20`) nhưng chưa ai render:

| Trạng thái | Điều kiện | Ý nghĩa |
|---|---|---|
| `idle` | `ownerToken == null` | Không invocation nào đang chạy — bình thường giữa 2 lượt |
| `running` | `ownerToken != null` && `expiresAt > now` | Đang chạy, heartbeat còn hạn |
| `crashed` | `ownerToken != null` && `expiresAt <= now` | **Chết giữa lượt** — hết TTL mà chưa release. Cờ đỏ rõ nhất |
| `disabled` | `isEnabled === false` | Kill-switch đang bật (ưu tiên hiển thị trên mọi trạng thái khác) |

Derive ở server bằng const-as-const (`code-quality-standards.mdc` §5.3):

```typescript
export const WorkerRunState = {
  Idle: "idle",
  Running: "running",
  Crashed: "crashed",
  Disabled: "disabled",
} as const;
export type WorkerRunState = (typeof WorkerRunState)[keyof typeof WorkerRunState];
```

Lý do derive ở server: `now` của client có thể lệch giờ ⇒ `crashed` tính sai. Server là nguồn thời gian
duy nhất.

### 2.4. Shape trả về FE — chỉ field FE dùng

Theo `vercel-react-best-practices` §3.4 (giảm serialization qua RSC boundary) — KHÔNG trả cả entity:

```typescript
export interface WorkerHealthRow {
  /** Khoá worker, vd `"keno:stats-sync"`. Dùng làm React key + tham số toggle. */
  lockKey: string;
  /**
   * Mô tả worker làm gì — LUÔN có giá trị: use-case fallback `description ?? lockKey`
   * (worker chưa khai `description` thì hiện chính `lockKey`).
   *
   * Fallback ở use-case chứ KHÔNG ở mapper — mapper phải giữ được phân biệt
   * "chưa khai" vs "khai bằng lockKey" (p0-01 §2.6a).
   */
  description: string;
  /** Trạng thái đã derive ở server (client không tự tính vì lệch giờ). */
  state: WorkerRunState;
  /** ISO 8601 lần thành công gần nhất; `null` nếu chưa từng. */
  lastSuccessAt: string | null;
  /** Số giây kể từ `lastSuccessAt` — server tính để tránh lệch đồng hồ client. */
  secondsSinceSuccess: number | null;
  /** Message lỗi gần nhất (đã cắt 500 ký tự ở worker); `null` nếu lượt cuối OK. */
  lastError: string | null;
  /** Cursor hiện tại — chuỗi tự do do worker tự đặt nghĩa. */
  cursor: string | null;
  /** `false` = kill-switch đang chặn mọi invocation. */
  isEnabled: boolean;
  /** Item đang lỗi lặp lại; rỗng = không có gì kẹt. */
  stalledItems: WorkerStalledItem[];
}
```

`kind` **không** vào shape này: mọi row đều là `Worker` (đã filter ở repo) ⇒ field hằng số, trả đi chỉ
tốn serialization (`vercel-react-best-practices` §3.4).

### 2.5. UI — bám tiền lệ `audit-logs` / `dispatch`, KHÔNG tự phát minh

> **Đã khảo sát repo trước khi viết mục này.** 3 điều **CHƯA CÓ tiền lệ** — không được viện dẫn như
> có sẵn: (1) route group `(main)/system/**`; (2) `Switch` **bên trong** `TableRow` (19 file dùng
> `Switch` đều là Card/form/dialog); (3) debounce và optimistic update (0 kết quả toàn app).

#### a) Cấu trúc file — copy khung `audit-logs/`

Repo có **2 pattern bảng song song**. Chọn **Pattern A** (`Table` thuần, như `audit-logs/`,
`reports/transactions/dispatch/`, `api-logs/`), **KHÔNG** Pattern B (`DataTable` + TanStack
`ColumnDef`, như `tenants/`, `accounts/`).

Lý do chọn A: tập 15 dòng không cần sort/faceted/pagination client; và `DataTablePagination` +
`DataTable` empty state đang hardcode **tiếng Anh** ("Rows per page", "No results.") — kéo vào là nhập
text Anh vào trang mới.

```
apps/backoffice/src/app/(main)/system/workers/
├── page.tsx                              # "use client" + PageHeader + <Suspense fallback={Skeleton}>
├── _components/
│   ├── workers-content.tsx               # orchestrator: gọi hooks, giữ state dialog
│   ├── workers-table.tsx                 # Table + loading + empty
│   ├── worker-toggle-dialog.tsx          # AlertDialog confirm bật/tắt
│   └── stalled-items-dialog.tsx          # chi tiết stalledItems của 1 worker
└── _lib/
    └── use-queries.ts                    # useQuery + useMutation
```

Quy ước thư mục (bất biến toàn BO): `_lib/` = logic (queries, filters, types), `_components/` = UI.

#### b) PageHeader — `frontend-dev.mdc` §1.4, dùng `SYSTEM_ICON_GRADIENT`

```tsx
import { Activity } from "lucide-react";
import { SYSTEM_ICON_GRADIENT } from "@/lib/game-colors";

<div className="flex items-center gap-3">
  <div className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${SYSTEM_ICON_GRADIENT} shadow-sm`}>
    <Activity className="size-4.5 text-white" />
  </div>
  <div>
    <h1 className="text-lg font-semibold tracking-tight text-foreground">Sức khoẻ worker</h1>
    <p className="text-xs text-muted-foreground">Trạng thái, tiến độ và kill-switch của các worker nền.</p>
  </div>
</div>
```

Icon import **qua barrel `lucide-react`** — đây là convention thật của toàn app và
`next.config.ts:12` đã bật `optimizePackageImports: ["lucide-react", …]`, tức Next tự chuyển thành
direct import lúc build. **Đây là ngoại lệ có căn cứ với `vercel-react-best-practices` §2.1**, vì chính
rule đó nêu `optimizePackageImports` là cách thay thế hợp lệ. Sửa lại rủi ro #8 bên dưới.

#### c) Card bọc bảng — full-bleed như `audit-logs-content.tsx:64-65`

```tsx
<Card className="gap-0 overflow-hidden py-0">
  <CardContent className="px-0 pb-0 pt-0">
    <WorkersTable … />
  </CardContent>
</Card>
```

Card bỏ padding ⇒ **BẮT BUỘC** `frontend-dev.mdc` §1.7a: cột đầu `pl-5`, cột cuối `pr-5`, áp cho
`TableHead` **và** mọi `TableCell`.

#### d) Cột — 6 cột, thứ tự cố định

| # | Cột | Class | Nội dung |
|---|---|---|---|
| 1 | Worker | `pl-5` | `description` dòng chính + `lockKey` dòng phụ `font-mono text-xs text-muted-foreground` (§2.5 cũ). `description === lockKey` → 1 dòng |
| 2 | Trạng thái | `w-28` | `<Badge variant={…}>` |
| 3 | Thành công gần nhất | `w-40` | `calcRelativeTime` + tooltip `displayVNDateTime` |
| 4 | Item kẹt | `w-24 text-right tabular-nums` | Số; `> 0` → button mở dialog chi tiết |
| 5 | Lỗi gần nhất | `max-w-xs truncate` | `lastError` + tooltip full text |
| 6 | Bật/tắt | `w-24 pr-5 text-center` | `Switch` |

Cột số right-aligned + `tabular-nums`, header `text-xs`, cell data `text-sm` — `frontend-dev.mdc` §1.2/§1.7.

**KHÔNG** `onClick` mở drawer ở `TableRow`: hàng đã chứa 2 control tương tác (Switch, button dialog).
Row clickable + control lồng bên trong buộc `stopPropagation` mọi chỗ — nguồn bug quen thuộc. Chi tiết
mở bằng button tường minh ở cột 4.

#### e) Badge trạng thái — label + variant khai ở PACKAGE, không ở component

`frontend-dev.mdc` PHẦN 2 **cấm** hardcode `Record<string, string>` label trong component;
`code-quality-standards.mdc` §5.3 buộc `const object as const`. Tiền lệ chuẩn nhất:
`packages/tenant-dispatch/src/shared/labels/dispatch-labels.ts:8-28` (export cả `_LABELS` và
`_VARIANT`) — đó là lý do §2.2 đặt `worker-core/src/shared/labels/`.

```typescript
// packages/worker-core/src/shared/labels/worker-labels.ts
export const WORKER_RUN_STATE_LABELS: Record<WorkerRunState, string> = {
  [WorkerRunState.Idle]: "Chờ lượt",
  [WorkerRunState.Running]: "Đang chạy",
  [WorkerRunState.Crashed]: "Chết giữa lượt",
  [WorkerRunState.Disabled]: "Đã tắt",
};

/** Badge variant — chỉ dùng variant CÓ SẴN của shadcn Badge, không thêm variant mới. */
export const WORKER_RUN_STATE_VARIANT: Record<WorkerRunState, "default" | "secondary" | "destructive" | "outline"> = {
  [WorkerRunState.Idle]: "secondary",
  [WorkerRunState.Running]: "default",
  [WorkerRunState.Crashed]: "destructive",
  [WorkerRunState.Disabled]: "outline",
};
```

Dùng kèm fallback theo tiền lệ (`accounts-table.tsx:22-33`):
`variant={WORKER_RUN_STATE_VARIANT[state] ?? "outline"}`.

`Record<WorkerRunState, …>` là có chủ đích: thêm member `WorkerRunState` mới thì compiler bắt mọi map
thiếu khoá (`code-quality-standards.mdc` §5.3).

#### f) Data fetching — React Query + `apiClient`, queryKey ở registry tập trung

```typescript
// _lib/use-queries.ts
import { apiClient, ApiClientError } from "@megawin/next/client";

export function useWorkersHealth() {
  return useQuery({
    queryKey: workersKeys.list(),
    queryFn: () => apiClient.get<WorkerHealthRow[]>("/system/workers"),
    staleTime: 10_000,
  });
}
```

`apiClient` path **không** có prefix `/api` và trả về **đã unwrap `data`** — đúng cách `audit-logs`,
`dispatch`, `tenants` đang dùng. KHÔNG `fetch` trần, KHÔNG SWR, KHÔNG `useSuspenseQuery` (0 tiền lệ).

queryKey **phải** khai ở registry, không inline (`frontend-dev.mdc` §4):

```typescript
// src/lib/query-keys/modules.ts  → thêm  workers: "workers"
// src/lib/query-keys/workers.ts
const MODULE = MODULES.workers;
export const workersKeys = {
  all: [MODULE] as const,          // bắt buộc mọi module đều có `all`
  list: () => [MODULE, "list"] as const,
};
// src/lib/query-keys/index.ts → export named + đăng ký vào aggregate `queryKeys`
```

Không polling (p1-01 §3 đã chốt) — nút "Làm mới" gọi `refetch()`, dim bảng khi `isFetching`
(`cn("…", isFetching && "opacity-60")` như `audit-logs-table.tsx:61`).

#### g) Toggle — Switch + AlertDialog confirm, theo `tenant-card.tsx`

Tiền lệ gần nhất là toggle status tenant (`tenants/_components/tenant-card.tsx:179-192`, `243-271`).
Mô hình bắt buộc:

1. `Switch.onCheckedChange` **KHÔNG** mutate — chỉ set state mở dialog. Tắt worker stats = dừng cập
   nhật toàn bộ ops ⇒ misclick không được phép có hiệu lực ngay.
2. State `pendingToggle: WorkerHealthRow | null` giữ ở **orchestrator** (`workers-content.tsx`), 1
   dialog dùng chung cho mọi dòng — theo `dispatch-content.tsx:33` (`cancelTx: string | null`).
   **KHÔNG** render 1 dialog/dòng.
3. Mutation gọi trong `AlertDialogAction.onClick` có `e.preventDefault()`, `onSuccess` đóng dialog.
4. `disabled={mutation.isPending}` trên Switch + `AlertDialogCancel` + `AlertDialogAction`; label
   action đổi thành `"Đang xử lý..."`.
5. `onSuccess`: `invalidateQueries({ queryKey: workersKeys.all })` + `toast.success` (sonner).
   `onError`: `toast.error(error instanceof ApiClientError ? error.message : "…")`. Toast nằm **trong
   hook mutation**, không ở component.
6. **KHÔNG** optimistic update (`onMutate`/`setQueryData`) — 0 tiền lệ trong repo, và trạng thái worker
   là dữ liệu server-authoritative.

Nội dung dialog phải nêu **hậu quả thật**, không chỉ hỏi "chắc chưa":
*"Tắt `keno:stats-sync`? Worker sẽ ngừng cập nhật thống kê cược Keno cho đến khi bật lại. Dữ liệu
không mất — worker chạy tiếp từ cursor hiện tại."*

Staff và Admin đều toggle được (quyết định 03/08/2026 — mọi lần đổi có audit log truy vết). FE
KHÔNG gate role: bỏ `canToggle`/`useSession`, Switch chỉ `disabled` khi mutation đang chạy. Route
vẫn chặn ở server bằng `.auth({ roles: [CompanyRole.Staff] })` — không dựa vào ẩn UI (rủi ro #1).

#### h) Trạng thái loading / empty / error — tiếng Việt, theo §1.6

```tsx
// Loading (audit-logs-table.tsx:40-47)
<div className="flex h-60 items-center justify-center gap-2 text-muted-foreground">
  <Loader2 className="size-4 animate-spin" />
  <span className="text-sm">Đang tải trạng thái worker…</span>
</div>

// Empty (audit-logs-table.tsx:49-57) — chưa worker nào ghi lock doc
<div className="flex h-60 flex-col items-center justify-center gap-1 text-center">
  <Inbox className="size-8 text-muted-foreground/40" />
  <p className="text-sm font-medium text-muted-foreground">Chưa có worker nào ghi nhận</p>
  <p className="text-xs text-muted-foreground">Worker tạo bản ghi ở lần chạy đầu tiên.</p>
</div>
```

Error: in message + **nút "Thử lại"** gọi `refetch()`, giữ nguyên frame (§1.6 yêu cầu có retry — các
trang cũ chỉ in `<p className="text-destructive text-sm">`, làm tốt hơn ở trang mới là được phép).

#### i) Thời gian tương đối — `calcRelativeTime`, KHÔNG thêm lib

`calcRelativeTime` từ `@megawin/shared/utils` (`packages/shared/src/utils/date.ts:346-360`) đã trả
tiếng Việt (`"5ph trước"`, `"2h trước"`). **KHÔNG** dùng `formatDistanceToNow` của `date-fns` (0 tiền
lệ) và **KHÔNG** thêm dayjs (`frontend-dev.mdc` §1.9 cấm thêm lib chưa approve).

Tự cập nhật: interval **15s** (không 1s) theo `draw-timeline.tsx:26-36`. Hook đó đang **local** trong
file nó, chưa export — copy vào `_lib/` của trang này, không refactor file dashboard (ngoài scope).

Tooltip hiện giờ tuyệt đối bằng `displayVNDateTime` (`date.ts:141`), `font-mono tabular-nums`.

#### j) Cách hiển thị `stalledItems`

Cột 4 hiện **số** (`stalledItems.length`), `0` → dấu `—` màu `text-muted-foreground` (KHÔNG hiện `0`
— `web-design-guidelines`: đừng vẽ nhiễu). `> 0` → `<Button variant="ghost" size="sm">` mở dialog.

Badge màu theo `STALLED_ALERT_THRESHOLD` (export từ p0-01 §2.2): `max(failCount) >= 3` →
`destructive`, dưới → `secondary`. **KHÔNG** hardcode số 3 ở FE.

Dialog: bảng con `itemKey` (`font-mono`) · `failCount` · "Kẹt bao lâu" (`calcRelativeTime(firstFailedAt)`)
· `lastError`. Dùng `Dialog` (không `Sheet`) — nội dung ngắn, ≤20 dòng.

#### k) Sort — client, ưu tiên dòng có vấn đề

`state === Crashed` hoặc `stalledItems.length > 0` lên đầu, còn lại theo `lockKey` asc (server đã sort).
Dùng `toSorted` (`vercel-react-best-practices` §7.12 — không mutate props). Tính **trong render**, không
`useState` + `useEffect` (§5.1). 15 dòng ⇒ **không** `useMemo` (§5.3).

#### l) Accessibility + polish (`web-design-guidelines`)

- `Switch` phải có `aria-label={\`Bật/tắt ${row.lockKey}\`}` — cột không có text label.
- Badge trạng thái không chỉ dựa vào màu: label chữ đã có, đủ.
- Dialog: focus trap của shadcn `AlertDialog`/`Dialog` lo sẵn — không tự làm.
- `lastError` truncate phải kèm `title`/tooltip, nếu không staff không đọc được lỗi thật.

### 2.5b. Cái KHÔNG dùng dù có sẵn trong repo

| Không dùng | Vì sao |
|---|---|
| `DataTable` + `useDataTableInstance` + `ColumnDef` | Pattern B dành cho bảng cần sort/faceted/pagination client. 15 dòng không cần; kéo theo `DataTablePagination` text tiếng Anh |
| `DataTableViewOptions` (§1.7 nói "mỗi table PHẢI có") | Chỉ có nghĩa với Pattern B. `audit-logs`/`dispatch` (Pattern A) đều không có — theo tiền lệ thực tế, không theo câu chữ |
| `nuqs` URL state | Không có filter nào ở v1 (15 dòng, xem hết trên 1 màn). Thêm `useQueryStates` cho trang không filter = code chết. Nếu sau này thêm filter thì mới tạo `_lib/use-filters.ts` |
| `FinancialDateRangePicker` | Không có chiều thời gian để filter — `worker_locks` chỉ có trạng thái hiện tại |
| KPI strip (§1.3 bước 3) | Bảng 15 dòng đã hiển thị tất cả. KPI "3 worker crashed" chỉ lặp lại thông tin ngay bên dưới |
| `formatNumber` từ `@megawin/shared/utils/number` | `failCount` là số nhỏ 1–2 chữ số, không phải cột tài chính (`financial-report-ui.mdc` §8 chỉ áp cho báo cáo tài chính) |

### 2.6. Quyền + audit

| Hành động | Quyền |
|---|---|
| GET (xem) | `CompanyRole.Staff` — đọc thuần, ops cần thấy |
| PATCH `isEnabled` | `CompanyRole.Staff` — Staff cần quản lý worker; mọi lần toggle ĐÃ ghi audit log (ai/lúc nào/before-after) nên đủ truy vết. **Quyết định 03/08/2026** (đổi từ bản đầu `Admin`) |

PATCH **phải ghi audit log** (`@megawin/audit`, tiền lệ các use-case update config game): ai tắt worker
nào, lúc nào. Đây là lý do cho phép Staff toggle mà vẫn an toàn — thao tác luôn truy được. Không ghi
thì sau này không truy được vì sao stats ngừng chạy.

`CompanyRole.Admin` là **super role** (`apps/backoffice/src/lib/api.ts:62-65`:
`createApiRouteBuilder({ superRoles: [CompanyRole.Admin] })`) ⇒ khai `.auth({ roles: [CompanyRole.Staff] })`
cho cả GET và PATCH là Admin tự pass, **không** phải liệt kê cả 2.

**FE không gate role toggle:** vì cả Staff và Admin đều có quyền, `workers-content.tsx` KHÔNG kiểm
`session.roles` để enable/disable Switch (bỏ `canToggle`/`useSession`) — mọi company account đều toggle
được. Switch chỉ disable khi mutation đang chạy (`isToggling`).

### 2.6b. Route API — `withApi()`, schema ở `_lib/schema.ts`

`frontend-dev.mdc` §5.1 + `mongodb.mdc` §4: route **bắt buộc** `withApi()`, **bắt buộc** Zod cho
query/body, **chỉ** gọi Use Case (không được `new WorkerLockRepository()`), use-case là **singleton
module-level**.

```
apps/backoffice/src/app/api/system/workers/
├── _lib/schema.ts
├── route.ts                 # GET
└── enabled/route.ts         # PATCH
```

```typescript
// route.ts — GET, theo tenant-dispatch/list/route.ts (13 dòng)
import { CompanyRole } from "@megawin/identity/entities";
import { ListWorkersHealthUseCase } from "@megawin/worker-core/use-cases/admin";

import { withApi } from "@/lib/api";

const useCase = new ListWorkersHealthUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => useCase.run());
```

```typescript
// enabled/route.ts — PATCH. Staff+ (audit log truy vết mọi lần toggle).
export const PATCH = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(setWorkerEnabledSchema)
  .handler(async ({ body, session, request }) =>
    useCase.run({ ...body, actor: actorFromSession(session!, request) }),
  );
```

```typescript
// _lib/schema.ts
export const setWorkerEnabledSchema = z.object({
  lockKey: z.string().min(1),
  isEnabled: z.boolean(),
});
```

**Body, KHÔNG dynamic segment `[lockKey]`** — `lockKey` chứa dấu `:` (`"keno:stats-sync"`), nhét vào
path buộc encode/decode 2 đầu. Tiền lệ `/api/tenants/status` cũng nhận `{ tenantId, status }` trong body.

GET **không** có `.query(...)`: v1 không filter (§2.5b). Thêm schema rỗng chỉ là noise — tiền lệ
`api/tenants/route.ts:28-33` cũng không có `.query`.

### 2.7. Sidebar

File: `apps/backoffice/src/navigation/sidebar/sidebar-items.ts` — group `id: 1` label `"Hệ thống"`
(`:73-91`), thêm sau "Lịch sử thao tác":

```typescript
      {
        title: "Sức khoẻ worker",
        url: "/system/workers",
        icon: Activity, // thêm vào barrel import sẵn có ở đầu file (dòng 3-26)
      },
```

`Activity` **đã có** trong barrel import của file này ⇒ không thêm dòng import nào. Icon truyền dạng
**component reference** (`icon: Activity`), không JSX — đúng type `NavSubItem.icon?: LucideIcon`.

Không set `roles` ở item (Staff xem được); phân quyền chỉ ở hành động toggle.

## 3. Cái KHÔNG làm

| Không làm | Vì sao |
|---|---|
| Auto-refresh / polling | Trang tra cứu khi có sự cố, không phải dashboard trực. Thêm nút "Làm mới" là đủ. Có thể thêm sau nếu ops yêu cầu |
| Nút "reset cursor" / "clear stalledItems" | Nguy hiểm (reset cursor = redo hoặc mất dữ liệu). Cần plan riêng có audit + confirm 2 bước |
| Đồ thị lịch sử lỗi | `worker_locks` chỉ lưu **trạng thái hiện tại**, không có time-series. Muốn lịch sử phải thêm collection — ngoài scope |
| Alert/email khi crashed | Kênh notification là hạ tầng riêng chưa có trong repo |
| Trang per-game | Cố ý dùng chung: sức khoẻ worker không thuộc game nào (đúng lý do bỏ `worker_stuck` khỏi `ops_alerts`) |
| Hiển thị doc `kind: business` (lock resettle) | Khác bản chất: dùng 1 lần, không cursor/kill-switch/stalledItems, số lượng tăng theo nghiệp vụ (analysis §2.4). Nếu sau này cần theo dõi resettle đang chạy thì làm trang riêng với phân trang |
| Khai `description` cho toàn bộ 9 worker | Field optional, thiếu thì hiện `lockKey` — không vỡ gì. Khai dần khi ai chạm worker đó. Nhồi 9 file vào PR này làm loãng review |
| Sửa/xoá `description` từ UI | Mô tả thuộc **code** (worker tự khai), không phải dữ liệu vận hành. Cho sửa từ UI là mở đường cho DB và code lệch nhau |

## 4. Đánh giá & verify

```bash
pnpm --filter @megawin/worker-core check-types
pnpm --filter backoffice check-types
pnpm --filter backoffice lint

# Bundle: worker KHÔNG được kéo @megawin/next qua import worker-core.
rg -n "@megawin/worker-core" apps/worker-*/src packages/game-*-application/src | rg -v "use-cases/admin"
# Mọi import phải là ./entities | ./repos | ./use-cases (KHÔNG ./use-cases/admin).
pnpm --filter @megawin/worker-keno check-types

# mongodb.mdc §4 — app KHÔNG được chạm repo.
rg -n "WorkerLockRepository" apps/backoffice/src          # kỳ vọng: 0
# frontend-dev.mdc §5.1 — route phải qua withApi().
rg -n "withApi\(\)" "apps/backoffice/src/app/api/system/workers"

# §2.5b — không kéo Pattern B (text tiếng Anh) vào trang mới.
rg -n "useDataTableInstance|DataTablePagination|ColumnDef" "apps/backoffice/src/app/(main)/system"  # kỳ vọng: 0
# §2.5e — label/variant KHÔNG hardcode ở FE.
rg -n "Đang chạy|Chết giữa lượt|Chờ lượt" apps/backoffice/src  # kỳ vọng: 0 (phải ở worker-core/shared/labels)
# §2.5j — không hardcode ngưỡng 3 ở FE.
rg -n "STALLED_ALERT_THRESHOLD" "apps/backoffice/src/app/(main)/system"  # phải CÓ, và không thấy số 3 trần
# §2.5i — không thêm lib thời gian.
rg -n "formatDistanceToNow|dayjs" "apps/backoffice/src/app/(main)/system"  # kỳ vọng: 0
# §4 query-keys — phải đăng ký registry.
rg -n "workers" apps/backoffice/src/lib/query-keys/
```

Kiểm tay:

1. Trang list đủ mọi worker: đối chiếu `db.worker_locks.countDocuments({kind:{$in:["worker",null]}})`.
2. **Doc `kind: "business"` KHÔNG xuất hiện.** Dựng ca test: `db.worker_locks.insertOne({lockKey:
   "keno:resettle:test", kind: "business", ownerToken: null, expiresAt: new Date(), acquiredAt: new
   Date(), isEnabled: true, cursor: null, lastSuccessAt: null, lastError: null, stalledItems: []})` →
   reload → không thấy dòng đó → xoá doc test.
3. **Doc cũ thiếu `kind` VẪN hiện** (`$unset` field `kind` của 1 doc worker → reload → còn thấy).
4. Worker đã khai `description` hiện mô tả + `lockKey` dòng phụ; worker chưa khai hiện 1 dòng `lockKey`.
5. Tắt 1 worker qua UI → doc `isEnabled: false` → worker log `"worker disabled, skip"`
   (`lock/single-run-worker.ts` bước kill-switch) → bật lại chạy tiếp.
6. Audit log có entry cho lần toggle.
7. Ép 1 kỳ lỗi (như p0-02 §4.3) → dòng worker hiện `stalledItems` với `failCount` tăng; sửa data →
   badge tự hết.
8. Đăng nhập role Staff → thấy trang VÀ dùng được Switch (toggle thành công, có audit entry).
9. **Route vẫn chặn ở SERVER cho người ngoài công ty:** gọi PATCH bằng session không phải company
   account (agent/player token) → phải **403**. Company Staff/Admin đều pass (quyết định 03/08/2026).
10. **UI:** bảng dính viền Card đúng `pl-5`/`pr-5`; cột "Item kẹt" right-aligned `tabular-nums`;
    `0` hiện `—` chứ không phải `0`; `lastError` dài có tooltip đọc được full.
11. **Confirm dialog:** bấm Switch → dialog mở, worker **chưa** đổi trạng thái; Huỷ → không có request
    nào (kiểm Network tab); Đồng ý → nút đổi "Đang xử lý...", Switch disabled, xong có toast + bảng
    refresh.
12. **Empty state:** rename tạm 1 lockKey trong DB cho trang trống → hiện "Chưa có worker nào ghi nhận",
    KHÔNG phải bảng trắng hay spinner vĩnh viễn.
13. **Thời gian tương đối** tự cập nhật sau ~15s mà không cần reload (mở trang, chờ, xem cột 3 đổi).
14. Dark mode: badge `destructive`/`secondary` còn đủ contrast; `text-muted-foreground` của `lockKey`
    dòng phụ vẫn đọc được.

## 5. Review code & rủi ro

> Chạy ở **task riêng SAU KHI code xong**.

| # | Rủi ro | Mức | Giảm nhẹ / điểm phải kiểm |
|---|---|---|---|
| 1 | PATCH `isEnabled` không kiểm quyền ở SERVER | 🟠 | Route handler `.auth({ roles: [Staff] })` — chặn ở server, không dựa vào ẩn UI. Staff+ được toggle (quyết định 03/08/2026: audit log truy vết mọi lần đổi), nhưng người ngoài company (agent/player) vẫn phải bị chặn ở route |
| 2 | Thiếu audit log cho toggle | 🟠 | §2.6 — bắt buộc. Không có thì không truy được nguyên nhân khi stats ngừng |
| 3 | Derive `crashed` ở client → lệch giờ báo sai | 🟠 | §2.3 — derive ở server, trả `state` + `secondsSinceSuccess` |
| 4 | Trả cả `WorkerLockEntity` qua RSC (có `ownerToken`, `id`) | 🟡 | `ownerToken` là token nội bộ, không nên lộ ra client. Chỉ trả `WorkerHealthRow` (§2.4) |
| 5 | Worker chưa chạy lần nào → không có doc → trang trống, ops tưởng lỗi UI | 🟡 | Empty state ghi rõ "chưa worker nào ghi nhận" + gợi ý. Cân nhắc list `lockKey` kỳ vọng từ hằng số nếu có registry (hiện chưa có → ghi thành nợ) |
| 6 | `lastError` chứa nội dung nhạy cảm (connection string, dữ liệu khách) | 🟡 | Message đã cắt 500 ký tự; trang chỉ Staff+ xem. Review đọc thử vài lỗi thật xem có leak không |
| 7 | 2 kênh tín hiệu song song nếu merge trước p0-02 | 🟠 | Xem `00-overview.md` §Thứ tự — merge sau p0-02, hoặc cùng sprint |
| 8 | Import icon qua barrel `lucide-react` | 🟢 | **ĐÃ RÀ, KHÔNG phải vấn đề:** `next.config.ts:12` bật `optimizePackageImports: ["lucide-react", …]` — Next tự chuyển thành direct import lúc build, đúng cách `vercel-react-best-practices` §2.1 nêu là hợp lệ. Toàn app dùng barrel; đi ngược 1 file là lệch convention. **KHÔNG "sửa"** thành `lucide-react/dist/esm/icons/...` |
| 9 | Dùng `listAll()` (hoặc filter `{kind:"worker"}` thuần) → trang flood doc resettle, hoặc trống trơn vì doc cũ thiếu `kind` | 🔴 | §2.1 + p0-01 §2.6c. Verify §4 bước 2 và 3 dựng đúng 2 ca này. Đây là điểm chết: sai kiểu nào cũng làm trang mất tác dụng, và triệu chứng dễ chẩn sai |
| 10 | Thêm dep `@megawin/next` vào `worker-core` làm phình bundle 9 worker Lambda | 🟡 | `use-cases/admin` là subpath riêng — worker không import thì không kéo vào. Verify §4 có grep chặn; đo `du -sh .serverless/*.zip` trước/sau nếu nghi |
| 11 | Fallback `description ?? lockKey` cài ở mapper thay vì use-case | 🟡 | Mất phân biệt "chưa khai" vs "khai bằng lockKey" (p0-01 §2.6a). Review kiểm mapper KHÔNG có `?? lockKey` |
| 12 | Cột Worker hiện `description` mà bỏ `lockKey` | 🟠 | Ops cần `lockKey` để tra mongo shell + đọc CloudWatch log. §2.5d yêu cầu 2 dòng |
| 13 | Route `new WorkerLockRepository()` trực tiếp (bỏ qua use-case) | 🔴 | `mongodb.mdc` §4 + §10 cấm tuyệt đối. Grep `WorkerLockRepository` trong `apps/backoffice` phải = **0** |
| 14 | Dùng `DataTable`/`DataTablePagination` → text tiếng Anh lọt vào trang | 🟠 | §2.5b. `data-table.tsx:53` hardcode `"No results."`, `data-table-pagination.tsx` hardcode `"Rows per page"`. Pattern A tự viết empty state tiếng Việt |
| 15 | Hardcode label/variant trạng thái trong component (`Record<string,string>` tại chỗ) | 🟠 | `frontend-dev.mdc` PHẦN 2 + `code-quality-standards.mdc` §5.3. Phải ở `worker-core/src/shared/labels/` với `Record<WorkerRunState, …>` để compiler bắt khoá thiếu (§2.5e) |
| 16 | `Switch.onCheckedChange` mutate ngay, không confirm | 🔴 | Misclick = dừng worker production. §2.5g: Switch chỉ mở `AlertDialog`; mutation ở `AlertDialogAction` |
| 17 | Render 1 `AlertDialog` cho MỖI dòng bảng | 🟡 | 15 portal cùng tồn tại, state rải rác. §2.5g: 1 dialog dùng chung + `pendingToggle` ở orchestrator (tiền lệ `dispatch-content.tsx:33`) |
| 18 | queryKey khai inline trong hook thay vì registry `src/lib/query-keys/` | 🟡 | `frontend-dev.mdc` §4 — `invalidateQueries({queryKey: workersKeys.all})` cần khoá tập trung, inline sẽ lệch giữa query và invalidate |
| 19 | Thiếu `pl-5`/`pr-5` ở cột đầu/cuối khi Card bỏ padding | 🟢 | `frontend-dev.mdc` §1.7a — bảng dính sát viền Card. Áp cho `TableHead` **và** `TableCell` |
| 20 | Thêm polling `refetchInterval` "cho tiện" | 🟡 | §3 đã chốt không polling: 9 worker × poll 30s = query DB vô ích 24/7 cho trang hầu như không ai mở. Nút "Làm mới" đủ |
| 21 | Tự thêm lib thời gian (`dayjs`, `date-fns/formatDistanceToNow`) | 🟠 | `calcRelativeTime` đã có sẵn và đã tiếng Việt (§2.5i). `frontend-dev.mdc` §1.9 cấm thêm lib chưa approve |
| 22 | `useState` + `useEffect` để sort/derive row | 🟡 | `vercel-react-best-practices` §5.1 — derive **trong render**. 15 dòng cũng không cần `useMemo` (§5.3) |

## 6. Rollback

Xoá route + trang + item sidebar + thư mục `worker-core/src/use-cases/admin` + `shared/labels` + 2
subpath export + 2 dep (`@megawin/next`, `@megawin/audit`). `listByKind` thuộc p0-01 nên **giữ lại**.
Không có side effect dữ liệu (trừ audit log của các lần toggle đã thực hiện — giữ, đó là lịch sử thật).
