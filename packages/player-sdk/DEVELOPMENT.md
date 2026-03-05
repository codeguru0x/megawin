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

### Một lệnh duy nhất

```bash
pnpm upload          # Bump patch (1.0.0 → 1.0.1) rồi upload
pnpm upload:minor    # Bump minor (1.0.0 → 1.1.0) rồi upload
pnpm upload:major    # Bump major (1.0.0 → 2.0.0) rồi upload
```

Script tự động thực hiện toàn bộ quy trình:

1. Bump version trong `package.json`
2. Build SDK (ESM, CJS, Browser IIFE)
3. Pack `.tgz`
4. Gzip browser build (`.js.gz`)
5. Generate API docs (TypeDoc)
6. Upload tất cả lên S3 (versioned + latest)

### Build local (kiểm tra trước khi upload)

```bash
pnpm release
```

Tạo artifacts vào thư mục `release/` mà không bump version hay upload:

| File                                       | Mô tả                     |
| ------------------------------------------ | ------------------------- |
| `release/megawin-player-sdk-<version>.tgz` | NPM package               |
| `release/megawin-player-sdk-browser.js.gz` | Browser IIFE build (gzip) |
| `docs/`                                    | API documentation (HTML)  |

### Gửi trực tiếp cho khách hàng (không qua S3)

Chạy `pnpm release`, sau đó gửi:

| File                                        | Mô tả                                   |
| ------------------------------------------- | --------------------------------------- |
| `release/megawin-player-sdk-<version>.tgz`  | Package cài đặt qua npm/pnpm/yarn       |
| `dist/megawin-player-sdk-browser.global.js` | Browser `<script>` tag (window.MegaWin) |
| `docs/` (zip)                               | API documentation (tùy chọn)            |

## Upload lên S3

### Cấu hình (chỉ cần làm 1 lần)

```bash
cp .env.s3.example .env.s3.local
```

Sửa `.env.s3.local` với thông tin của bạn:

```bash
S3_BUCKET=your-sdk-bucket-name
AWS_PROFILE=your-aws-profile
AWS_REGION=ap-southeast-1
```

Yêu cầu: AWS CLI đã cài đặt và profile đã cấu hình.

### Upload

```bash
pnpm upload          # Bump patch (1.0.0 → 1.0.1) rồi upload
pnpm upload:minor    # Bump minor (1.0.0 → 1.1.0) rồi upload
pnpm upload:major    # Bump major (1.0.0 → 2.0.0) rồi upload
```

Override cấu hình cho 1 lần chạy:

```bash
pnpm upload -- --profile other-profile --bucket other-bucket
```

### Cấu trúc S3

```
s3://<bucket>/player-sdk/
  latest/
    megawin-player-sdk.tgz                ← NPM package (luôn bản mới nhất)
    megawin-player-sdk-browser.js         ← Browser IIFE build
    megawin-player-sdk-browser.js.gz      ← Browser build (gzip, cho CDN)
    megawin-player-sdk-browser.js.map     ← Source map
    docs/                                 ← API documentation
  v1.0.0/
    megawin-player-sdk.tgz
    megawin-player-sdk-browser.js
    megawin-player-sdk-browser.js.gz
    megawin-player-sdk-browser.js.map
    docs/
  v1.0.1/
    ...
```

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
    auth/                 # Auth module
      types.ts            # AuthTokens, AuthResult, TokenStorage
      token-manager.ts    # Token lifecycle + storage implementations
      auth-api.ts         # client.auth (refresh, setTokens, ...)
      index.ts            # Barrel export
    apis/                 # Game API modules
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
  release/                # .tgz + .gz releases (gitignored)
  scripts/
    upload-s3.sh          # Release + upload S3 script
```

## Thêm API mới

### 1. Thêm URL vào `src/endpoints.ts`

```typescript
export const ENDPOINTS = {
  // ... existing
  keno: {
    placeBet: "/player/keno/bets",
    getDraws: "/player/keno/draws", // <-- thêm mới
  },
} as const;
```

### 2. Thêm types (nếu cần) vào `src/keno/types.ts`

### 3. Thêm method vào `src/apis/keno.ts`

```typescript
export interface KenoApi {
  placeBet(input: KenoTicketPurchaseInput): Promise<KenoPlaceBetResponse>;
  getDraws(): Promise<KenoDrawInfo[]>; // <-- thêm mới
}
```

### 4. Viết test trong `test/keno-api.test.ts`

### 5. Build + test + release

```bash
pnpm check-types && pnpm test && pnpm upload
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
