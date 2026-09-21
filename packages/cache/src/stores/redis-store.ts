/**
 * RedisCacheStore — L2 distributed cache, adapter FAIL-OPEN trên RedisRepository.
 *
 * RedisRepository (`src/redis/repository.ts`) đúng JSON + EX semantics nhưng
 * THROW khi connect/command fail — không dùng trực tiếp trên hot path. Adapter
 * này bọc try/catch + deadline để đảm bảo contract CacheStore:
 * - Mọi lỗi Redis → log + degrade về cache-miss/no-op, KHÔNG throw ra consumer.
 * - MỌI lệnh đi qua `runCommand` — bọc `withDeadline` với trần truyền vào. Hot
 *   path (get/set/delete) mặc định {@link DEFAULT_REDIS_COMMAND_TIMEOUT_MS}
 *   (500ms): cache chậm hơn DB thì vô nghĩa. Vượt deadline → **bỏ qua lệnh đó**,
 *   connection giữ nguyên (xem `runCommand` cho lý do không huỷ connection, và
 *   vì sao trần là bắt buộc kể cả khi connection đang khoẻ).
 * - Vượt deadline ghi `logError` kèm hướng dẫn tăng cấu hình; lỗi Redis khác chỉ
 *   `logWarn`; lỗi "circuit connect đang mở" **không log** (xem `logFailOpen`) —
 *   để alert bắt đúng cái cần người xử lý, không bị log storm dìm.
 * - Pha **connect** không nằm trong trần command đó: được siết bởi
 *   `DEFAULT_REDIS_CONNECT_*` + circuit trong `getRedisClient` (p0-00).
 *   Trước p0-00, Redis down làm `connect()` treo vô hạn → fail-open không chạy.
 * - `deleteByPrefix` dùng trần RỘNG `DEFAULT_REDIS_ADMIN_TIMEOUT_MS` (15s), không
 *   phải trần hot path: SCAN keyspace lớn kéo dài hợp lệ, nhưng vẫn phải có cận trên.
 * - `Date` được encode/decode qua `json-date-codec.ts`: `CacheStore.get<T>()` hứa trả `T`, nên
 *   không được để JSON round-trip âm thầm biến `Date` thành string (bug thật đã bắt 17/08 —
 *   xem đầu file codec).
 *
 * Backend hiện tại là Redis; tương lai Memcached/DynamoDB DAX… chỉ cần viết
 * store mới implement `CacheStore` — consumer không đổi 1 dòng nào.
 */

import { logError, logWarn } from "@megawin/shared/utils";

import { DEFAULT_REDIS_ADMIN_TIMEOUT_MS, DEFAULT_REDIS_COMMAND_TIMEOUT_MS, DEFAULT_REDIS_ENV_KEY } from "../constants";
import { RedisCircuitOpenError } from "../redis/errors";
import { RedisRepository } from "../redis/repository";
import { DeadlineExceededError, withDeadline } from "../redis/with-deadline";
import type { CacheStore } from "../types";
import { decodeCacheValue, encodeCacheValue } from "./json-date-codec";

export interface RedisCacheStoreOptions {
  /**
   * Env key chứa Redis URI. Mặc định {@link DEFAULT_REDIS_ENV_KEY} (`"REDIS_URI"`).
   *
   * KHÔNG thừa: cho phép trỏ instance Redis riêng khi muốn tách workload nặng
   * (rate-limit, leaderboard…) khỏi instance cache chung. Đa số dùng mặc định.
   */
  redisEnvKey?: string;
  /**
   * Timeout mỗi Redis command (ms). Mặc định
   * {@link DEFAULT_REDIS_COMMAND_TIMEOUT_MS} (500ms) — vượt là coi như miss.
   */
  commandTimeoutMs?: number;
}

/**
 * Adapter fail-open bọc `RedisRepository`, biến mọi lỗi Redis thành cache-miss
 * để cache không bao giờ là hard dependency trên hot path.
 */
