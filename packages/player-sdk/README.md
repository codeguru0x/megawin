# @megawin/player-sdk

MegaWin Player SDK — thư viện cho đối tác (tenant) tích hợp game client.

Zero dependencies. Hỗ trợ Browser, React Native, Node.js.

## Cài đặt

```bash
# Cài từ file .tgz nhận từ MegaWin
npm install ./megawin-player-sdk-1.0.0.tgz
# hoặc
pnpm add ./megawin-player-sdk-1.0.0.tgz
```

Nâng cấp version mới:

```bash
npm install ./megawin-player-sdk-1.1.0.tgz
```

## Quickstart

```typescript
import { createPlayerClient } from "@megawin/player-sdk";

// 1. Tenant server lấy tokens từ MegaWin (server-to-server API)
const tokens = await yourServer.getPlayerTokens(playerId);

// 2. Tạo SDK client với tokens
const client = createPlayerClient({
  baseUrl: "https://api.megawin.com",
  tokens,
  onSessionExpired: () => {
    // Token hết hạn và refresh thất bại — redirect về login
    window.location.href = "/login";
  },
});

// 3. Gọi API — Bearer token tự inject, tự refresh trước 5 phút hết hạn
const balance = await client.player.getBalance();
```

## Auth Flow

```
┌──────────┐     ┌───────────────┐     ┌──────────────┐
│  Client   │     │ Tenant Server │     │ MegaWin API  │
│  (SDK)    │     │               │     │              │
└────┬─────┘     └──────┬────────┘     └──────┬───────┘
     │  1. Request       │                     │
     │  player tokens    │                     │
     │──────────────────>│                     │
     │                   │  2. Server-to-server│
     │                   │  auth (API key)     │
     │                   │────────────────────>│
     │                   │                     │
     │                   │  3. Return tokens   │
     │                   │<────────────────────│
     │  4. Tokens        │                     │
     │<──────────────────│                     │
     │                   │                     │
     │  5. API calls (Bearer token auto-inject)│
     │─────────────────────────────────────────>
     │                                         │
     │  6. Auto-refresh trước 5 phút hết hạn   │
     │─────────────────────────────────────────>
```

**SDK KHÔNG gọi authenticate.** Tokens được truyền trực tiếp từ tenant server.

## Imports

| Import path                    | Nội dung                 |
| ------------------------------ | ------------------------ |
| `@megawin/player-sdk`          | Client, auth, API types  |
| `@megawin/player-sdk/keno`     | Keno enums + types       |
| `@megawin/player-sdk/lotto535` | Lotto 5/35 enums + types |

## API Reference

### Khởi tạo client

```typescript
import { createPlayerClient } from "@megawin/player-sdk";

const client = createPlayerClient({
  // [Bắt buộc] Base URL của MegaWin API Gateway
  baseUrl: "https://api.megawin.com",

  // [Tùy chọn] Tokens nhận từ tenant server — sẵn sàng gọi API ngay
  tokens: {
    accessToken: "eyJ...",
    refreshToken: "abc...",
    expiresAt: 1740500000000, // epoch ms
  },

  // [Tùy chọn] Custom storage để persist tokens qua page reload
  tokenStorage: {
    getTokens: () => JSON.parse(localStorage.getItem("mw_tokens") ?? "null"),
    setTokens: (t) => localStorage.setItem("mw_tokens", JSON.stringify(t)),
    clearTokens: () => localStorage.removeItem("mw_tokens"),
  },

  // [Tùy chọn] Callback khi session hết hạn (refresh thất bại / 401)
  onSessionExpired: () => {
    window.location.href = "/login";
  },

  // [Tùy chọn] Callback lỗi chung — log, toast, tracking
  onError: (error) => {
    console.error(`[MegaWin] ${error.code}: ${error.message}`);
  },

  // [Tùy chọn] Request timeout (ms). Mặc định: 30000
  timeout: 15000,

  // [Tùy chọn] Headers gửi kèm mọi request
  headers: { "X-Tenant-Id": "tenant-abc" },
});
```

### `client.auth` — Token Lifecycle

```typescript
// Set tokens (nếu không truyền trong config)
await client.auth.setTokens({
  accessToken: "eyJ...",
  refreshToken: "abc...",
  expiresAt: Date.now() + 3600_000,
});

// Kiểm tra session
const isAuth = await client.auth.isAuthenticated();

// Lấy access token hiện tại (tự refresh nếu sắp hết hạn)
const token = await client.auth.getAccessToken();

// Logout — revoke trên server + xóa local
await client.auth.logout();
```

### `client.keno` — Game Keno

