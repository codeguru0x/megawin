# @megawin/player-sdk

MegaWin Player SDK — thư viện cho đối tác (tenant) tích hợp game client.

Zero dependencies. Hỗ trợ Browser, React Native, Node.js.

## Cài đặt

### NPM / pnpm / yarn

Tải file `.tgz` mới nhất và cài đặt:

```bash
# Tải bản mới nhất
curl -O https://megawin-sdk.s3.ap-southeast-1.amazonaws.com/player-sdk/latest/megawin-player-sdk.tgz

# Cài đặt
npm install ./megawin-player-sdk.tgz
# hoặc
pnpm add ./megawin-player-sdk.tgz
# hoặc
yarn add file:./megawin-player-sdk.tgz
```

Nâng cấp version mới — chạy lại lệnh trên, package manager tự thay thế bản cũ.

Tải phiên bản cụ thể (thay `v1.0.0` bằng version cần dùng):

```
https://megawin-sdk.s3.ap-southeast-1.amazonaws.com/player-sdk/v1.0.0/megawin-player-sdk.tgz
```

### Browser (`<script>` tag)

Dùng trực tiếp trên trang web qua global `window.MegaWin`:

```html
<!-- Bản minified -->
<script src="https://megawin-sdk.s3.ap-southeast-1.amazonaws.com/player-sdk/latest/megawin-player-sdk-browser.js"></script>

<!-- Hoặc bản gzip (nhỏ hơn, cần server hỗ trợ Content-Encoding: gzip) -->
<!-- https://megawin-sdk.s3.ap-southeast-1.amazonaws.com/player-sdk/latest/megawin-player-sdk-browser.js.gz -->

<script>
  const client = MegaWin.createPlayerClient({
    baseUrl: "https://api.domain.com",
    tokens: tokensFromServer,
  });

  const balance = await client.player.getBalance();
</script>
```

Tải phiên bản cụ thể:

```
https://megawin-sdk.s3.ap-southeast-1.amazonaws.com/player-sdk/v1.0.0/megawin-player-sdk-browser.js
https://megawin-sdk.s3.ap-southeast-1.amazonaws.com/player-sdk/v1.0.0/megawin-player-sdk-browser.js.gz
```

### Kiểm tra version đang dùng

```bash
npm list @megawin/player-sdk
```

## Quickstart

```typescript
import { createPlayerClient } from "@megawin/player-sdk";

// 1. Tenant server lấy tokens từ MegaWin (server-to-server API)
const tokens = await yourServer.getPlayerTokens(playerId);

// 2. Tạo SDK client với tokens
const client = createPlayerClient({
  baseUrl: "https://api.domain.com",
  tokens: {
    accessToken: tokens.accessToken,
    idToken: tokens.idToken,
    refreshToken: tokens.refreshToken,
    expiresAt: Date.now() + tokens.expiresIn * 1000,
  },
  onSessionExpired: () => {
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
     │                   │  (access, id,       │
     │                   │   refresh, expiresIn)│
     │                   │<────────────────────│
     │  4. Tokens        │                     │
     │<──────────────────│                     │
     │                   │                     │
     │  5. API calls (Bearer idToken auto-inject)
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
import { createPlayerClient, MemoryTokenStorage } from "@megawin/player-sdk";

const client = createPlayerClient({
  // [Bắt buộc] Base URL của MegaWin API Gateway
  baseUrl: "https://api.domain.com",

  // [Tùy chọn] Tokens nhận từ tenant server — sẵn sàng gọi API ngay
  tokens: {
    accessToken: "eyJ...",
    idToken: "eyJ...",
    refreshToken: "abc...",
    expiresAt: 1740500000000, // epoch ms
  },

  // [Tùy chọn] Custom storage để persist tokens qua page reload
  // Mặc định: sessionStorage (browser) — tokens tồn tại trong tab, mất khi đóng tab
  // Xem phần "Token Storage" bên dưới
  tokenStorage: new MemoryTokenStorage(), // Node.js / React Native

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
  idToken: "eyJ...",
  refreshToken: "abc...",
  expiresAt: Date.now() + 3600_000,
});

// Kiểm tra session
const isAuth = await client.auth.isAuthenticated();

// Lấy access token (không trigger refresh)
const accessToken = await client.auth.getAccessToken();

// Lấy toàn bộ tokens
const tokens = await client.auth.getTokens();
```

### `client.keno` — Game Keno

```typescript
import type { KenoTicketPurchaseInput } from "@megawin/player-sdk/keno";

// Đặt cược Keno
// Số Keno dạng string zero-padded: "01" đến "80"
const result = await client.keno.placeBet({
  startDrawId: "2026-02-25-001", // Format: YYYY-MM-DD-NNN
  drawCount: 5, // 1-20 kỳ liên tiếp
  boards: [
    { boardNo: "A", numbers: ["01", "15", "33", "44", "60"] },
    { boardNo: "B", numbers: ["22", "44", "66"] },
  ],
  sideBets: [
    { playType: "bigSmall", bet: "big" },
    { playType: "evenOdd", bet: "even" },
  ],
});

console.log(result.ticketId); // "TKT-..."
console.log(result.ticketNo); // "K-20260225-001-0001"
console.log(result.totalAmount); // 70000
```

### `client.lotto535` — Game Lotto 5/35

