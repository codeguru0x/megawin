# @megawin/player-sdk

MegaWin Player SDK — thư viện cho đối tác (tenant) tích hợp game client.

Zero dependencies. Hỗ trợ Browser, React Native, Node.js.

## Cài đặt

### NPM / pnpm / yarn

Cài trực tiếp từ URL — npm tự ghi vào `package.json`, CI/CD tự tải lại, không cần lưu file local:

```bash
# Bản mới nhất
npm install https://megawin-sdk.s3.ap-southeast-1.amazonaws.com/player-sdk/latest/megawin-player-sdk.tgz
# hoặc
pnpm add https://megawin-sdk.s3.ap-southeast-1.amazonaws.com/player-sdk/latest/megawin-player-sdk.tgz
# hoặc
yarn add https://megawin-sdk.s3.ap-southeast-1.amazonaws.com/player-sdk/latest/megawin-player-sdk.tgz
```

Cài phiên bản cụ thể (khuyến nghị cho production — thay `v1.0.0` bằng version cần dùng):

```bash
npm install https://megawin-sdk.s3.ap-southeast-1.amazonaws.com/player-sdk/v1.0.0/megawin-player-sdk.tgz
```

Sau khi cài, `package.json` sẽ ghi:

```json
{
  "dependencies": {
    "@megawin/player-sdk": "https://megawin-sdk.s3.ap-southeast-1.amazonaws.com/player-sdk/v1.0.0/megawin-player-sdk.tgz"
  }
}
```

Để **update version**, chạy lại lệnh với URL version mới — npm tự cập nhật entry trong `package.json`.

### Browser (`<script>` tag)

Dùng trực tiếp trên trang web qua global `window.MegaWin`:

```html
<!-- Bản minified (latest) -->
<script src="https://megawin-sdk.s3.ap-southeast-1.amazonaws.com/player-sdk/latest/megawin-player-sdk-browser.js"></script>

<script>
  const client = MegaWin.createPlayerClient({
    baseUrl: "https://api.domain.com",
    tokens: tokensFromServer,
  });
</script>
```

Tải phiên bản cụ thể:

```
https://megawin-sdk.s3.ap-southeast-1.amazonaws.com/player-sdk/v1.0.0/megawin-player-sdk-browser.js
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
const kenoResult = await client.keno.placeBet({ ... });
```

## Imports

| Import path                    | Nội dung                 |
| ------------------------------ | ------------------------ |
| `@megawin/player-sdk`          | Client, auth, API types  |
| `@megawin/player-sdk/keno`     | Keno enums + types       |
| `@megawin/player-sdk/lotto535` | Lotto 5/35 enums + types |
| `@megawin/player-sdk/mega645`  | Mega 6/45 enums + types  |
| `@megawin/player-sdk/power655` | Power 6/55 enums + types |
| `@megawin/player-sdk/max3d`    | Max 3D enums + types     |
| `@megawin/player-sdk/max3dpro` | Max 3D Pro enums + types |
| `@megawin/player-sdk/bingo18`  | Bingo 18 enums + types   |

## Khởi tạo client

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

## API Reference

### `client.keno` — Game Keno

```typescript
import type { KenoTicketPurchaseInput } from "@megawin/player-sdk/keno";

// Lấy cấu hình game
const config = await client.keno.getGameConfig();
console.log(config.game.unitPrice); // 10000

// Lấy kỳ quay hiện tại
const draw = await client.keno.getCurrentDraw();
console.log(draw.drawId); // "2026-03-07.095"
console.log(draw.sales.closeAt); // "2026-03-07T13:04:50.000Z"

// Đặt cược — số Keno dạng string zero-padded: "01" đến "80"
const result = await client.keno.placeBet({
  startDrawId: "2026-03-07.095",
  drawCount: 5,
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
console.log(result.totalAmount); // 70000

// Xem danh sách vé chờ kết quả
const pending = await client.keno.listPendingTickets({ size: 20 });
for (const ticket of pending.tickets) {
  console.log(ticket.ticketNo, ticket.totalAmount);
}

// Xem kết quả các kỳ quay theo ngày (cursor-based)
const results = await client.keno.listDrawResults({ from: "2026-03-07" });
for (const draw of results.draws) {
  console.log(`${draw.drawId}: ${draw.result.winningNumbers.join(", ")}`);
}

// Xem chi tiết kỳ quay (bao gồm bảng giải thưởng)
const detail = await client.keno.getDrawResult("2026-03-07.095");
for (const prize of detail.basicPrizes) {
  console.log(`Pick${prize.pickCount} khớp ${prize.matchCount}: ${prize.winnerCount} người`);
}
```

### `client.lotto535` — Game Lotto 5/35

```typescript
import type { Lotto535TicketPurchaseInput } from "@megawin/player-sdk/lotto535";

// Lấy cấu hình game + Jackpot
const config = await client.lotto535.getGameConfig();
const jackpot = await client.lotto535.getJackpot();
console.log(jackpot.currentAmount); // 15000000000

// Đặt cược — số chính: "01"-"35", số đặc biệt: "01"-"12"
const result = await client.lotto535.placeBet({
  drawId: "2026-03-07.001",
  drawCount: 3,
  boards: [
    {
      boardNo: "A",
      playType: "standard",
      selection: {
        mainNumbers: ["01", "08", "15", "22", "35"],
        specialNumbers: ["07"],
      },
    },
    {
      boardNo: "B",
      playType: "mainCover",
      selection: {
        mainNumbers: ["02", "05", "10", "15", "20", "25", "30"],
        specialNumbers: ["12"],
      },
    },
  ],
});
console.log(result.ticketId); // "TKT-..."
console.log(result.totalAmount); // 93 * 3 * 10000

// Xem kết quả các kỳ quay theo ngày
const results = await client.lotto535.listDrawResults({ from: "2026-03-07" });
for (const draw of results.draws) {
  console.log(
    `${draw.drawId}: [${draw.result.winningMain.join(",")}] ĐB:${draw.result.winningSpecial}`,
  );
  console.log(`Jackpot cuối kỳ: ${draw.jackpot.closingAmount.toLocaleString()} VND`);
}

// Xem chi tiết kỳ quay (bao gồm bảng giải thưởng)
const detail = await client.lotto535.getDrawResult("2026-03-07.001");
for (const prize of detail.prizes) {
  console.log(
    `${prize.tier}: ${prize.winnerCount} giải — ${prize.prizeAmount.toLocaleString()} VND`,
  );
}
```