export class RedisCacheStore implements CacheStore {
  private readonly repo: RedisRepository;
  /** Env key của Redis instance — giữ để consumer biết store này trỏ đâu khi log. */
  private readonly redisEnvKey: string;
  /**
   * Trần thời gian mỗi lệnh HOT PATH (get/set/delete), tính bằng ms.
   *
   * ⚠️ KHÔNG dùng `commandOptions.timeout` của redis@6 — nó **không cắt được**
   * kịch bản nguy hiểm nhất: node-redis tháo timeout listener ngay khi command
   * rời queue ghi sang chờ reply (`commands-queue.js` quanh dòng 423–430), nên
   * command đã gửi mà server không trả lời (network stall, failover blackhole)
   * treo **vĩnh viễn**. Đo probe: `timeout: 300` vẫn treo >10s. Nó còn ĐẮT hơn:
   * `AbortSignal.timeout` + add/removeEventListener mỗi command → benchmark
   * 20k GET cho 25.7µs CPU/op so với 20.9µs của `withDeadline`.
   *
   * ⚠️ Chỉ phủ pha **command**. Pha connect do
   * `DEFAULT_REDIS_CONNECT_TIMEOUT_MS` + `reconnectStrategy` giới hạn + circuit
   * trong `getRedisClient` (p0-00) — trước đó Redis down treo vô hạn.
   */
  private readonly commandDeadlineMs: number;

  constructor(options: RedisCacheStoreOptions = {}) {
    // Không truyền redisEnvKey → dùng env mặc định chung (DRY, 1 nguồn sự thật).
    this.redisEnvKey = options.redisEnvKey ?? DEFAULT_REDIS_ENV_KEY;
    this.repo = new RedisRepository(this.redisEnvKey);
    this.commandDeadlineMs = options.commandTimeoutMs ?? DEFAULT_REDIS_COMMAND_TIMEOUT_MS;
  }

