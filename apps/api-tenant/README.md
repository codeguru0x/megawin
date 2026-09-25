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

## Rate limit

Ba endpoint đang deploy đều có trần GCRA. Vượt ngưỡng → **HTTP 429**, body envelope
`{ success: false, error: { code: "TOO_MANY_REQUESTS", message } }`, kèm header
`Retry-After` (giây, làm tròn lên, tối thiểu 1).

Quota **theo `tenantId`** — tenant A bị 429 không ảnh hưởng tenant B.

| Endpoint                      | Lớp        | `route`                      | Rule                     | `subject`                   |
| ----------------------------- | ---------- | ---------------------------- | ------------------------ | --------------------------- |
| `POST /tenant/players/login`  | Per-tenant | `tenant.player-login`        | 10 req / 1 giây, burst 0 | tenant                      |
| `POST /tenant/players/login`  | Per-player | `tenant.player-login.player` | 5 req / 60 giây, burst 0 | tenant + `playerExternalId` |
| `GET /tenant/bets/feed`       | 1 lớp      | `tenant.bets-feed`           | 3 req / 60 giây, burst 2 | tenant                      |
| `GET /tenant/reports/revenue` | 1 lớp      | `tenant.reports-revenue`     | 20 req / 60 giây         | tenant                      |

### Xử lý 429

1. Đọc `Retry-After` (giây). **Không** retry ngay.
2. Chờ đúng số giây rồi gọi lại. Retry storm làm cạn quota thêm.
3. Login: 5 lần / phút cho **một** player là đủ login + retry. Trần cả tenant là 10 login/giây
   (mỗi request cách nhau ít nhất 100ms).

### `GET /tenant/bets/feed` — dùng cursor, đừng poll lại từ đầu

Scheduler ghi feed **1 lần/phút**. Khi `hasMore = false`, chờ interval rồi poll lại — poll dày
hơn không nhận thêm data. Khi `hasMore = true`, được xả tối đa **3 page liền** (`1 + burst 2`),
mỗi page `limit` tối đa 200. Hết burst thì giãn ~20 giây.

Đừng reset `afterVersion` về đầu khi nhận 429 — giữ cursor, chờ `Retry-After`, poll tiếp.

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
