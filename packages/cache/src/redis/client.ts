/**
 * Redis client factory — 1 connection per env key, lazy-connect, cache lại cho
 * cả process (connection pooling ngầm của node-redis).
 *
 * ⚠️ FAIL-FAST (p0-00): throw nhanh khi Redis không tới được, KHÔNG treo hot path.
 * Đúng 3 cơ chế, mỗi cơ chế phủ 1 gap ĐÃ ĐO ĐƯỢC — không có cái nào trùng nhau:
 *
 * | Cơ chế | Phủ gap nào |
 * |---|---|
 * | `socket.connectTimeout` + `reconnectStrategy` giới hạn | `connect()` retry vô hạn khi Redis không tới được (đo: treo >12s không reject) |
 * | `withDeadline` | node-redis gỡ `connectTimeout` NGAY khi TCP connect xong → pha RESP handshake sau đó không có trần (đo: treo vô hạn khi server accept TCP nhưng không trả lời) |
 * | `circuitOpenUntilMs` | Redis down → MỖI lời gọi trả giá full deadline. Thiết yếu cho Vercel (nhiều request/process) và Lambda (nhiều cache call/invocation) |
 *
 * `connecting` dedupe lời gọi concurrent cùng env key → đúng 1 connection (đo:
 * không có nó, `Promise.all` 2 cache call mở 2 connection, 1 leak vĩnh viễn).
 *
 * Phân mức log theo "có cần người xử lý không", không theo "có lỗi không": vượt
 * deadline pha connect → `logError` (có thể trần đặt thấp, cần người xem lại);
 * connect fail thường (ECONNREFUSED/DNS) → `logWarn` vì fail-open + circuit đã
 * xử lý đúng, không ai cần can thiệp lúc đó (xem `connectClient`).
 *
 * Với nhu cầu CACHE thuần (chấp nhận miss khi Redis down) hãy dùng
 * `RedisCacheStore` — adapter fail-open bọc ngoài. Đừng gọi thẳng client này
 * trên hot path nếu chưa tự xử lý lỗi.
 */

import { isDevNextJs, logError, logWarn } from "@megawin/shared/utils";
import { createClient, type RedisClientType } from "redis";

import {
  DEFAULT_REDIS_CONNECT_DEADLINE_MS,
  DEFAULT_REDIS_CONNECT_MAX_RETRIES,
  DEFAULT_REDIS_CONNECT_TIMEOUT_MS,
  DEFAULT_REDIS_ENV_KEY,
  REDIS_CIRCUIT_OPEN_MS,
} from "../constants";
import { RedisCircuitOpenError } from "./errors";
import { DeadlineExceededError, withDeadline } from "./with-deadline";

import "../types/declarations/global";

import type { RedisProcessState } from "./types";

/** State ở scope module — mỗi process 1 bản, sống suốt vòng đời. */
const __redisState__: RedisProcessState = {
  clients: new Map(),
  connecting: new Map(),
  circuitOpenUntilMs: new Map(),
};

/**
 * Lấy state phù hợp môi trường.
 *
 * Prod/worker: state ở scope module. Next.js dev: state trên `globalThis` để
 * HMR (Hot Module Replacement) reload module KHÔNG tạo connection mới → tránh
 * leak client mỗi lần sửa code.
 */
function getState(): RedisProcessState {
  if (!isDevNextJs()) {
    return __redisState__;
  }

  if (!globalThis.__nextJsRedisState) {
    globalThis.__nextJsRedisState = {
      clients: new Map(),
      connecting: new Map(),
      circuitOpenUntilMs: new Map(),
    };
  }

  return globalThis.__nextJsRedisState;
}

