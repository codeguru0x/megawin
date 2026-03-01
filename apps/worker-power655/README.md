# @megawin/worker-power655

Power 6/55 Background Worker — xử lý kỳ quay Power 6/55: settle, payout, void và feed sync.

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

Xử lý kết quả kỳ quay — tính toán thắng/thua, báo cáo tài chính, chi trả giải thưởng (bao gồm jackpot).

```
prepare-settle → settle-entries → calculate-financials → apply-split-bonuses → sync-ticket-summaries → build-report → finalize-settle → dispatch-payouts
```

| Step | Handler | Mô tả |
|------|---------|-------|
| 1 | `settle/prepare-settle` | Chuẩn bị dữ liệu settle cho kỳ quay |
| 2 | `settle/settle-entries` | Duyệt từng entry, xác định thắng/thua theo bảng giải |
| 3 | `settle/calculate-financials` | Tính toán tài chính (revenue, payout, jackpot, profit) |
| 4 | `settle/apply-split-bonuses` | Áp dụng bonus split jackpot (nếu có) |
| 5 | `settle/sync-ticket-summaries` | Đồng bộ tổng kết ticket từ entries |
| 6 | `settle/build-report` | Tạo báo cáo kỳ quay |
| 7 | `settle/finalize-settle` | Finalize kết quả settle |
| 8 | `settle/dispatch-payouts` | Chi trả giải thưởng cho players |

### Void Pipeline

Hủy kỳ quay — hoàn tiền cho players.

```
prepare-void → void-entries → sync-ticket-summaries → dispatch-refunds → finalize-void
```

| Step | Handler | Mô tả |
|------|---------|-------|
| 1 | `void/prepare-void` | Chuẩn bị dữ liệu void |
| 2 | `void/void-entries` | Đánh dấu entries bị void |
| 3 | `settle/sync-ticket-summaries` | Đồng bộ tổng kết ticket (shared) |
| 4 | `void/dispatch-refunds` | Hoàn tiền cho players |
| 5 | `void/finalize-void` | Finalize void |

### Feed Sync

Đồng bộ entry feed cho tenants — chạy theo schedule.

| Handler | Trigger | Mô tả |
|---------|---------|-------|
| `feed/feed-scheduler` | EventBridge schedule | Scheduler trigger feed sync |
| `feed/sync-entry-feed` | Step Function | Đồng bộ entries mới vào feed |
| `feed/save-cursor` | Step Function | Lưu cursor position cho lần sync tiếp theo |

## Packages phụ thuộc

| Package | Vai trò |
|---------|---------|
| `@megawin/game-power655` | Domain logic game Power 6/55 |
| `@megawin/game-power655-application` | Use cases Power 6/55 — settle, void, feed |
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
│   ├── void.yml         # Void pipeline function definitions
│   └── feed.yml         # Feed sync function definitions
├── step-functions/
│   ├── settle.ts        # Settle Step Function ASL definition
│   ├── void.ts          # Void Step Function ASL definition
│   └── feed-sync.ts     # Feed Sync Step Function ASL definition
└── handlers/
    ├── settle/
    │   ├── prepare-settle.ts
    │   ├── settle-entries.ts
    │   ├── calculate-financials.ts
    │   ├── apply-split-bonuses.ts
    │   ├── sync-ticket-summaries.ts
    │   ├── build-report.ts
    │   ├── finalize-settle.ts
    │   └── dispatch-payouts.ts
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
