# @megawin/api-identity

Identity & Account Management API — quản lý tài khoản company user và tenants.

## Loại app

| Thuộc tính | Giá trị |
|------------|---------|
| **Loại** | API Gateway (Serverless Lambda + API Gateway v2) |
| **Runtime** | Node.js 24, AWS Lambda |
| **Framework** | Serverless Framework v4 |
| **Build** | esbuild |

## Đối tượng sử dụng

**Internal — Operator (MegaWin team)**

API này phục vụ cho hệ thống nội bộ MegaWin, quản lý identity của company users và tenants. Không dành cho player hay tenant gọi trực tiếp.

## Endpoints

| Method | Path | Handler | Mô tả |
|--------|------|---------|-------|
| `POST` | `/accounts/company` | `create-company-user` | Tạo tài khoản company user |
| `GET` | `/` | `tentant-endpoint` | Tenant endpoint (placeholder) |

## Packages phụ thuộc

| Package | Vai trò |
|---------|---------|
| `@megawin/identity-application` | Use cases — tạo tenant, tạo user, xác thực |
| `@megawin/identity-domain` | Domain entities — Tenant, User, Role |
| `@megawin/app-core` | Lambda middleware, HTTP helpers, logging |
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
│   ├── account-endpoint.yml      # HTTP route definitions
│   └── tentant-endpoint.yml
└── handlers/
    └── create-company-user.ts    # Lambda handler
```