```typescript
import type { KenoTicketPurchaseInput } from "@megawin/player-sdk/keno";

// Đặt cược Keno
// Số Keno dạng string zero-padded: "01" đến "80"
const result = await client.keno.placeBet({
  startDrawId: "2026-02-25-001", // Format: YYYY-MM-DD-NNN
  drawCount: 5,                  // 1-20 kỳ liên tiếp
  boards: [
    { boardNo: "A", numbers: ["01", "15", "33", "44", "60"] },
    { boardNo: "B", numbers: ["22", "44", "66"] },
  ],
  sideBets: [
    { playType: "bigSmall", bet: "big" },
    { playType: "evenOdd", bet: "even" },
  ],
});

console.log(result.ticketId);    // "TKT-..."
console.log(result.ticketNo);    // "K-20260225-001-0001"
console.log(result.totalAmount); // 70000
```

### `client.lotto535` — Game Lotto 5/35

```typescript
import type { Lotto535TicketPurchaseInput } from "@megawin/player-sdk/lotto535";

// Đặt cược Lotto 5/35
// Số chính: "01"-"35", số đặc biệt: "01"-"12"
const result = await client.lotto535.placeBet({
  drawId: "2026-02-25-001",   // Format: YYYY-MM-DD-NNN
  drawCount: 3,                // 1-6 kỳ liên tiếp
  boards: [
    {
      boardNo: "A",
      playType: "standard",    // 5 chính + 1 đặc biệt
      selection: {
        mainNumbers: ["01", "08", "15", "22", "35"],
        specialNumbers: ["07"],
      },
    },
    {
      boardNo: "B",
      playType: "mainCover",   // 6-15 chính + 1 đặc biệt (bao)
      selection: {
        mainNumbers: ["02", "05", "10", "15", "20", "25", "30"],
        specialNumbers: ["12"],
      },
    },
  ],
});
```

**Kiểu chơi (`playType`):**

| Value            | Mô tả                      | Số lines |
|------------------|-----------------------------|----------|
| `"standard"`     | 5 chính + 1 đặc biệt       | 1        |
| `"mainCover4"`   | 4 chính + 1 đặc biệt       | 31       |
| `"mainCover"`    | 6-15 chính + 1 đặc biệt    | C(N,5)   |
| `"specialCover"` | 5 chính + 2-12 đặc biệt    | K        |
| `"quickPick"`    | Máy chọn ngẫu nhiên        | 1        |

### `client.player` — Player Info

```typescript
// Số dư
const balance = await client.player.getBalance();
console.log(balance.balance);  // 500000
console.log(balance.currency); // "VND"

// Lịch sử cược (phân trang, lọc theo game)
const history = await client.player.getBetHistory({
  gameId: "keno",     // Tùy chọn: "keno" | "lotto535"
  page: 1,
  pageSize: 10,
});

for (const bet of history.bets) {
  console.log(bet.ticketNo, bet.totalAmount, bet.status);
}

// Kết quả game
const result = await client.player.getGameResult("keno", "2026-02-25-001");
console.log(result.status);      // "completed"
console.log(result.publishedAt); // "2026-02-25T13:05:00Z"
```

### `client.api` — Raw HTTP Client

Cho các endpoint chưa có wrapper method:

```typescript
// GET với Bearer token tự inject
const data = await client.api.get<MyType>("/player/custom-endpoint");

// POST
const result = await client.api.post<Result>("/player/custom", { key: "value" });

// Bypass auth cho public route
const info = await client.api.get("/public/info", {
  headers: { Authorization: "" },
});
```

## Error Handling

Tất cả API methods throw `ApiClientError` khi lỗi:

```typescript
import { ApiClientError } from "@megawin/player-sdk";

try {
  await client.keno.placeBet({ ... });
} catch (error) {
  if (error instanceof ApiClientError) {
    console.error(error.code);      // "INSUFFICIENT_BALANCE"
    console.error(error.message);   // "Không đủ số dư"
    console.error(error.status);    // 400
    console.error(error.requestId); // "req-abc-123" (cho support)
  }
}
```

**Các error code thường gặp:**

| Code                   | HTTP | Mô tả                              |
|------------------------|------|-------------------------------------|
| `UNAUTHORIZED`         | 401  | Chưa xác thực hoặc token hết hạn   |
| `INSUFFICIENT_BALANCE` | 400  | Không đủ số dư                      |
| `DRAW_CLOSED`          | 400  | Kỳ quay đã đóng bán                |
| `VALIDATION_ERROR`     | 400  | Input không hợp lệ                 |
| `NOT_FOUND`            | 404  | Resource không tồn tại             |
| `TIMEOUT`              | 408  | Request timeout                    |
| `NETWORK_ERROR`        | 0    | Lỗi mạng / không kết nối được      |

## Tương thích

- **Browser**: Chrome, Firefox, Safari, Edge (modern)
- **React Native**: 0.70+
- **Node.js**: 22+ (native fetch)
- **Module**: ESM + CommonJS
- **TypeScript**: Đầy đủ type declarations
