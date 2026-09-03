# ResultFeed — Trang quản lý Backoffice (chỉ Admin)

Tách từ `04-backoffice-api.plan.md`. Phạm vi: trang vận hành `(main)/resultfeed/*` + API nội bộ
`/api/resultfeed/*` (trừ `/results` — API key riêng, xem `08-vietlott-result-autofill.plan.md`).

## 0. Thay đổi so với bản `04` gốc

- `CompanyRole` (`packages/identity/src/entities/account.ts`) chỉ có `Admin`/`Staff` — **không có
  `Manager`**. Bỏ hẳn phân cấp Staff/Manager/Admin của `04` §3.
- **Toàn bộ menu + API ResultFeed chỉ `CompanyRole.Admin`** xem/gọi được — theo yêu cầu vận hành
  (staff test hiện tại KHÔNG được thấy menu này).
- Worker đã **auto-publish** khi máy quyết `Agreed`
  (`RESULTFEED_AUTO_PUBLISH_UNVERIFIED=true` — xem
  `packages/resultfeed-application/src/use-cases/consensus/tick.ts`) ⇒ action `…/publish` (Manager)
  của `04` **không cần xây**. Chỉ `verify`/`reject` (hàng đợi Conflict) là hành động người thật cần
  làm, đã có use-case sẵn.
- Bỏ `/submissions/[id]/raw` (Admin xem HTML gốc) khỏi phạm vi lần này — thêm sau nếu có nhu cầu
  điều tra cụ thể, không phải yêu cầu hiện tại.

## 1. RBAC — 2 lớp bảo vệ

### 1.1 Route API — `.auth({ roles: [CompanyRole.Admin] })`

`apps/backoffice/src/lib/api.ts` đã bind `superRoles: [CompanyRole.Admin]` cho
`createApiRouteBuilder` — khai `.auth({ roles: [CompanyRole.Admin] })` vẫn đúng ngữ nghĩa "chỉ
Admin", vì `hasSuperRole` chỉ có tác dụng NỚI quyền cho Admin ở route khai `roles: [Staff]`, không
làm Staff pass được route khai `roles: [Admin]`.

### 1.2 Page-level guard — MỚI, chưa có tiền lệ trong codebase

Hiện chỉ có route-level `.auth()` (chặn API) và client-side ẩn sidebar (`roles` trong
`NavMainItem`) — **không chặn được** truy cập trực tiếp URL `/resultfeed/...` khi đã login bằng
tài khoản Staff. Cần thêm 1 guard mới:

- Thêm hàm `requireRole(roles: AccountRole[])` vào
  [`apps/backoffice/src/lib/auth-server.ts`](../../../apps/backoffice/src/lib/auth-server.ts) —
  dùng `resolveAuthSession` (đã có ở `lib/auth-session.ts`, nhận `Headers`) để đọc `session.user.roles`,
  nếu không có bất kỳ role nào khớp thì `redirect("/dashboard")`.
- Gọi 1 LẦN trong `apps/backoffice/src/app/(main)/resultfeed/layout.tsx` (Server Component mới) —
  mọi page con (`page.tsx`, `review/page.tsx`, `periods/page.tsx`, `sources/page.tsx`) tự động
  được bảo vệ, không lặp lại guard ở từng page.

```typescript
// apps/backoffice/src/app/(main)/resultfeed/layout.tsx
import { CompanyRole } from "@megawin/identity/entities";

import { requireRole } from "@/lib/auth-server";

export default async function ResultFeedLayout({ children }: { children: React.ReactNode }) {
  await requireRole([CompanyRole.Admin]);
  return <>{children}</>;
}
```

### 1.3 Sidebar

Thêm 1 `NavMainItem` mới (nhóm "Hệ thống" — cạnh "Ứng dụng đối tác") trong
[`apps/backoffice/src/navigation/sidebar/sidebar-items.ts`](../../../apps/backoffice/src/navigation/sidebar/sidebar-items.ts):

```typescript
{
  title: "ResultFeed",
  url: "/resultfeed",
  icon: Radar, // hoặc icon phù hợp có sẵn trong lucide-react
  roles: [CompanyRole.Admin],
  subItems: [
    { title: "Hàng đợi duyệt", url: "/resultfeed/review", icon: AlertTriangle },
    { title: "Tra cứu kỳ", url: "/resultfeed/periods", icon: FileSearch },
    { title: "Nguồn dữ liệu", url: "/resultfeed/sources", icon: Settings2 },
  ],
},
```

