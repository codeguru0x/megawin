# @megawin/worker-resultfeed

ResultFeed Background Worker — fetch + parse kết quả xổ số từ nhiều nguồn (Vietlott, ...).

## Loại app

| Thuộc tính    | Giá trị                                      |
| ------------- | -------------------------------------------- |
| **Loại**      | Background Worker (AWS Lambda + EventBridge) |
| **Runtime**   | Node.js 24, AWS Lambda                       |
| **Framework** | Serverless Framework v4                      |
| **Build**     | esbuild                                      |

## Đối tượng sử dụng

**Internal — tự động chạy bởi hệ thống**

Worker này không có HTTP endpoint. Các Lambda functions được trigger bởi EventBridge schedule
(cron mỗi 1 phút). Nhịp fetch thật được điều khiển bằng dữ liệu (`SourceCursor.nextFetchAt`),
không phải bằng cron schedule — xem `.cursor/plans/resultfeed/02-fetch-parse.plan.md` §4.

## Functions

### Fetch — 1 Lambda / nguồn × game

| Handler                  | Trigger             | Lock key                                   | Việc                                     |
| ------------------------ | ------------------- | ------------------------------------------ | ---------------------------------------- |
| `fetch/vietlott-keno`    | EventBridge cron 1p | `resultfeed:fetch:vietlott-detail:keno`    | Fetch → submission → parse → observation |
| `fetch/vietlott-bingo18` | EventBridge cron 1p | `resultfeed:fetch:vietlott-detail:bingo18` | như trên                                 |

Mỗi handler chỉ là glue mỏng quanh `FetchAndParseUseCase` (đã có test đầy đủ ở
`packages/resultfeed-application`). `SingleRunWorker` (từ `@megawin/worker-core`) tự quản lock
lifecycle (acquire/release/kill-switch) — handler không cần biết gì về locking.

## Packages phụ thuộc

| Package                           | Vai trò                                                  |
| --------------------------------- | -------------------------------------------------------- |
| `@megawin/resultfeed`             | Domain — entities, rules (canonicalize, intrinsic check) |
| `@megawin/resultfeed-application` | Use cases, repos, mappers, providers, source adapters    |

## Scripts

```bash
# Type check
pnpm check-types

# Test (mock use-case, không chạm DB)
pnpm test

# Local development (serverless-offline)
npx serverless offline

# Deploy lên AWS
npx serverless deploy --stage dev
```

## Cấu trúc thư mục

```
src/
├── functions/
│   └── fetch.yml          # Fetch function definitions (cron 1 phút / nguồn × game)
└── handlers/
    └── fetch/
        ├── vietlott-keno.ts
        └── vietlott-bingo18.ts
```
