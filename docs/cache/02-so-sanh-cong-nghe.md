# 02 — So Sánh Công Nghệ Cache

> Đánh giá các lựa chọn: in-memory / ElastiCache (Valkey) / Redis Cloud / Upstash / Momento — trong bối cảnh hạ tầng megawin: **Lambda ngoài VPC + MongoDB Atlas + Next.js backoffice**.

## 1. Ràng buộc hạ tầng quyết định lựa chọn

Trước khi so sánh sản phẩm, phải nhìn rõ 4 ràng buộc của megawin:

1. **Lambda hiện chạy NGOÀI VPC** (không serverless.yml nào có VPC config). ElastiCache bắt buộc VPC-attach → phải sửa networking cho **12 apps**, cold start tăng, thêm NAT Gateway nếu Lambda cần internet (Mongo Atlas, tenant callbacks) — NAT Gateway ~$32/tháng + data processing fee, thường **đắt hơn chính cái cache**.
2. **Lambda = nhiều container song song, không share memory** → invalidation chủ động in-memory chỉ có tác dụng cùng process. Chiến lược nền tảng phải là **TTL ngắn**, Redis chỉ cần khi muốn invalidation tức thời hoặc shared state.
3. **Traffic hình dạng "spiky theo draw cycle"** — bingo18/keno tạo peak mỗi 6–10 phút quanh thời điểm mở/đóng kỳ. Pricing per-request (Upstash) vs capacity (ElastiCache) sẽ khác nhau nhiều theo volume thật.
4. **Hot data cực nhỏ**: GameConfig (7 docs), TenantConfig (7 × N tenants), tenant auth — tổng vài trăm KB. Không có nhu cầu memory lớn.

## 2. Bảng so sánh tổng hợp

| Tiêu chí | In-memory (`lru-cache`) | ElastiCache Serverless (Valkey) | ElastiCache node-based | Redis Cloud | Upstash Redis | Momento |
|---|---|---|---|---|---|---|
| Latency từ Lambda | **~0 (µs)** | <1ms (same VPC) | <1ms (same VPC) | 1–5ms (peering) / 5–20ms (public) | 1–10ms (TCP) / 5–30ms (REST) | 1–5ms |
| Yêu cầu VPC | Không | **Bắt buộc** | **Bắt buộc** | Không (public/peering) | **Không** | Không |
| Cold start impact | 0 | +VPC ENI (đã cải thiện nhưng vẫn có) | +VPC ENI | 0 | 0 | 0 |
| Chi phí tối thiểu | **$0** | ~$6/tháng (floor 100MB) + ECPU | ~$12+/tháng (t3.micro, 24/7) | ~$7/tháng (250MB) — free tier 30MB | **$0 (scale-to-zero)**, $0.2/100K cmds | ~$0 (free tier) |
| Shared giữa Lambda containers | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Instant invalidation cross-process | ❌ (chỉ TTL) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Distributed lock / rate-limit | ❌ | ✅ | ✅ | ✅ | ✅ | Hạn chế |
| Vận hành | **Zero** | Thấp (serverless, auto-scale) | Trung bình (node sizing, failover) | Thấp | **Zero** | Zero |
| IAM/CloudWatch tích hợp | — | ✅ | ✅ | ❌ | ❌ | ❌ |
| Data structures đầy đủ (hash/set/stream) | ❌ | ✅ | ✅ | ✅ | ✅ | Hạn chế |
| Rủi ro vendor | — | AWS | AWS | Redis Inc | Startup (đã ổn định) | Startup |

Pricing tham khảo (2026): Valkey Serverless `$0.0023/triệu ECPU + $0.084/GB-giờ` (floor 100MB ≈ $6/tháng — rẻ hơn Redis OSS Serverless 33%, Redis OSS floor 1GB ≈ $91/tháng). Upstash `$0.2/100K commands`, free tier 500K commands/tháng.

## 3. Phân tích từng lựa chọn trong bối cảnh megawin

### 3.1. In-memory (`lru-cache`) — ⭐ nền tảng, làm ngay

**Ưu**
- Latency 0, chi phí $0, không thêm hạ tầng, không đổi serverless.yml.
- Đã có tiền lệ chuẩn trong repo: `tenant-gateway/src/gateway.ts` (TTL + max + stale-on-error + fetch dedup).
- Với hot data của megawin (config nhỏ, đổi hiếm), TTL 30–60s giải quyết 95% giá trị của caching.

**Nhược & cách bù**
- Không share giữa containers → mỗi container warm-up 1 lần (1 query Mongo / TTL / container — chấp nhận được).
- Không invalidation cross-process → **TTL ngắn là chiến lược**, đổi config trễ tối đa TTL.
- Cache trong Next.js backoffice (long-running) cần chú ý memory bound → luôn dùng `max` của lru-cache.

### 3.2. ElastiCache Serverless for Valkey — lựa chọn L2 tốt nhất *nếu* chấp nhận VPC

**Ưu**
- AWS-native: IAM, CloudWatch, security group. Valkey rẻ hơn Redis OSS 33%, floor chỉ ~$6/tháng.
- Auto-scale, không phải size node. Latency <1ms trong VPC.
- Phù hợp dài hạn khi Operator platform ra đời (ví, session, rate-limit — theo `docs/operator/operator-platform-design.md` đã định hướng ElastiCache).