  /**
   * Chạy 1 lệnh Redis có trần thời gian. Vượt trần → throw cho caller degrade
   * fail-open (miss/no-op). **KHÔNG huỷ connection.**
   *
   * Dùng cho MỌI lệnh trong class — hot path (`get`/`set`/`delete`, mặc định
   * {@link commandDeadlineMs} = {@link DEFAULT_REDIS_COMMAND_TIMEOUT_MS}) và
   * admin (`deleteByPrefix`, truyền {@link DEFAULT_REDIS_ADMIN_TIMEOUT_MS} = 15s).
   * Khác biệt duy nhất giữa 2 nhóm là CON SỐ; phần còn lại (gọi `getClient()`
   * ngoài trần, bọc `withDeadline`, throw để caller fail-open) giống hệt nhau nên
   * KHÔNG tách thành 2 hàm — tách ra thì mỗi lần sửa cơ chế phải sửa 2 chỗ.
   *
   * ⚠️ Trần này **bắt buộc**, cả khi connection đang `isOpen && isReady`. Niềm
   * tin "connection khoẻ thì command chắc chắn settle" là SAI: node-redis tháo
   * timeout listener ngay khi command rời queue ghi sang chờ reply
   * (`commands-queue.js`: `if (toSend.timeout) { #removeTimeoutListener(...) }`
   * ngay trước `#waitingForReply.push(toSend)`), nên sau đó **chỉ** socket
   * `error` mới reject được nó. Network stall / NAT-SG drop im lặng không sinh
   * error → treo vô hạn. Đã đo qua proxy TCP tới Redis thật, bịt luồng dữ liệu
   * giữa phiên mà không đóng socket: `isOpen=true isReady=true` nhưng `GET`
   * KHÔNG settle sau 5s (cắt test ở đó), trong khi cùng kịch bản qua store này
   * trả miss quanh đúng `commandDeadlineMs`.
   *
   * Ca thường gặp hơn nhiều: `isOpen === true && isReady === false` (đang
   * reconnect). node-redis mặc định `disableOfflineQueue: false` → command
   * **xếp hàng chờ** reconnect xong chứ không fail nhanh. Không có trần thì mỗi
   * cache call trong cửa sổ đó cộng nguyên thời gian reconnect vào request.
   *
   * Vì sao không huỷ: vượt deadline có 2 nguyên nhân, và không phân biệt được
   * rẻ tiền giữa chúng ngay tại chỗ —
   *
   * | Nguyên nhân | Connection | Hệ quả nếu huỷ |
   * |---|---|---|
   * | Redis/mạng chỉ CHẬM (noisy neighbor, BGSAVE fork, value lớn, spike cross-AZ) | KHOẺ | **Tự gây sự cố**: đã đo — 1 spike 400ms duy nhất làm mất cache trọn `REDIS_CIRCUIT_OPEN_MS` = 5s dù Redis nhanh lại ngay |
   * | Connection treo (network stall, SG/NAT drop im lặng) | CHẾT | Mỗi lệnh sau vẫn miss sau đúng `commandDeadlineMs` — chậm hơn circuit, nhưng **không bao giờ treo** |
   *
   * Chọn không huỷ: cái giá của nhánh 2 (mỗi cache call +`commandDeadlineMs` trong
   * lúc mạng chết) rẻ hơn cái giá của nhánh 1 (mất cache 5s mỗi lần latency spike,
   * xảy ra thường xuyên hơn nhiều). Quan trọng nhất: **cả 2 nhánh đều không treo
   * request** — đó là mục tiêu.
   *
   * ⚠️ ĐÃ CÂN NHẮC VÀ BỎ: "đếm N deadline liên tiếp → destroy client" (self-heal
   * stall). Lý do chính: **node-redis đã tự chữa** — nó bật keepalive MẶC ĐỊNH
   * (`keepAlive: true`, `keepAliveInitialDelay = 30_000` trong
   * `@redis/client/dist/lib/client/socket.js` + `defaults.js`), và proxy Redis
   * Enterprise phía server cũng keepalive (`client_keepidle=180`,
   * `client_keepintvl=30`, `client_keepcnt=6`) → stall **có cận trên**, không
   * "vĩnh viễn". Thêm vào đó, ngưỡng nào đủ nhỏ để hữu ích (3 × 500ms = 1500ms)
   * cũng đủ nhỏ để spike THẬT kích hoạt → huỷ connection khoẻ nhiều hơn là bắt
   * được stall. KHÔNG thêm lại nếu không có log prod chứng minh.
   *
   * ⚠️ `getClient()` được gọi TRƯỚC, NGOÀI `withDeadline` — bắt buộc. Các method
   * của repo tự gọi `getClient()` bên trong, nên nếu bọc thẳng thì pha **connect**
   * cũng bị ép vào trần command (500ms). Connect Redis Cloud có TLS cross-AZ tốn
   * ~600ms và đã có trần riêng `DEFAULT_REDIS_CONNECT_DEADLINE_MS`; ép trần
   * command làm mọi cold start fail → cache chết vĩnh viễn mà log chỉ báo "vượt
   * deadline" (đã đo và bắt được ca này). Sau khi `getClient()` resolve, client
   * nằm trong cache của `getRedisClient` nên lời gọi thứ hai trong `op()` chỉ là
   * Map lookup — đo được **0.296µs**, ~1% chi phí 1 command (25µs).
   *
   * @param label      - Tên lệnh, đi vào message lỗi để log truy được.
   * @param op         - Hàm chạy lệnh Redis thật.
   * @param deadlineMs - Trần riêng cho lệnh này. Mặc định {@link commandDeadlineMs}
   *                     (hot path). Chỉ truyền cho thao tác admin chạy dài hợp lệ.
   */
  private async runCommand<T>(
    label: string,
    op: () => Promise<T>,
    deadlineMs: number = this.commandDeadlineMs,
  ): Promise<T> {
    // Pha connect: trần + circuit riêng trong getRedisClient (p0-00). Throw ở đây
    // (circuit mở / connect fail) đi thẳng ra catch của caller → fail-open.
    await this.repo.getClient();

    return await withDeadline(op(), deadlineMs, label);
  }

