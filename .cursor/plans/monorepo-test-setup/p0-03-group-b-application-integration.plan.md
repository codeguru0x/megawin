# p0-03 — Nhóm B: Application / infra (Node + Mongo)

Scaffold Vitest cho tầng application/infra. Đây là nhóm RỦI RO CAO NHẤT vì test integration chạy
trên DB staging chung → BẮT BUỘC dùng `integrationConfig` (có `db-guard`) cho package chạm Mongo,
và tuân tuyệt đối Cursor rule `test-data-safety.mdc`.

## Phân loại trong nhóm

### B1 — Chạm Mongo → `integrationConfig` + `db-guard` + `global-setup`

- `game-core-application` — repos (entry-feed, ticket-counter, tx-intent, player-settle-*),
  mappers, services (debit-player). Xem
  [packages/game-core-application/src/infras](../../../packages/game-core-application/src/infras).
- `tenant-gateway` — balance/tx-logs use-cases, infras.
- `tenant-dispatch` — enqueue/process/admin use-cases, infras.
- `worker-core` — lock/health/admin use-cases (distributed lock — cần Mongo).

### B2 — Phần lớn pure → `nodeConfig` (không db-guard)

- `identity` — chỉ có `entities/` (account, claim, tenant, labels). Test pure: role/claim logic.
- `http-client` — `http-client.ts`, `retry.ts`. Test pure: retry backoff, error mapping (mock fetch).
- `auth` — authorization middleware/handler-wrappers. Phần lớn pure logic + có thể mock. Đánh giá
  từng file: nếu chạm DB (tenant-api-key-auth) → tách file test đó sang `integrationConfig`.

## Mẫu tham chiếu (B1 — integration)

[packages/game-power655-application/test/use-cases/global-config.test.ts](../../../packages/game-power655-application/test/use-cases/global-config.test.ts):

- Seed helper idempotent (upsert) tại `test/**/helpers/seed-*.ts` —
  [seed-global-config.ts](../../../packages/game-power655-application/test/use-cases/helpers/seed-global-config.ts).
- `beforeAll` seed; `afterAll` cleanup SCOPED (mirror filter seed).
- Cleanup dùng filter định danh (`{ scope: GameConfigScope.Global }`), TUYỆT ĐỐI không `deleteMany({})`.

`global-setup.ts` mẫu ([power655](../../../packages/game-power655-application/test/global-setup.ts)):
build deps qua turbo filter theo TÊN package (thay `@megawin/game-power655-application` bằng tên
package đang scaffold).

## Việc cho MỖI package B1

1. devDeps mirror `game-power655-application` (`@megawin/vitest-config`, `vitest`, `vite`, `next`,
   `@types/node`).
2. `vitest.config.ts` dùng `integrationConfig`; khai báo `globalSetup: ["test/global-setup.ts"]`
   với turbo filter đúng tên package. `setupFiles` trỏ `@megawin/vitest-config/setup-db-guard`.
3. `test/global-setup.ts` (build deps), sample test + `test/**/helpers/seed-*.ts`.
4. `package.json` scripts: `pretest`=`build:deps`, `test`, `test:watch`.
5. Thêm vào [vitest.workspace.ts](../../../vitest.workspace.ts).

## Việc cho MỖI package B2 (pure)

Như p0-02 (nodeConfig, không db-guard, không global-setup).

## QUY TẮC BẢO VỆ DỮ LIỆU TEST (bắt buộc cho MỌI test B1)

Vì DB dùng chung staging, mọi test B1 PHẢI:

- Mọi record test tạo ra mang MARKER nhận diện (prefix ticketNo test, `drawId` sentinel, hoặc
  field `__test__`) để cleanup chỉ chạm data test.
- `delete*`/`update*` PHẢI có filter SCOPED khớp chính xác record test đã seed. CẤM filter rỗng.
- Cleanup `afterAll`/`afterEach` MIRROR đúng filter `beforeAll`; không "dọn rộng".
- Seed helper idempotent (upsert).

Chi tiết đầy đủ ở Cursor rule `.cursor/rules/test-data-safety.mdc` — rule này là chốt chặn tĩnh;
`db-guard` runtime (p0-01) là chốt chặn động; Biome GritQL ([p2-01](p2-01-biome-gritql-guard.plan.md))
là chốt chặn CI tương lai.

## Trọng tâm coverage đề xuất

- `game-core-application`: `buildTicketNo` counter monotonic per account; entry-feed cursor
  pagination; tx-intent idempotency.
- `tenant-gateway`: balance query mapping, tx-log write scoped.
- `tenant-dispatch`: build-dispatch-order, enqueue idempotency.
- `worker-core`: acquire/release distributed lock (TTL, contention).
- `identity`: role/claim resolution.
- `http-client`: retry policy (max attempts, backoff, retryable status).

## Verify

- Chạy 1 package B1 với `MONGODB_URI` local: `pnpm --filter @megawin/tenant-gateway test`.
- Xác nhận db-guard THROW khi URI trỏ staging mà không set `ALLOW_DB_TESTS`.
