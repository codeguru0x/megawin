# @megawin/api-player

Player-facing Game API — API cho người chơi đặt cược, xem số dư, lịch sử và kết quả game.

## Loại app

| Thuộc tính | Giá trị |
|------------|---------|
| **Loại** | API Gateway (Serverless Lambda + API Gateway v2) |
| **Runtime** | Node.js 24, AWS Lambda |
| **Framework** | Serverless Framework v4 |
| **Build** | esbuild |

## Đối tượng sử dụng

**Player (người chơi) — gọi qua Player SDK (`@megawin/player-sdk`)**

Đây là API mà player client gọi để đặt cược, xem số dư, lịch sử cược và kết quả game. Player sử dụng `@megawin/player-sdk` (do tenant distribute) để gọi các endpoint này. SDK tự inject Bearer token và xử lý refresh.

## Authentication

- **Bearer Token (Cognito)** — mỗi request gửi `Authorization: Bearer <accessToken>`
- Token được cấp từ tenant server thông qua server-to-server API
- API Gateway authorizer verify token qua Cognito JWKS

## Endpoints

| Method | Path | Handler | Mô tả |
|--------|------|---------|-------|
| `POST` | `/player/keno/bets` | `place-bet-keno` | Đặt cược game Keno |
| `POST` | `/player/lotto535/bets` | `place-bet-lotto535` | Đặt cược game Lotto 5/35 |
| `GET` | `/player/balance` | `get-balance` | Lấy số dư tài khoản player |
| `GET` | `/player/bets` | `get-bet-history` | Lịch sử cược (phân trang, lọc theo game) |
| `GET` | `/player/games/{gameId}/results/{roundId}` | `get-game-result` | Kết quả kỳ quay cụ thể |

## Packages phụ thuộc

| Package | Vai trò |
|---------|---------|
| `@megawin/auth` | Authorization middleware, Bearer token verify |
| `@megawin/game-keno` | Domain logic game Keno |
| `@megawin/game-keno-application` | Use cases Keno — place bet, get result |
| `@megawin/game-lotto535` | Domain logic game Lotto 5/35 |
| `@megawin/game-lotto535-application` | Use cases Lotto 5/35 — place bet, get result |
| `@megawin/identity-application` | Player identity, token verification |
| `@megawin/identity-domain` | Domain entities — Player, Tenant |
| `@megawin/game-core` | Shared game domain (Draw, Entry, Board) |
| `@megawin/tenant-gateway` | Multi-tenant data routing |
| `@megawin/app-core` | Lambda middleware, HTTP helpers |
| `@megawin/shared` | Shared types, API response format |

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
│   ├── bet-endpoint.yml          # Keno + Lotto535 place bet routes
│   ├── balance-endpoint.yml      # Player balance route
│   └── game-endpoint.yml         # Game result + bet history routes
└── handlers/
    ├── place-bet-keno.ts         # POST /player/keno/bets
    ├── place-bet-lotto535.ts     # POST /player/lotto535/bets
    ├── get-balance.ts            # GET /player/balance
    ├── get-bet-history.ts        # GET /player/bets
    └── get-game-result.ts        # GET /player/games/{gameId}/results/{roundId}
```