**Nhược — chi phí kiến trúc thật sự**
- **Bắt buộc VPC-attach 12 Lambda apps**: sửa 11 serverless.yml + backoffice, tạo subnets/security groups.
- Lambda trong VPC muốn ra internet (Mongo Atlas `mongodb+srv`, tenant callback URLs) cần **NAT Gateway** (~$32/tháng + $0.045/GB) hoặc VPC endpoints — đây là chi phí ẩn lớn nhất, cả về tiền và độ phức tạp.
- Cold start tăng nhẹ (ENI đã cải thiện nhiều từ 2019 nhưng vẫn không phải zero).

→ **Kết luận**: đúng đắn cho Phase 3 / Operator platform, **quá đắt về kiến trúc cho nhu cầu cache config hiện tại**.

### 3.3. Redis Cloud (Redis Inc)

- Managed Redis đầy đủ module (Search, JSON, Bloom), multi-cloud.
- Kết nối public endpoint (TLS) → **không cần VPC** — Lambda hiện tại connect được ngay, chỉ cần thêm `REDIS_URI` vào env/SSM (code `@megawin/cache` đã tương thích).
- Latency qua public internet 5–20ms — chấp nhận được cho cache config, không lý tưởng cho hot path per-request.
- Free tier 30MB đủ cho toàn bộ hot data hiện tại của megawin. Paid từ ~$7/tháng.
- Nhược: thêm 1 vendor ngoài AWS, không IAM; nếu muốn latency thấp phải mua VPC peering (đắt).

### 3.4. Upstash Redis — L2 "không VPC" hấp dẫn nhất cho serverless

- **Thiết kế cho serverless**: REST API (không cần TCP connection pooling — hợp Lambda), pay-per-request $0.2/100K commands, scale-to-zero, free tier 500K commands/tháng.
- Không cần VPC, không NAT — thêm env là chạy.
- Với traffic cache-read của megawin hiện tại (đa số hit sẽ được L1 chặn trước), volume tới Upstash rất thấp → gần như **miễn phí ở giai đoạn đầu**.
- Nhược: latency 1–10ms (region gần — có Singapore `ap-southeast-1` khớp region megawin); per-request pricing đắt dần nếu volume rất lớn (>100M commands/ngày → chuyển ElastiCache có lợi hơn).

### 3.5. Momento

- Serverless cache thuần, zero-config, rẻ nhất cho pure caching volume lớn.
- Nhược: API riêng (không phải Redis protocol) → `RedisRepository` sẵn có không dùng được, lock-in API; không đủ data structures cho distributed lock/rate-limit sau này. **Không khuyến nghị** cho megawin.

### 3.6. API Gateway / CloudFront cache — tầng bị bỏ quên

Cho các endpoint polling công khai (`get-current-draw`, `get-jackpot`, `list-draw-results`, `get-draw-result`):

- API Gateway cache hoặc CloudFront TTL 3–60s **gộp toàn bộ polling storm về 1 request tới Lambda** — hiệu quả hơn mọi app-level cache vì chặn từ trước khi Lambda invoke (tiết kiệm cả tiền Lambda invocation).
- Không sửa code, chỉ sửa infra config. Đánh đổi: cache theo URL, cần cẩn thận với response có phần tenant-specific (các endpoint này authenticate bằng player token — cần vary theo tenant hoặc chỉ áp dụng cho phần response chung).

## 4. Ma trận quyết định

| Nhu cầu | Giải pháp đúng |
|---|---|
| Giảm Mongo reads cho config/auth (hiện tại) | **L1 in-memory TTL 30–60s** |
| Chặn polling storm (current-draw, jackpot, results) | **API Gateway/CloudFront cache** hoặc L1 TTL 3–10s |
| Khoá tenant/game **tức thời** (< 1s) cross-process | L2 Redis (pub/sub hoặc key check) |
| Distributed lock, rate-limit, idempotency key | L2 Redis |
| Session/ví/leaderboard cho Operator platform (tương lai) | **ElastiCache Serverless Valkey** (lúc đó operator-wallet-svc chạy ECS trong VPC sẵn) |

## 5. Khuyến nghị chốt

1. **Phase 1 (ngay)**: L1 in-memory — zero cost, giải quyết phần lớn giá trị.
2. **Phase 2**: API Gateway cache cho polling endpoints.
3. **Phase 3 (khi có nhu cầu thật)**: L2 Redis:
   - Nếu vẫn chưa có VPC: **Upstash** (Singapore region, REST, không đổi networking) — con đường ít ma sát nhất.
   - Nếu Operator platform khởi động (đã cần VPC cho Postgres/ECS): **ElastiCache Serverless for Valkey** — chuẩn dài hạn, và migrate cache core sang cùng cluster.
   - `@megawin/cache` thiết kế theo interface (xem [03](./03-thiet-ke-package-cache.md)) nên việc chọn backend L2 sau này **không ảnh hưởng consumer code**.
4. **Không chọn**: Momento (lock-in API), ElastiCache node-based (over-provisioning cho nhu cầu hiện tại), Redis OSS Serverless (đắt hơn Valkey 33% không lý do).