/**
 * Mở 1 connection mới cho `envKey`, ghi vào `state` khi thành công.
 *
 * Thất bại (hoặc vượt deadline) → mở circuit {@link REDIS_CIRCUIT_OPEN_MS} + throw.
 *
 * Retry của `reconnectStrategy` là **best-effort trong budget** của
 * {@link DEFAULT_REDIS_CONNECT_DEADLINE_MS} (5000ms), KHÔNG được cộng dồn vào
 * trần: fail nhanh (ECONNREFUSED ~1ms) vẫn kịp lần thử thứ 2; fail chậm
 * (black-hole) bị `withDeadline` cắt đúng hằng đó. Bản cũ 2500ms "chứa đủ"
 * 2 lần handshake × 1000ms — đo được 50 request đồng thời đều tốn ~2500ms, vô
 * nghĩa khi circuit đã cho thử lại sau 5s.
 *
 * ⚠️ `destroy()` trong nhánh catch KHÔNG chỉ để dọn: nó **huỷ được `connect()`
 * đang chạy** (đã verify: `connect()` reject `DisconnectsClientError` ngay sau
 * `destroy()`). Cần thiết vì `withDeadline` dùng `Promise.race` — chỉ bỏ chờ,
 * không tự huỷ. Không có dòng này, một connect về muộn sau deadline sẽ để lại
 * socket mở mà không ai giữ reference.
 */
async function connectClient(envKey: string, url: string, state: RedisProcessState): Promise<RedisClientType> {
  // Listener "error" bắt lỗi runtime SAU connect (mất kết nối giữa chừng…) —
  // không throw ở đây để client tự reconnect theo reconnectStrategy giới hạn.
  //
  // reconnectStrategy: KHÔNG dùng `false`. node-redis gọi `#shouldReconnect(0, err)`
  // khi socket đứt sau ready — `false` tại retries=0 → không bao giờ tự reconnect
  // sau blip mạng. Dạng `retries >= N ? false : 50` trả số ở retries=0 → cho phép
  // reconnect, vẫn dừng sau N lần thử lại (xem DEFAULT_REDIS_CONNECT_MAX_RETRIES).
  //
  // `50` không phải số tuỳ ý: `defaultReconnectStrategy` của node-redis
  // (`socket.js`) dùng công thức `min(2^retries * 50, 2000) + jitter(0-200)` cho
  // reconnect vô hạn — tại `retries=0` ra đúng `50`. Ta chỉ retry ĐÚNG 1 lần
  // (retries=0) nên lấy số hạng đầu của công thức gốc, bỏ phần exponential (không
  // bao giờ chạy tới retries=1,2…) và bỏ jitter (chỉ có ý nghĩa chống thundering
  // herd qua NHIỀU vòng retry, vô nghĩa với đúng 1 vòng).
  const client = createClient({
    url,
    socket: {
      connectTimeout: DEFAULT_REDIS_CONNECT_TIMEOUT_MS,
      reconnectStrategy: (retries) => (retries >= DEFAULT_REDIS_CONNECT_MAX_RETRIES ? false : 50),
    },
  }).on("error", (err) => logError("RedisClient", err, { redisEnvKey: envKey }));

  try {
    await withDeadline(client.connect(), DEFAULT_REDIS_CONNECT_DEADLINE_MS, "RedisClient.connect");
  } catch (error) {
    try {
      client.destroy();
    } catch {
      // Đã closed (connect tự reject trước deadline) — không có gì để huỷ.
    }

    state.circuitOpenUntilMs.set(envKey, Date.now() + REDIS_CIRCUIT_OPEN_MS);

    // Vượt deadline ≠ Redis down — có thể trần đang đặt thấp hơn latency thật.
    // Giữ log ở mức error vì đây là ca cần người xem lại; nhánh dưới (Redis
    // không tới được) đã có fail-open + circuit xử lý đúng nên chỉ warn.
    if (error instanceof DeadlineExceededError) {
      logError("RedisClient", error, { redisEnvKey: envKey, phase: "connect" });
    } else {
      logWarn("RedisClient", "Redis connect thất bại", { redisEnvKey: envKey });
    }

    // `cause`: giữ lỗi gốc (DeadlineExceededError / lỗi socket của node-redis) để
    // caller fail-fast bọc AppException vẫn truy được nguyên nhân thật, mà message
    // ra ngoài không lộ chi tiết hạ tầng.
    throw new Error(`Redis connect failed for env ${envKey}`, { cause: error });
  }

  state.circuitOpenUntilMs.delete(envKey);
  state.clients.set(envKey, client);

  return client;
}

