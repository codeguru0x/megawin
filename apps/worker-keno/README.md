# @megawin/worker-keno

Keno Background Worker — xử lý kỳ quay Keno: settle, payout, void, auto-enroll và feed sync.

## Loại app

| Thuộc tính | Giá trị |
|------------|---------|
| **Loại** | Background Worker (AWS Step Functions + Lambda) |
| **Runtime** | Node.js 24, AWS Lambda |
| **Framework** | Serverless Framework v4 |
| **Build** | esbuild |

## Đối tượng sử dụng

**Internal — tự động chạy bởi hệ thống**

Worker này không có HTTP endpoint. Các Lambda functions được trigger bởi AWS Step Functions state machines và EventBridge schedules. Xử lý hoàn toàn tự động, không cần tương tác từ người dùng.

## Functions

### Settle Pipeline

Xử lý kết quả kỳ quay — tính toán thắng/thua, báo cáo tài chính, chi trả giải thưởng.

```
prepare-settle → settle-entries → calculate-financials → build-report → finalize-settle → dispatch-payouts
```

| Step | Handler | Mô tả |
|------|---------|-------|
| 1 | `settle/prepare-settle` | Chuẩn bị dữ liệu settle cho kỳ quay |
| 2 | `settle/settle-entries` | Duyệt từng entry, xác định thắng/thua |
| 3 | `settle/calculate-financials` | Tính toán tài chính (revenue, payout, profit) |
| 4 | `settle/build-report` | Tạo báo cáo kỳ quay |
| 5 | `settle/finalize-settle` | Finalize kết quả settle |
| 6 | `settle/dispatch-payouts` | Chi trả giải thưởng cho players |

### Auto-Enroll

| Handler | Timeout | Mô tả |
|---------|---------|-------|
| `enroll/auto-enroll-entries` | 300s | Tự động đăng ký entries cho kỳ quay tiếp theo (vé multi-draw) |

### Void Pipeline

Hủy kỳ quay — hoàn tiền cho players.

```
prepare-void → void-entries → dispatch-refunds → finalize-void
```

| Step | Handler | Mô tả |
|------|---------|-------|
| 1 | `void/prepare-void` | Chuẩn bị dữ liệu void |
| 2 | `void/void-entries` | Đánh dấu entries bị void |
| 3 | `void/dispatch-refunds` | Hoàn tiền cho players |
| 4 | `void/finalize-void` | Finalize void |

### Feed Sync

Đồng bộ entry feed cho tenants — chạy theo schedule.

| Handler | Trigger | Mô tả |
|---------|---------|-------|
| `feed/feed-scheduler` | EventBridge rate(30s) | Scheduler trigger feed sync |
| `feed/sync-entry-feed` | Step Function | Đồng bộ entries mới vào feed |
| `feed/save-cursor` | Step Function | Lưu cursor position cho lần sync tiếp theo |

## Packages phụ thuộc

| Package | Vai trò |
|---------|---------|
| `@megawin/game-keno` | Domain logic game Keno |
| `@megawin/game-keno-application` | Use cases Keno — settle, enroll, void |
| `@megawin/game-core` | Shared game domain (Draw, Entry, Board) |
| `@megawin/game-core-application` | Shared use cases — feed, reports |
| `@megawin/data` | Data access layer (DynamoDB, repositories) |
| `@megawin/tenant-gateway` | Multi-tenant data routing |
| `@megawin/app-core` | Lambda middleware, logging |
| `@megawin/shared` | Shared types |

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
│   ├── settle.yml       # Settle pipeline function definitions
│   ├── enroll.yml       # Auto-enroll function definition
│   ├── void.yml         # Void pipeline function definitions
│   └── feed.yml         # Feed sync function definitions
└── handlers/
    ├── settle/
    │   ├── prepare-settle.ts
    │   ├── settle-entries.ts
    │   ├── calculate-financials.ts
    │   ├── build-report.ts
    │   ├── finalize-settle.ts
    │   └── dispatch-payouts.ts
    ├── enroll/
    │   └── auto-enroll-entries.ts
    ├── void/
    │   ├── prepare-void.ts
    │   ├── void-entries.ts
    │   ├── dispatch-refunds.ts
    │   └── finalize-void.ts
    └── feed/
        ├── feed-scheduler.ts
        ├── sync-entry-feed.ts
        └── save-cursor.ts
```
