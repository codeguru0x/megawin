# @megawin/backoffice

Backoffice Dashboard — ứng dụng web quản trị hệ thống MegaWin cho operator và tenant.

## Loại app

| Thuộc tính | Giá trị |
|------------|---------|
| **Loại** | Web Application |
| **Framework** | Next.js 16 (App Router) |
| **UI** | React 19, TailwindCSS 4, Radix UI |
| **State** | Zustand, React Query |
| **Auth** | better-auth |

## Đối tượng sử dụng

### Operator (MegaWin team)

Quản trị viên hệ thống MegaWin — quản lý toàn bộ game, tài khoản, tài chính.

### Tenant (đối tác)

Đối tác xem báo cáo, kết quả, quản lý vé của players.

## Pages

### Operator pages (`/(operator)/`)

| Nhóm | Page | Mô tả |
|------|------|-------|
| **Accounts** | `/accounts/tenants` | Quản lý danh sách tenants |
| | `/accounts/company` | Quản lý tài khoản company |
| | `/accounts/agents` | Quản lý agents |
| | `/accounts/players` | Quản lý players |
| **Games — Keno** | `/games/keno/draws` | Quản lý kỳ quay Keno |
| | `/games/keno/config` | Cấu hình game Keno |
| | `/games/keno/prize-table` | Bảng giải thưởng Keno |
| | `/games/keno/financial-reports` | Báo cáo tài chính Keno |
| **Games — Lotto 5/35** | `/games/lotto535/draws` | Quản lý kỳ quay Lotto 5/35 |
| | `/games/lotto535/config` | Cấu hình game Lotto 5/35 |
| | `/games/lotto535/jackpot` | Quản lý jackpot |
| | `/games/lotto535/multi-draw` | Multi-draw management |
| | `/games/lotto535/pending-tickets` | Vé đang chờ xử lý |
| | `/games/lotto535/financial-reports` | Báo cáo tài chính Lotto 5/35 |
| **CRM** | `/crm` | Quản lý khách hàng |
| **Finance** | `/finance` | Quản lý tài chính |

### Tenant pages (`/(tenant)/`)

| Nhóm | Page | Mô tả |
|------|------|-------|
| **Lotto 5/35** | `/tenant/lotto535/reports` | Báo cáo Lotto 5/35 của tenant |
| | `/tenant/lotto535/results` | Kết quả kỳ quay |
| | `/tenant/lotto535/tickets` | Quản lý vé |

## Tech stack

| Thư viện | Vai trò |
|----------|---------|
| Next.js 16 | App Router, RSC, API routes |
| React 19 | UI rendering, React Compiler |
| TailwindCSS 4 | Styling |
| Radix UI | Headless UI components |
| React Query | Server state management, data fetching |
| React Hook Form + Zod | Form validation |
| Zustand | Client state management |
| Recharts | Charts, báo cáo |
| better-auth | Authentication |
| @dnd-kit | Drag and drop |
| Sonner | Toast notifications |
| cmdk | Command palette |

## Packages phụ thuộc

| Package | Vai trò |
|---------|---------|
| `@megawin/next` | Shared Next.js config, utilities |
| `@megawin/identity-application` | Identity use cases |
| `@megawin/identity-domain` | Domain entities |
| `@megawin/app-core` | Shared application core |
| `@megawin/shared` | Shared types |

## Scripts

```bash
# Development server
pnpm dev

# Production build
pnpm build

# Start production server
pnpm start

# Lint
pnpm lint

# Format code
pnpm format

# Check (lint + format)
pnpm check
pnpm check:fix
```