## 2. Cấu trúc trang (rút gọn so với `04` §1)

```
apps/backoffice/src/app/(main)/resultfeed/
├── layout.tsx      ← page guard Admin-only (mục 1.2)
├── page.tsx        ← Dashboard: đếm theo state/game, alert mới (badge)
├── review/         ← Hàng đợi Conflict — verify/reject (giữ nguyên thiết kế UI `04` §2)
│   ├── page.tsx
│   └── _lib/
├── periods/        ← Tra cứu 1 kỳ: consensus + toàn bộ observations
│   └── page.tsx
└── sources/        ← Danh sách nguồn, sửa role/trustWeight/isEnabled
    └── page.tsx

apps/backoffice/src/app/api/resultfeed/
├── consensus/route.ts                                GET  list filter state/gameKey, cursor
├── consensus/[gameKey]/[drawPeriod]/route.ts          GET  chi tiết + observations
├── consensus/[gameKey]/[drawPeriod]/verify/route.ts   POST VerifyConsensusUseCase (đã có)
├── consensus/[gameKey]/[drawPeriod]/reject/route.ts   POST RejectConsensusUseCase (đã có)
├── observations/route.ts                              GET  tra theo gameKey+drawPeriod
├── sources/route.ts                                    GET · POST list · upsert role/trustWeight/isEnabled
├── alerts/route.ts                                     GET  badge dashboard (countNew)
└── _lib/schema.ts                                      Zod schema chung cho các route trên
```

`/results` không nằm trong nhóm route Admin-only — xem `08-vietlott-result-autofill.plan.md`
(auth bằng API key, không session).

## 3. Use-case mới (`packages/resultfeed-application/src/use-cases/`)

Đã có sẵn, tái dùng trực tiếp — không viết lại:
- `VerifyConsensusUseCase`, `RejectConsensusUseCase` (`use-cases/consensus/verify.ts`)
- `ObservationRepository.findByGameKeyAndPeriod`, `findRecentByGameKey`
- `AlertRepository.findByStatus`, `countNew`
- `ConsensusRepository.findConflictQueue`, `findPublished`
- `SourceRepository.listAll`, `upsertBySourceId`

Cần viết mới:

### 3.1 `sources/list-sources.ts` — `ListSourcesUseCase`

Wrap `SourceRepository.listAll()`. Input: none. Output: `SourceEntity[]`.

### 3.2 `sources/update-source.ts` — `UpdateSourceUseCase`

Wrap `SourceRepository.upsertBySourceId()`. Theo đúng ghi chú trong repo hiện tại (comment JSDoc
`upsertBySourceId`): *"đổi giá trị này qua backoffice là quyết định VẬN HÀNH nên caller (use-case)
phải tự audit log, repo không tự làm"* — use-case này **PHẢI** ghi audit log sau khi upsert thành
công, dùng action mới `resultfeed.update_source` (mục 5).

Input: `{ sourceId, fields: SourceEditableFields, accountId, username }`.

### 3.3 `consensus/list-consensus.ts` — `ListConsensusUseCase`

Filter theo `state`/`gameKey`, cursor-based (theo `updatedAt` hoặc `_id`, giống pattern
`findChangedSince`). Cần thêm method mới vào `ConsensusRepository` nếu `findConflictQueue`/
`findPublished` hiện có không đủ filter (vd cần cả `Pending` để phát hiện kỳ kẹt lâu không lên
consensus) — thêm `ConsensusRepository.findByStateWithCursor(state?, gameKey?, cursor?, limit)`.

### 3.4 Dashboard — đếm theo state

Thêm `ConsensusRepository.countByState(gameKey?: ResultFeedGameKey): Promise<Record<ConsensusState, number>>`
nếu cần biểu đồ tổng quan trên `page.tsx`. Có thể dùng aggregate `$group` theo `state`.

## 4. Zod schema (`app/api/resultfeed/_lib/schema.ts`)

- `listConsensusQuerySchema` — `{ state?, gameKey?, cursor?, limit? }`.
- `verifyConsensusSchema` — theo mẫu đã có trong `04` §3 (giữ nguyên).
- `rejectConsensusSchema` — `{ note: z.string().min(1) }` (bắt buộc lý do reject).
- `updateSourceSchema` — mirror `SourceEditableFields` (role, trustWeight, isEnabled, …).