**Kiểu chơi (`playType`):**

| Value            | Mô tả                   | Số lines |
| ---------------- | ----------------------- | -------- |
| `"standard"`     | 5 chính + 1 đặc biệt    | 1        |
| `"mainCover4"`   | 4 chính + 1 đặc biệt    | 31       |
| `"mainCover"`    | 6–15 chính + 1 đặc biệt | C(N,5)   |
| `"specialCover"` | 5 chính + 2–12 đặc biệt | K        |

### `client.mega645` — Game Mega 6/45

```typescript
import type { Mega645TicketPurchaseInput } from "@megawin/player-sdk/mega645";

// Lấy kỳ quay hiện tại + Jackpot
const draw = await client.mega645.getCurrentDraw();
const jackpot = await client.mega645.getJackpot();
console.log(jackpot.currentAmount); // 8500000000

// Đặt cược — số dạng string zero-padded: "01"-"45"
const result = await client.mega645.placeBet({
  drawId: "2026-03-07.001",
  drawCount: 1,
  boards: [
    {
      boardNo: "A",
      playType: "standard",
      selection: { mainNumbers: ["05", "12", "22", "31", "40", "45"] },
    },
  ],
});
console.log(result.ticketId); // "TKT-..."
console.log(result.totalAmount); // 10000

// Xem danh sách vé chờ
const pending = await client.mega645.listPendingTickets({ size: 20 });
for (const ticket of pending.tickets) {
  console.log(
    `${ticket.ticketNo}: ${ticket.progress.settledDraws}/${ticket.progress.totalDraws} kỳ`,
  );
}
```

### `client.power655` — Game Power 6/55

```typescript
import type { Power655TicketPurchaseInput } from "@megawin/player-sdk/power655";

// Lấy kỳ quay + Jackpot
const draw = await client.power655.getCurrentDraw();
const jackpot = await client.power655.getJackpot();
console.log(jackpot.currentAmount); // 45000000000

// Đặt cược — số dạng string zero-padded: "01"-"55"
const result = await client.power655.placeBet({
  drawId: "2026-03-07.001",
  drawCount: 1,
  boards: [
    {
      boardNo: "A",
      playType: "standard",
      selection: { mainNumbers: ["03", "11", "25", "38", "49", "55"] },
    },
  ],
});
console.log(result.ticketId); // "TKT-..."
console.log(result.totalAmount); // 10000
```

### `client.max3d` — Game Max 3D

```typescript
import type { Max3dTicketPurchaseInput } from "@megawin/player-sdk/max3d";

// Đặt cược Max 3D — bộ số 3 chữ số "000"-"999"
const result = await client.max3d.placeBet({
  drawId: "2026-03-07.001",
  drawCount: 2,
  boards: [
    { boardNo: "A", playMode: "basic", playType: "straight", triplets: ["123"] },
    { boardNo: "B", playMode: "basic", playType: "permutation", triplets: ["456"] },
  ],
});
console.log(result.ticketId); // "TKT-..."
console.log(result.totalAmount); // 40000
```

### `client.max3dpro` — Game Max 3D Pro

```typescript
import type { Max3dproTicketPurchaseInput } from "@megawin/player-sdk/max3dpro";

// Tương tự Max 3D với thêm kiểu chơi "plus" (2 bộ ba số)
const result = await client.max3dpro.placeBet({
  drawId: "2026-03-07.001",
  drawCount: 1,
  boards: [{ boardNo: "A", playMode: "plus", playType: "straight", triplets: ["123", "456"] }],
});
console.log(result.ticketId); // "TKT-..."
```

### `client.bingo18` — Game Bingo 18

```typescript
import type { Bingo18TicketPurchaseInput } from "@megawin/player-sdk/bingo18";

// Đặt cược Bingo 18 — chọn các kỳ quay trong ngày
const result = await client.bingo18.placeBet({
  drawIds: ["2026-03-07.001", "2026-03-07.002"],
  boards: [{ playType: "singleNum", number: 7 }],
  sideBets: [{ playType: "bigSmallDraw", bet: "big" }],
});
console.log(result.ticketId); // "TKT-..."
console.log(result.totalAmount); // 20000
```

### `client.player` — Thông tin Player

```typescript
// Lấy số dư
const balance = await client.player.getBalance();
console.log(balance.balance); // 500000
console.log(balance.currency); // "VND"
```

## Error Handling

Tất cả API methods throw `ApiClientError` khi lỗi:

```typescript
import { ApiClientError } from "@megawin/player-sdk";

try {
  await client.[game].placeBet({ ... });
} catch (error) {
  if (error instanceof ApiClientError) {
    console.error(error.code);      // "INSUFFICIENT_BALANCE"
    console.error(error.message);   // "Không đủ số dư"
    console.error(error.status);    // 400
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

### Browser (mặc định — `SessionStorageTokenStorage`)

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
