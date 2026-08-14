# p0-01 — AI Panel Shell: khung panel, responsive 4 tầng, toggle & persist state

> **Nguồn:** `.cursor/plans/ai-panel/00-overview.md`
> **Phụ thuộc:** không — làm độc lập, test được với placeholder content trước khi có chat.

Plan này dựng **khung panel** hoàn chỉnh: provider, frame docked/overlay/drawer, toggle 3 entry
points, resize, persist state. Nội dung bên trong panel tạm là placeholder — p0-03 lắp chat vào.

## Pattern tham chiếu (copy, không sáng tác)

| Việc | File mẫu |
|---|---|
| Đọc cookie server-side → prop cho provider (anti-flicker) | `apps/backoffice/src/app/(main)/layout.tsx` dòng 20–25 (`sidebar_state`, `getPreference`) |
| Const options + type dẫn xuất cho preference values | `apps/backoffice/src/lib/preferences/layout.ts` |
| Set cookie từ client | `apps/backoffice/src/server/server-actions.ts` (`setValueToCookie`) |
| Provider Zustand vanilla + context + selector hook | `apps/backoffice/src/stores/preferences/preferences-provider.tsx` |
| Phím tắt global (pattern listener) | `apps/backoffice/src/components/sidebar/search-dialog.tsx` dòng 32–41 |
| Sidebar context (đọc/collapse sidebar trái) | `apps/backoffice/src/components/ui/sidebar.tsx` (`useSidebar`) |

## 1. State model

### 1.1. Persist qua cookie (khai báo trong `src/lib/preferences/ai-panel.ts` — file MỚI)

```typescript
// Theo pattern layout.ts — const array + type dẫn xuất
export const AI_PANEL_STATE_VALUES = ["open", "closed"] as const;
export type AiPanelState = (typeof AI_PANEL_STATE_VALUES)[number];

/** Giới hạn width panel (px). */
export const AI_PANEL_MIN_WIDTH = 340;
export const AI_PANEL_MAX_WIDTH = 480;
export const AI_PANEL_DEFAULT_WIDTH = 400;
```

Cookie keys: `ai_panel_state` (`"open" | "closed"`, default `"closed"`),
`ai_panel_width` (số px dạng string, clamp về [340, 480] khi đọc).

### 1.2. Runtime state (KHÔNG persist) — sống trong `AiPanelProvider`

```typescript
export const AiPanelMode = {
  /** Docked: panel là flex item, bóp content. */
  Docked: "docked",
  /** Overlay: panel fixed đè lên content, không bóp. */
  Overlay: "overlay",
  /** Drawer: mobile <768px, vaul full-height. */
  Drawer: "drawer",
} as const;
export type AiPanelMode = (typeof AiPanelMode)[keyof typeof AiPanelMode];
```

`mode` là **derived state** — tính từ viewport + sidebar state + panel width, KHÔNG cho user chọn.

## 2. Files tạo mới / sửa

```
apps/backoffice/src/
├── lib/preferences/ai-panel.ts                    [MỚI] consts §1.1
├── components/ai-panel/
│   ├── ai-panel-provider.tsx                      [MỚI] context {state, actions, meta}
│   ├── ai-panel.tsx                               [MỚI] frame: docked <aside> / overlay fixed / vaul Drawer
│   ├── ai-panel-trigger.tsx                       [MỚI] nút header (icon Sparkles + kbd ⌘I)
│   └── use-ai-panel-mode.ts                       [MỚI] hook derive mode (§3)
├── app/(main)/layout.tsx                          [SỬA] đọc cookie, mount provider + panel + trigger
└── components/sidebar/search-dialog.tsx           [SỬA — ở p0-03] thêm CommandItem "Hỏi AI"
```

### 2.1. `ai-panel-provider.tsx` — contract

```typescript
interface AiPanelContextValue {
  state: {
    open: boolean;
    width: number;            // px, chỉ áp dụng docked/overlay
    mode: AiPanelMode;        // derived — xem §3
  };
  actions: {
    setOpen: (open: boolean) => void;   // đồng bộ cookie (setValueToCookie, fire-and-forget với void)
    toggle: () => void;
    setWidth: (width: number) => void;  // clamp + debounce 300ms ghi cookie
  };
  meta: {
    panelRef: React.RefObject<HTMLDivElement | null>;
  };
}
```