```typescript
import type { Lotto535TicketPurchaseInput } from "@megawin/player-sdk/lotto535";

// Đặt cược Lotto 5/35
// Số chính: "01"-"35", số đặc biệt: "01"-"12"
const result = await client.lotto535.placeBet({
  drawId: "2026-02-25-001", // Format: YYYY-MM-DD-NNN
  drawCount: 3, // 1-6 kỳ liên tiếp
  boards: [
    {
      boardNo: "A",
      playType: "standard", // 5 chính + 1 đặc biệt
      selection: {
        mainNumbers: ["01", "08", "15", "22", "35"],
        specialNumbers: ["07"],
      },
    },
    {
      boardNo: "B",
      playType: "mainCover", // 6-15 chính + 1 đặc biệt (bao)
      selection: {
        mainNumbers: ["02", "05", "10", "15", "20", "25", "30"],
        specialNumbers: ["12"],
      },
    },
  ],
});
```

**Kiểu chơi (`playType`):**

| Value            | Mô tả                   | Số lines |
| ---------------- | ----------------------- | -------- |
| `"standard"`     | 5 chính + 1 đặc biệt    | 1        |
| `"mainCover4"`   | 4 chính + 1 đặc biệt    | 31       |
| `"mainCover"`    | 6-15 chính + 1 đặc biệt | C(N,5)   |
| `"specialCover"` | 5 chính + 2-12 đặc biệt | K        |
| `"quickPick"`    | Máy chọn ngẫu nhiên     | 1        |

### `client.player` — Player Info

```typescript
// Số dư
const balance = await client.player.getBalance();
console.log(balance.balance); // 500000
console.log(balance.currency); // "VND"

// Lịch sử cược (phân trang, lọc theo game)
const history = await client.player.getBetHistory({
  gameId: "keno", // Tùy chọn: "keno" | "lotto535"
  page: 1,
  pageSize: 10,
});

for (const bet of history.bets) {
  console.log(bet.ticketNo, bet.totalAmount, bet.status);
}

// Kết quả game
const result = await client.player.getGameResult("keno", "2026-02-25-001");
console.log(result.status); // "completed"
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

| Code                   | HTTP | Mô tả                            |
| ---------------------- | ---- | -------------------------------- |
| `UNAUTHORIZED`         | 401  | Chưa xác thực hoặc token hết hạn |
| `INSUFFICIENT_BALANCE` | 400  | Không đủ số dư                   |
| `DRAW_CLOSED`          | 400  | Kỳ quay đã đóng bán              |
| `VALIDATION_ERROR`     | 400  | Input không hợp lệ               |
| `NOT_FOUND`            | 404  | Resource không tồn tại           |
| `TIMEOUT`              | 408  | Request timeout                  |
| `NETWORK_ERROR`        | 0    | Lỗi mạng / không kết nối được    |

## Token Storage

Mặc định SDK dùng `sessionStorage` (browser) để lưu tokens. Có 2 built-in storage:

| Storage                      | Persist qua reload? | Chia sẻ giữa tabs? | Môi trường         |
| ---------------------------- | ------------------- | ------------------ | ------------------ |
| `SessionStorageTokenStorage` | Có (trong tab)      | Không              | Browser (mặc định) |
| `MemoryTokenStorage`         | Không               | Không              | Mọi môi trường     |

### Mặc định — `SessionStorageTokenStorage` (browser)

```typescript
// Không cần truyền tokenStorage — SDK tự dùng sessionStorage
const client = createPlayerClient({
  baseUrl: "https://api.domain.com",
  tokens: tokensFromServer,
});
// Tokens tồn tại khi reload page, mất khi đóng tab
```

### Node.js / React Native — `MemoryTokenStorage`

```typescript
import { createPlayerClient, MemoryTokenStorage } from "@megawin/player-sdk";

const client = createPlayerClient({
  baseUrl: "https://api.domain.com",
  tokens: tokensFromServer,
  tokenStorage: new MemoryTokenStorage(),
});
```

### Custom key cho sessionStorage

```typescript
import { createPlayerClient, SessionStorageTokenStorage } from "@megawin/player-sdk";

const client = createPlayerClient({
  baseUrl: "https://api.domain.com",
  tokenStorage: new SessionStorageTokenStorage("my_app_tokens"),
});
```

### Custom adapter (localStorage, AsyncStorage, ...)

```typescript
const client = createPlayerClient({
  baseUrl: "https://api.domain.com",
  tokenStorage: {
    getTokens: () => JSON.parse(localStorage.getItem("mw_tokens") ?? "null"),
    setTokens: (t) => localStorage.setItem("mw_tokens", JSON.stringify(t)),
    clearTokens: () => localStorage.removeItem("mw_tokens"),
  },
});
```

## Tương thích

- **Browser**: Chrome, Firefox, Safari, Edge (modern) — mặc định dùng `sessionStorage`
- **React Native**: 0.70+ — cần truyền `tokenStorage: new MemoryTokenStorage()` hoặc `AsyncStorage` adapter
- **Node.js**: 22+ (native fetch) — cần truyền `tokenStorage: new MemoryTokenStorage()`
- **Module**: ESM + CommonJS
- **TypeScript**: Đầy đủ type declarations

## Downloads

| File                       | Link                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| NPM Package (latest)       | https://megawin-sdk.s3.ap-southeast-1.amazonaws.com/player-sdk/latest/megawin-player-sdk.tgz           |
| Browser JS (latest)        | https://megawin-sdk.s3.ap-southeast-1.amazonaws.com/player-sdk/latest/megawin-player-sdk-browser.js    |
| Browser JS gzip (latest)   | https://megawin-sdk.s3.ap-southeast-1.amazonaws.com/player-sdk/latest/megawin-player-sdk-browser.js.gz |
| API Documentation (latest) | https://megawin-sdk.s3.ap-southeast-1.amazonaws.com/player-sdk/latest/docs/index.html                  |

Thay `/latest/` bằng `/v1.0.0/` (hoặc version cần dùng) để tải phiên bản cụ thể.
