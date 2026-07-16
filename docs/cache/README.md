# Caching Strategy — MegaWin Platform

> Tài liệu nghiên cứu & thiết kế giải pháp cache cho hệ thống MegaWin (RGS core).
> Ngày phân tích: 2026-07-11.

## Mục lục tài liệu

| File | Nội dung |
|---|---|
| [01-hien-trang-va-hot-data.md](./01-hien-trang-va-hot-data.md) | Khảo sát hiện trạng cache trong codebase + phân tích chi tiết các hot data candidates |
| [02-so-sanh-cong-nghe.md](./02-so-sanh-cong-nghe.md) | So sánh in-memory / ElastiCache (Valkey) / Redis Cloud / Upstash / Momento — chi phí, latency, độ phức tạp vận hành |
| [03-thiet-ke-package-cache.md](./03-thiet-ke-package-cache.md) | Thiết kế chi tiết `@megawin/cache` — layered architecture (L1 memory + L2 Redis), interface, key convention, stampede protection |
| [04-ap-dung-use-case-va-roadmap.md](./04-ap-dung-use-case-va-roadmap.md) | Mapping cache vào từng use case cụ thể trong các package hiện có + roadmap triển khai 3 phase |

---

## TL;DR — Khuyến nghị chính

### 1. Nền tảng chiến lược: **L1 in-memory trước, L2 Redis sau — không đảo ngược thứ tự**

Hạ tầng hiện tại là **Lambda ngoài VPC + Mongo Atlas**. Đặc điểm quyết định:

- Lambda container reuse (warm 15–30 phút) → in-memory cache per-container **miễn phí, 0 latency, 0 hạ tầng mới**.
- Hot data lớn nhất (GameConfig, TenantConfig, tenant-by-apiKey) đều là doc nhỏ, đổi cực hiếm → TTL 30–60s per-container là đủ, **không cần shared cache**.
- ElastiCache bắt buộc VPC-attach toàn bộ Lambda → cold start tăng, phức tạp networking, và phải làm cho **12 apps**. Chi phí kiến trúc này chỉ đáng trả khi có nhu cầu thật (shared state, distributed lock, instant invalidation).

### 2. Công nghệ đề xuất theo tầng

| Tầng | Công nghệ | Khi nào |
|---|---|---|
| **L1 (bắt buộc, Phase 1)** | `lru-cache` in-memory, TTL-based, per Lambda container | Ngay bây giờ — quick win lớn nhất |
| **L2 (tùy chọn, Phase 3)** | **ElastiCache Serverless for Valkey** (nếu chấp nhận VPC) hoặc **Upstash / Redis Cloud** (nếu muốn tránh VPC) | Khi cần instant invalidation, distributed lock, rate-limit, hoặc Operator platform (ví, session) |
| Edge/HTTP | API Gateway / CloudFront cache TTL 3–5s | Cho polling endpoints (`get-current-draw`, `get-jackpot`, `list-draw-results`) |

### 3. Ba quick win Phase 1 (in-memory, TTL 30–60s)

1. **Tenant-by-apiKey** (auth middleware `withTenantAuth`) — hot nhất, chạy mỗi request api-tenant.
2. **Global GameConfig** (7 games) — đọc mỗi place-bet + settle; chỗ cắm đã có sẵn (`get-global-config-internal.ts` có TODO).
3. **TenantConfig** (7 games) — đọc mỗi place-bet; chỗ cắm đã có sẵn (`get-tenant-config-internal.ts` có TODO).

### 4. Những gì KHÔNG được cache

- `getDrawsByIds` trong place-bet validation (`salesOpen` + `closeAt` phải chính xác tuyệt đối).
- WAL / TxIntent / balance callbacks / entries — dữ liệu giao dịch.
- Bất kỳ dữ liệu nào dùng làm input cho quyết định tài chính tại thời điểm ghi.

### 5. Nguyên tắc thiết kế `@megawin/cache`

- Package base định nghĩa **interface `CacheStore`** + 3 implementation: `MemoryCacheStore` (L1), `RedisCacheStore` (L2, tận dụng `RedisRepository` sẵn có), `TieredCache` (L1→L2 composite).
- Consumer (game-*-application, identity-application) chỉ phụ thuộc interface — swap backend không sửa use-case.
- Cache chèn tại **internal use-case chokepoints** (đã được thiết kế sẵn trong codebase), không chèn ở handler hay repo.
- Cache luôn **fail-open**: cache lỗi → đi thẳng DB, không bao giờ làm gãy request.