/**
 * Lấy Redis client đã connect cho 1 env key (singleton per key, lazy-connect).
 *
 * @param redisEnvKey - Tên env chứa Redis URI. Mặc định {@link DEFAULT_REDIS_ENV_KEY}.
 * @returns Redis client đã connect, sẵn sàng chạy command.
 * @throws {RedisCircuitOpenError} Circuit connect đang mở — lệnh CHƯA gửi byte nào.
 * @throws {Error} Thiếu env, hoặc connect thất bại / vượt deadline (kèm `cause`).
 */
export const getRedisClient = async (redisEnvKey?: string): Promise<RedisClientType> => {
  // Không truyền → dùng env mặc định chung (DRY, không hard-code chuỗi rời rạc).
  const envKey = redisEnvKey ?? DEFAULT_REDIS_ENV_KEY;
  const state = getState();

  const cached = state.clients.get(envKey);

  if (cached) {
    // isOpen && !isReady = đang reconnect hợp lệ → vẫn dùng, command vào offline
    // queue và bị commandDeadlineMs của store cắt. KHÔNG drop ở trạng thái này.
    if (cached.isOpen) {
      return cached;
    }

    // isOpen === false: node-redis đã bỏ hẳn (reconnectStrategy trả false). Chỉ
    // cần xoá khỏi Map — KHÔNG gọi `destroy()`.
    //
    // Đã đọc source `@redis/client@6` để xác nhận `destroy()` ở đây là no-op,
    // cả 3 việc nó làm đều đã xong hoặc không áp dụng:
    // 1. `clearTimeout(#pingTimer)` — ta không set `pingInterval` nên không có timer.
    // 2. `#queue.flushAll(...)` — node-redis ĐÃ flush: `#shouldReconnect` set
    //    `#isOpen = false` TRƯỚC khi emit `error`, và listener `error` của client
    //    thấy `!isOpen` nên gọi đúng `flushAll(err)` (`client/index.js`
    //    `#attachListeners`). Queue đã rỗng khi tới đây.
    // 3. `#socket.destroy()` — **throw `ClientClosedError`** vì socket đã closed,
    //    nên mọi bước SAU nó trong `destroy()` (`#unregisterFromMetrics`,
    //    `credentialsSubscription.dispose`) KHÔNG BAO GIỜ chạy → gọi `destroy()`
    //    không dọn thêm được gì. (`ClientRegistry` cũng là NoOp khi chưa
    //    `OpenTelemetry.init()` — xem `opentelemetry/client-registry.js`.)
    //
    // Xoá khỏi Map → hết reference → GC dọn. Socket đã do node-redis tự destroy.
    state.clients.delete(envKey);
  }

  // Đã có lời gọi khác đang connect → join, không mở connection thứ 2. Không có
  // `await` nào phía trên nên 2 lời gọi concurrent luôn thấy Map đúng thứ tự.
  const inflight = state.connecting.get(envKey);
  if (inflight) {
    return inflight;
  }

  // Circuit đang mở → throw ngay (0 RTT), không thử connect. Adapter fail-open
  // bắt → cache miss ~0ms thay vì cộng full deadline vào mỗi request.
  const openUntilMs = state.circuitOpenUntilMs.get(envKey);
  if (openUntilMs !== undefined && Date.now() < openUntilMs) {
    // Class riêng, KHÔNG `Error` trần: `RedisCacheStore` bỏ qua không log lỗi này
    // (sự kiện đáng log là lúc MỞ circuit, đã log 1 lần ở `connectClient`), và
    // caller ghi dữ liệu biết chắc lệnh CHƯA chạy — xem `RedisCircuitOpenError`.
    throw new RedisCircuitOpenError(`env ${envKey}`, openUntilMs);
  }

  // Lấy URI từ env — thiếu là lỗi cấu hình, fail sớm để dễ phát hiện.
  const url = process.env[envKey];

  if (!url) {
    throw new Error(`Missing env ${envKey}`);
  }

  const attempt = connectClient(envKey, url, state).finally(() => {
    state.connecting.delete(envKey);
  });

  state.connecting.set(envKey, attempt);

  return attempt;
};