- Props từ server: `defaultOpen: boolean`, `defaultWidth: number` (đọc cookie ở layout — không flicker).
- Provider đặt **BÊN TRONG** `SidebarProvider` (cần `useSidebar()` cho auto-collapse §3.2).
- Dùng `use(AiPanelContext)` (React 19) trong consumer hook `useAiPanel()`, throw nếu thiếu provider
  — theo pattern `usePreferencesStore`.

### 2.2. `ai-panel.tsx` — frame theo mode

- **Docked**: `<aside>` là flex sibling của `SidebarInset` bên trong `SidebarProvider` (SidebarProvider
  render flex wrapper sẵn — xem `ui/sidebar.tsx`). Width từ state, `border-l bg-background`.
  KHÔNG dùng shadcn `Sidebar side="right"` — nó chia sẻ open-state với `SidebarProvider` của sidebar
  trái (1 provider = 1 state), lồng 2 provider phức tạp hơn `<aside>` thuần.
- **Overlay**: `fixed inset-y-0 right-0 z-40 shadow-xl`, non-modal (KHÔNG backdrop, KHÔNG khóa scroll)
  — staff vẫn cuộn content đối chiếu. `Esc` đóng (chỉ overlay mode). Animation `translate-x` 200ms.
- **Drawer**: vaul `Drawer` (đã có dependency) full-height, `direction="right"`.
- **Resize handle**: mép trái panel (docked + overlay), pointer events, clamp [340, 480].
  Khi drag: cập nhật width qua ref + `style.width` trực tiếp (tránh re-render mỗi px —
  `useRef` cho transient value), commit vào state + cookie khi pointerup.
- Body panel bọc `<Activity mode={open ? "visible" : "hidden"}>` (React 19.2) — nội dung
  KHÔNG unmount khi đóng → p0-03 hưởng: messages/scroll/draft giữ nguyên. Với Drawer mode
  (vaul mount/unmount theo open), Activity đặt ở provider-level quanh children chung —
  xem §4 sơ đồ mount.

### 2.3. Sửa `(main)/layout.tsx`

```tsx
// Thêm vào Promise.all hiện có (KHÔNG thêm await tuần tự — rule waterfall):
const [variant, collapsible, aiPanelState, aiPanelWidthRaw] = await Promise.all([
  getPreference("sidebar_variant", SIDEBAR_VARIANT_VALUES, "inset"),
  getPreference("sidebar_collapsible", SIDEBAR_COLLAPSIBLE_VALUES, "icon"),
  getPreference("ai_panel_state", AI_PANEL_STATE_VALUES, "closed"),
  getValueFromCookie("ai_panel_width"),
]);
```

Cấu trúc JSX mới (panel là sibling của SidebarInset):

```tsx
<SidebarProvider defaultOpen={defaultOpen}>
  <AiPanelProvider defaultOpen={aiPanelState === "open"} defaultWidth={aiPanelWidth}>
    <AppSidebar ... />
    <SidebarInset ...>
      <header>
        ...
        <div className="flex items-center gap-2">
          <AiPanelTrigger />          {/* MỚI — trước ThemeSwitcher */}
          <ThemeSwitcher />
          <AccountSwitcher />
        </div>
      </header>
      <div className="h-full p-4 md:p-6">{children}</div>
    </SidebarInset>
    <AiPanel />                        {/* docked = flex sibling; overlay/drawer tự fixed */}
  </AiPanelProvider>
</SidebarProvider>
```

Lưu ý variant `inset`: `SidebarInset` có margin rules riêng (dòng 33–36 layout hiện tại) — khi panel
docked mở, kiểm tra visual margin phải (`mr-2`) không double với border panel; chỉnh bằng
data-attribute `[data-ai-panel=open]` trên wrapper nếu cần.

## 3. Responsive — spec bắt buộc test kỹ

### 3.1. Bảng hành vi (nguyên tắc: chỉ hy sinh MỘT trục không gian tại một thời điểm)

| Điều kiện | Sidebar trái | Panel mode | Content |
|---|---|---|---|
| `fits(viewport, sidebarFull, panelW)` | Giữ nguyên | Docked | Bóp, vẫn ≥ `CONTENT_MIN` |
| `fits(viewport, sidebarIcon, panelW)` nhưng KHÔNG fits với sidebar full | **Auto-collapse icon** (§3.2) | Docked | Ưu tiên số 1 |
| Không fits kể cả sidebar icon, viewport ≥768px | Icon (đã collapse) | **Overlay** | Full width, bị che phần phải |
| Viewport <768px | Offcanvas (mặc định mobile) | **Drawer** | Full width |