  /**
   * Log 1 lần fail-open, phân mức theo nguyên nhân để alert không bị nhiễu.
   *
   * - `RedisCircuitOpenError` (circuit connect đang mở) → không log — đã log 1
   *   lần lúc mở circuit (`connectClient`), lặp lại mỗi lời gọi là log storm.
   * - Vượt deadline command → `logError`.
   * - Lỗi Redis khác (`WRONGTYPE`, connect fail…) → `logWarn`.
   *
   * @param op  - Tên thao tác (`get` / `set` / `delete` / `deleteByPrefix`).
   * @param err - Lỗi bắt được.
   * @param ctx - Context thêm (`key` hoặc `prefix`).
   */
  private logFailOpen(op: string, err: unknown, ctx: Record<string, unknown>): void {
    if (err instanceof RedisCircuitOpenError) {
      return;
    }

    if (err instanceof DeadlineExceededError) {
      logError("RedisCacheStore", err, { ...ctx, op, deadlineMs: err.deadlineMs, phase: "command" });
      return;
    }

    logWarn("RedisCacheStore", `${op} lỗi — degrade fail-open`, {
      ...ctx,
      op,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  /**
   * Đọc value theo key. FAIL-OPEN: lỗi/timeout Redis → trả `undefined` (miss).
   *
   * @param key - Cache key đầy đủ.
   * @returns Value đã cache, hoặc `undefined` khi miss / Redis lỗi.
   */
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const value = await this.runCommand("RedisCacheStore.get", () => this.repo.getJson<unknown>(key));
      // getJson trả null cho cả miss lẫn cached-null — envelope { v } của
      // cached-fetcher nằm bên trong value nên null ở đây luôn là miss.
      if (value === null) {
        return undefined;
      }
      // decodeCacheValue: dựng lại `Date` từ marker `{ "$date": ISO }` do `set` ghi. Không có bước
      // này thì `CacheStore.get<T>` trả về shape SAI so với `T` đã khai (Date thành string) —
      // xem `json-date-codec.ts` cho ca lỗi thật đã bắt được.
      return decodeCacheValue(value) as T;
    } catch (err) {
      this.logFailOpen("get", err, { key });
      return undefined;
    }
  }

  /**
   * Ghi value với TTL. FAIL-OPEN: lỗi/timeout Redis → bỏ qua, không throw.
   *
   * `ttlSec <= 0` → no-op (không cho phép key sống vô hạn trong cache).
   *
   * @param key    - Cache key đầy đủ.
   * @param value  - Value JSON-serializable (envelope `{ v }` của cached-fetcher).
   * @param ttlSec - TTL tính bằng giây; `<= 0` bỏ qua.
   */
  async set<T>(key: string, value: T, ttlSec: number): Promise<void> {
    if (ttlSec <= 0) {
      return;
    }
    try {
      // encodeCacheValue: `Date` → `{ "$date": ISO }` để `JSON.stringify` không làm mất kiểu.
      await this.runCommand("RedisCacheStore.set", () => this.repo.setJson(key, encodeCacheValue(value), ttlSec));
    } catch (err) {
      this.logFailOpen("set", err, { key, ttlSec });
    }
  }

  /**
   * Xoá 1 key. FAIL-OPEN: lỗi/timeout Redis → bỏ qua, không throw.
   *
   * Gọi từ invalidate use-case sau khi ghi DB. Nếu delete fail, entry vẫn tự
   * hết hạn theo TTL — staleness có cận trên, không kẹt vĩnh viễn.
   *
   * @param key - Cache key đầy đủ cần xoá.
   */
  async delete(key: string): Promise<void> {
    try {
      await this.runCommand("RedisCacheStore.delete", () => this.repo.delete(key));
    } catch (err) {
      this.logFailOpen("delete", err, { key });
    }
  }

  /**
   * Xoá mọi key bắt đầu bằng `prefix` (SCAN + DEL batch trong repo).
   * FAIL-OPEN: lỗi Redis → bỏ qua, không throw.
   *
   * Dùng {@link DEFAULT_REDIS_ADMIN_TIMEOUT_MS} thay cho {@link commandDeadlineMs}:
   * đây là thao tác ADMIN (bump version, flush cả namespace), hiếm gọi và SCAN
   * keyspace lớn có thể kéo dài HỢP LỆ → ép trần hot path (500ms) sẽ hỏng chức
   * năng. TUYỆT ĐỐI không gọi trên hot path.
   *
   * Nhưng VẪN phải có trần {@link DEFAULT_REDIS_ADMIN_TIMEOUT_MS}: fail-open chỉ
   * bảo vệ khi lệnh **settle**. Command đã gửi mà không có reply thì node-redis
   * không cắt được (xem `redis/with-deadline.ts`), nên "không trần" nghĩa là hàm
   * này treo tới khi Lambda/Vercel giết cả request — invalidate cache không được
   * phép làm chết request ghi DB đã thành công.
   *
   * @param prefix - Tiền tố key cần xoá hàng loạt.
   */
  async deleteByPrefix(prefix: string): Promise<void> {
    try {
      // Logic SCAN+DEL batch sống ở RedisRepository.deleteByPrefix.
      await this.runCommand(
        "RedisCacheStore.deleteByPrefix",
        () => this.repo.deleteByPrefix(prefix),
        DEFAULT_REDIS_ADMIN_TIMEOUT_MS,
      );
    } catch (err) {
      this.logFailOpen("deleteByPrefix", err, { prefix });
    }
  }
}
