# @megawin/api-resultfeed

ResultFeed Public API — cho phép **backoffice** (và tương lai: consumer khác) PULL kết quả đã
publish qua HTTP + API key. KHÔNG dùng session/Cognito — auth server-to-server thuần API key.

## Loại app

| Thuộc tính    | Giá trị                                       |
| ------------- | --------------------------------------------- |
| **Loại**      | HTTP API (AWS Lambda + API Gateway `httpApi`) |
| **Runtime**   | Node.js 24, AWS Lambda                        |
| **Framework** | Serverless Framework v4                       |
| **Build**     | esbuild                                       |

## Đối tượng sử dụng

**Server-to-server** — hiện tại consumer duy nhất là `apps/backoffice` khi
`RESULTFEED_CLIENT_MODE=http` (mặc định backoffice dùng mode `"direct"`, gọi thẳng use-case
trong tiến trình — xem `.cursor/plans/resultfeed/08-vietlott-result-autofill.plan.md`). App này
tồn tại cho trường hợp backoffice/consumer khác chạy trên cluster/deploy tách biệt, cần đi qua
đúng contract HTTP thật.

## Xác thực

Header `x-resultfeed-api-key` — so trực tiếp với `RESULTFEED_API_KEY` (1 biến env duy nhất,
chưa xây danh sách nhiều consumer — mở rộng khi có consumer thứ 2). Sai/thiếu → `401`.

Code auth (`src/lib/api-key-auth.ts`, `src/lib/build-handler.ts`) viết **cục bộ cho app này**,
KHÔNG tái dùng `@megawin/auth` (đó là builder cho API core, gắn với ngữ nghĩa `tenant`/B2B).
ResultFeed độc lập, không biết gì về identity của MegaWin core.

## Endpoints

| Method | Path       | Việc                                                                                         |
| ------ | ---------- | -------------------------------------------------------------------------------------------- |
| GET    | `/results` | Lấy kết quả đã publish — 1 kỳ (`gameKey`+`drawPeriod`) hoặc batch (`gameKey`+`since`+`size`) |

## Packages phụ thuộc

| Package                           | Vai trò                                                           |
| --------------------------------- | ----------------------------------------------------------------- |
| `@megawin/resultfeed`             | Domain — entities, enums                                          |
| `@megawin/resultfeed-application` | `PullResultsUseCase`                                              |
| `@megawin/app-core`               | Middy middleware chung (validator/success-envelope/error-handler) |

**KHÔNG** phụ thuộc `@megawin/auth`/`@megawin/identity*` — resultfeed giữ độc lập, không biết
gì về hệ thống identity của MegaWin core.

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
│   └── results.yml
├── handlers/
│   └── results/
│       └── get-results.ts
└── lib/
    ├── api-key-auth.ts     ← middy middleware check x-resultfeed-api-key
    └── build-handler.ts    ← compose middy (auth + validator + envelope + error handler)
```