```typescript
/** Bảng báo cáo tài chính ~10 cột cần tối thiểu ~880px hữu dụng. */
const CONTENT_MIN = 880;
const SIDEBAR_FULL = 256;  // đọc từ SIDEBAR_WIDTH của ui/sidebar.tsx nếu đã export
const SIDEBAR_ICON = 48;

const fits = (viewport: number, sidebar: number, panel: number) =>
  viewport - sidebar - panel >= CONTENT_MIN;
```

### 3.2. Auto-collapse sidebar trái (hook `use-ai-panel-mode.ts`)

- Khi panel chuyển sang open ở tầng 2: gọi `useSidebar().setOpen(false)` và **ghi nhớ flag
  `restoreSidebar` (useRef)** = sidebar đang open trước đó.
- Khi panel đóng: nếu `restoreSidebar` → `setOpen(true)`; nếu user vốn để sidebar đóng → KHÔNG ép mở.
- Nếu user tự mở lại sidebar trong lúc panel mở → tôn trọng (xoá flag), mode re-derive
  (có thể rơi xuống overlay).
- Viewport listener: dùng `matchMedia` cho ngưỡng 768px + resize listener (passive) debounce 100ms
  cho phép tính `fits`. Derive `mode` trong render từ measured viewport state —
  KHÔNG setState trong effect theo từng px (rule §5.6: subscribe derived boolean).

### 3.3. Transition

- Sidebar collapse + panel mở chạy **đồng thời** cùng duration 200ms ease-linear (khớp
  `transition-[width,height] ease-linear` của header hiện tại) — không "giật hai nhịp".
- Panel đóng: ngược lại, restore sidebar cùng nhịp.

## 4. Toggle & persist — spec "bật tắt phải chuẩn"

Sơ đồ mount (điểm quyết định để state chat sống sót):

```
AiPanelProvider (LUÔN mounted ở layout — giữ chat state ở p0-03)
└── AiPanel (LUÔN mounted)
    ├── docked/overlay: <aside>/<div fixed> — ẨN bằng Activity, KHÔNG unmount
    │   └── <Activity mode={open ? "visible" : "hidden"}>{panelBody}</Activity>
    └── drawer: vaul Drawer — DOM unmount theo vaul, nhưng panelBody state nằm ở
        provider (p0-03: useChat trong provider) nên messages không mất
```

Checklist hành vi bắt buộc:

- [ ] Toggle bằng: nút header, `⌘I`, (p0-03) command palette. Cả 3 đi qua CÙNG `actions.toggle()`.
- [ ] `⌘I` listener: `document.addEventListener("keydown", ...)` theo pattern search-dialog;
      KHÔNG đăng ký khi đang focus input/textarea ngoài panel? — KHÔNG cần, `⌘I` là combo an toàn.
- [ ] Mở → đóng → mở: scroll position + nội dung giữ nguyên (Activity, verify bằng mắt).
- [ ] Set cookie `ai_panel_state` mỗi lần toggle (server action `setValueToCookie`, gọi
      `void setValueToCookie(...)` — floating promise phải void tường minh).
- [ ] Reload khi panel đang mở: SSR đọc cookie → render panel mở NGAY, không flash đóng-rồi-mở.
- [ ] Resize width → reload: width giữ nguyên (cookie), clamp nếu cookie bị sửa tay ngoài range.
- [ ] Đổi route giữa lúc panel mở (layout persistent trong App Router): panel + state giữ nguyên.
- [ ] `Esc` chỉ đóng ở overlay/drawer mode; docked KHÔNG phản ứng Esc.

## 5. Verify

1. `pnpm --filter @megawin/backoffice check-types` + `biome check apps/backoffice/src/components/ai-panel apps/backoffice/src/app/\(main\)/layout.tsx`.
2. Test tay ma trận viewport (DevTools responsive): 1728, 1512, 1280, 1024, 900, 768, 390 —
   đối chiếu bảng §3.1 từng dòng, cả 2 chiều mở→thu nhỏ và thu nhỏ→mở.
3. Chạy checklist §4 đầy đủ.
4. Kiểm tra cả 3 sidebar variant (`sidebar`/`inset`/`floating`) × panel docked — layout không vỡ.
