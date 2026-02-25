# Player SDK — Release & Development Workflow

Hướng dẫn nội bộ cho team MegaWin.

## Prerequisites

```bash
pnpm install
```

## Development

```bash
pnpm dev            # Watch mode (tsup rebuild on change)
pnpm check-types    # Type check
pnpm test           # Chạy tests
pnpm test:watch     # Watch mode tests
```

## Release cho khách hàng

### 1. Bump version

Sửa `version` trong `package.json`:

```json
{
  "version": "1.1.0"
}
```

### 2. Build + Pack

```bash
pnpm release
```

Output: `release/megawin-player-sdk-<version>.tgz`

### 3. Generate API docs (tùy chọn)

```bash
pnpm docs:build
```

Output: thư mục `docs/` chứa HTML documentation. Có thể zip gửi kèm cho khách.

### 4. Gửi cho khách hàng

Gửi 2 file:

| File | Mô tả |
|------|-------|
| `release/megawin-player-sdk-<version>.tgz` | Package cài đặt |
| `docs/` (zip) | API documentation (tùy chọn) |

## Khách hàng cài đặt

### Cài từ file .tgz

```bash
# npm
npm install ./megawin-player-sdk-1.0.0.tgz

# pnpm
pnpm add ./megawin-player-sdk-1.0.0.tgz

# yarn
yarn add file:./megawin-player-sdk-1.0.0.tgz
```

### Nâng cấp version mới

```bash
# Xóa bản cũ rồi cài bản mới
npm install ./megawin-player-sdk-1.1.0.tgz

# Hoặc pnpm tự thay thế
pnpm add ./megawin-player-sdk-1.1.0.tgz
```

### Kiểm tra version đang dùng

```bash
npm list @megawin/player-sdk
# @megawin/player-sdk@1.0.0
```

## Cấu trúc thư mục

```
packages/player-sdk/
  src/                    # Source code
    index.ts              # Main entry
    client.ts             # Facade compose modules
    endpoints.ts          # URL registry tập trung
    http-client.ts        # HTTP client (inline, zero deps)
    api-types.ts          # API response types
    token-manager.ts      # Token lifecycle
    types.ts              # Auth types
    apis/                 # API modules
      auth.ts             # client.auth
      keno.ts             # client.keno
      lotto535.ts         # client.lotto535
      player.ts           # client.player
    keno/                 # Subpath: @megawin/player-sdk/keno
      index.ts, enums.ts, types.ts
    lotto535/             # Subpath: @megawin/player-sdk/lotto535
      index.ts, enums.ts, types.ts
  test/                   # Vitest tests
  dist/                   # Build output (gitignored)
  docs/                   # TypeDoc output (gitignored)
  release/                # .tgz releases (gitignored)
```

## Thêm API mới

### 1. Thêm URL vào `src/endpoints.ts`

```typescript
export const ENDPOINTS = {
  // ... existing
  keno: {
    placeBet: "/player/keno/bets",
    getDraws: "/player/keno/draws",     // <-- thêm mới
  },
} as const;
```

### 2. Thêm types (nếu cần) vào `src/keno/types.ts`

### 3. Thêm method vào `src/apis/keno.ts`

```typescript
export interface KenoApi {
  placeBet(input: KenoTicketPurchaseInput): Promise<KenoPlaceBetResponse>;
  getDraws(): Promise<KenoDrawInfo[]>;  // <-- thêm mới
}
```

### 4. Viết test trong `test/keno-api.test.ts`

### 5. Build + test + release

```bash
pnpm check-types && pnpm test && pnpm release
```

## Thêm game mới (vd: Power 6/55)

### 1. Tạo subpath mới

```
src/power655/
  index.ts
  enums.ts
  types.ts
```

### 2. Tạo API module

```
src/apis/power655.ts
```

### 3. Thêm vào `client.ts` facade

### 4. Thêm vào `tsup.config.ts` entry

```typescript
entry: {
  index: "src/index.ts",
  keno: "src/keno/index.ts",
  lotto535: "src/lotto535/index.ts",
  power655: "src/power655/index.ts",  // <-- thêm mới
},
```

### 5. Thêm subpath vào `package.json` exports

### 6. Thêm vào `typedoc.json` entryPoints
