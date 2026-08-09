# @megawin/api-tenant

Tenant Management API — API cho đối tác (tenant) quản lý players, xem báo cáo doanh thu và feed dữ liệu.

## Loại app

| Thuộc tính    | Giá trị                                          |
| ------------- | ------------------------------------------------ |
| **Loại**      | API Gateway (Serverless Lambda + API Gateway v2) |
| **Runtime**   | Node.js 24, AWS Lambda                           |
| **Framework** | Serverless Framework v4                          |
| **Build**     | esbuild                                          |

## Đối tượng sử dụng

**Tenant (đối tác) — gọi từ tenant server hoặc tenant backoffice**

API này dành cho tenant server gọi server-to-server để quản lý players, xem báo cáo doanh thu, lấy feed entries. Tenant dùng API key để xác thực.

Các tác vụ chính:

- Quản lý player lifecycle (danh sách, chi tiết, suspend/unsuspend)
- Player login (server-to-server) — tenant server lấy tokens cho player
- Báo cáo doanh thu
- Entry feed — đồng bộ dữ liệu vé cược

## Authentication

- **API Key** — verify qua `tenant-api-key-auth` middleware
- Tenant gửi API key trong header, middleware xác thực và inject tenant context

## Endpoints

| Method  | Path                                | Handler             | Mô tả                                       |
| ------- | ----------------------------------- | ------------------- | ------------------------------------------- |
| `GET`   | `/tenant/players`                   | `list-players`      | Danh sách players của tenant (phân trang)   |
| `GET`   | `/tenant/players/{playerId}`        | `get-player-detail` | Chi tiết player                             |
| `PATCH` | `/tenant/players/{playerId}/status` | `suspend-player`    | Suspend / unsuspend player                  |
| `POST`  | `/tenant/players/login`             | `player-login`      | Player login — trả tokens cho tenant server |
| `GET`   | `/tenant/reports/revenue`           | `get-reports`       | Báo cáo doanh thu                           |
| `GET`   | `/tenant/entries/feed`              | `get-entry-feed`    | Entry feed (polling)                        |

## Packages phụ thuộc

| Package                          | Vai trò                                    |
| -------------------------------- | ------------------------------------------ |
| `@megawin/auth`                  | Authorization middleware, API key verify   |
| `@megawin/identity-application`  | Use cases — player management, tenant auth |
| `@megawin/identity-domain`       | Domain entities — Tenant, Player           |
| `@megawin/game-core`             | Shared game domain (Draw, Entry)           |
| `@megawin/game-core-application` | Use cases — reports, entry feed            |
| `@megawin/app-core`              | Lambda middleware, HTTP helpers            |
| `@megawin/shared`                | Shared types, API response format          |

## Scripts

```bash
# Type check
pnpm check-types

# Local development (serverless-offline)
npx serverless offline

# Deploy lên AWS
npx serverless deploy
```

## Cấu trúc thư mục

```
src/
├── functions/
│   ├── player-management-endpoint.yml  # Player CRUD + login routes
│   ├── report-endpoint.yml             # Revenue report route
│   └── entry-feed-endpoint.yml         # Entry feed route
└── handlers/
    ├── list-players.ts                 # GET /tenant/players
    ├── get-player-detail.ts            # GET /tenant/players/{playerId}
    ├── suspend-player.ts               # PATCH /tenant/players/{playerId}/status
    ├── player-login.ts                 # POST /tenant/players/login
    ├── get-reports.ts                  # GET /tenant/reports/revenue
    └── get-entry-feed.ts              # GET /tenant/entries/feed
```