Use-case **không** validate lại thứ Zod đã chặn (`code-quality-standards.mdc` §8) — trừ ràng buộc
phụ thuộc DB (kỳ tồn tại, state hiện tại cho phép sửa).

## 5. Audit log

Thêm action mới vào
[`packages/audit/src/entities/audit-log.enums.ts`](../../../packages/audit/src/entities/audit-log.enums.ts),
nhóm `resultfeed` (đã có `verifyConsensus`/`rejectConsensus`):

```typescript
resultfeed: {
  verifyConsensus: "resultfeed.verify_consensus",
  rejectConsensus: "resultfeed.reject_consensus",
  updateSource: "resultfeed.update_source", // MỚI
},
```

Cập nhật `packages/audit/src/entities/labels.ts` tương ứng — **bắt buộc**, `Record` ép kiểu sẽ báo
lỗi compile nếu quên.

## 6. Trang `review` — giữ nguyên thiết kế UI từ `04` §2

Không đổi phần thiết kế UI đã chốt:
- Diff nổi bật ở mức từng số (highlight số lệch).
- Hiện `IntrinsicState` (phân biệt `NotAvailable` vs `Passed`).
- Hiện `role` + `trustWeight` tách nhau.
- Bingo18 hiện cả thứ tự quay và dạng canonical.
- Bàn phím: `J`/`K` chuyển kỳ, `1`/`2` chọn nguồn, `Enter` xác nhận, `Esc` bỏ.
- Dùng `@megawin/ui` (shadcn) + React Query (SWR pattern) như các trang operations hiện có.

Chỉ đổi: nút "Publish" (Manager) ở `04` **bỏ hẳn** — sau khi verify, `VerifyConsensusUseCase` đã tự
set `publishedAt = now` (xem `packages/resultfeed-application/src/use-cases/consensus/verify.ts`),
không cần bước publish riêng.

## 7. Trang `periods` — tra cứu 1 kỳ (mới, rút gọn từ `04`)

Input: `gameKey` + `drawPeriod`. Hiển thị:
- Doc `consensus` hiện tại (state, numbers, decidedBy, publishedAt, humanVerify nếu có).
- Toàn bộ `observations` của kỳ đó (theo từng `sourceId`, `intrinsicState`, `numbersDisplay`).

Dùng lại UI card từ trang `review` (không phải xây lại từ đầu) — chỉ khác: không có action
verify/reject (view-only), vì đây là tra cứu, không phải hàng đợi xử lý.

## 8. Trang `sources` — quản lý nguồn

Bảng liệt kê `SourceEntity[]` (`sourceId`, `name`, `role`, `trustWeight`, `gameKeys`, `isEnabled`).
Form sửa (dialog) gọi `PATCH/POST /api/resultfeed/sources` → `UpdateSourceUseCase`. Đổi `role` của
nguồn là quyết định ảnh hưởng trực tiếp tới consensus — cần confirm dialog trước khi lưu.

## 9. Checklist

- [ ] `layout.tsx` chặn non-Admin truy cập trực tiếp URL `/resultfeed/*`.
- [ ] Mọi route `/api/resultfeed/*` (trừ `/results`) dùng `.auth({ roles: [CompanyRole.Admin] })`.
- [ ] Sidebar item `ResultFeed` chỉ hiện với `CompanyRole.Admin`.
- [ ] Không có route `…/publish` — verify đã tự publish.
- [ ] `UpdateSourceUseCase` ghi audit log `resultfeed.update_source`.
- [ ] Trang `review`: giữ đủ diff từng số, `IntrinsicState`, role/trustWeight tách nhau, Bingo18 2 dạng số.
- [ ] Trang `periods`: view-only, không có action ghi.
- [ ] Trang `sources`: confirm dialog trước khi đổi `role`/`isEnabled`.

## Việc KHÔNG làm

- Không xây `…/publish` (Manager) — auto-publish đã chạy ở worker.
- Không xây `/submissions` + `/submissions/[id]/raw` — ngoài phạm vi lần này.
- Không đổi `ConflictPolicy`/thuật toán consensus.
- Không đổi domain/entities `packages/resultfeed`.
