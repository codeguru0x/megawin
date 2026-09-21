/**
 * RedisCacheStore fail-open + RedisRepository fail-fast (p0-00 Phần B).
 *
 * - Connect fail (port đóng): store miss nhanh + circuit; repo throw.
 * - Command hang (spy getJson không resolve): store cắt đúng commandDeadline,
 *   KHÔNG mở circuit (A7 — connection giữ nguyên).
 *
 * `redisEnvKey` broken = env riêng — không sửa `REDIS_URI` của global-setup,
 * không tạo/sửa `.env*`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_REDIS_COMMAND_TIMEOUT_MS, DEFAULT_REDIS_CONNECT_DEADLINE_MS } from "../../src/constants";
import { getRedisClient } from "../../src/redis/client";
import { RedisCircuitOpenError } from "../../src/redis/errors";
import { RedisRepository } from "../../src/redis/repository";
import { RedisCacheStore } from "../../src/stores/redis-store";

/** Env key riêng — trỏ port đóng, không đụng REDIS_URI sống. */
const BROKEN_ENV_KEY = "REDIS_URI_BROKEN";

beforeEach(async () => {
  const client = await getRedisClient();
  await client.flushDb();
  process.env[BROKEN_ENV_KEY] = "redis://127.0.0.1:6399";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("B0 — pin Redis 8.6 + không có rate-limit native", () => {
  it("redis_version là 8.6.x", async () => {
    const client = await getRedisClient();
    const info = await client.info("server");
    const match = /redis_version:(\d+\.\d+\.\d+)/.exec(info);
    expect(match?.[1]).toMatch(/^8\.6\./);
  });

  it("COMMAND INFO GCRA INCREX CL.THROTTLE đều nil", async () => {
    const client = await getRedisClient();
    const reply = await client.sendCommand(["COMMAND", "INFO", "GCRA", "INCREX", "CL.THROTTLE"]);
    expect(reply).toEqual([null, null, null]);
  });
});

describe("RedisCacheStore — fail-open khi Redis chết (connect)", () => {
  it("get() → undefined, không throw", async () => {
    const store = new RedisCacheStore({ redisEnvKey: BROKEN_ENV_KEY });
    await expect(store.get("k")).resolves.toBeUndefined();
  });

  it("get() hoàn thành < DEFAULT_REDIS_CONNECT_DEADLINE_MS", async () => {
    // Env key riêng để đo connect lần đầu (chưa circuit open từ test khác).
    const envKey = `${BROKEN_ENV_KEY}_DEADLINE_${Date.now()}`;
    process.env[envKey] = "redis://127.0.0.1:6399";
    const store = new RedisCacheStore({ redisEnvKey: envKey });
    const started = Date.now();
    await store.get("k");
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(DEFAULT_REDIS_CONNECT_DEADLINE_MS);
  });

  it("set() / delete() với Redis chết → resolve, không throw", async () => {
    const store = new RedisCacheStore({ redisEnvKey: BROKEN_ENV_KEY });
    await expect(store.set("k", { v: 1 }, 60)).resolves.toBeUndefined();
    await expect(store.delete("k")).resolves.toBeUndefined();
  });

  it("lời gọi thứ hai nhanh hơn lần đầu rõ rệt (< 50ms) nhờ circuit", async () => {
    const envKey = `${BROKEN_ENV_KEY}_CIRCUIT_${Date.now()}`;
    process.env[envKey] = "redis://127.0.0.1:6399";
    const store = new RedisCacheStore({ redisEnvKey: envKey });

    const t0 = Date.now();
    await store.get("k");
    const firstMs = Date.now() - t0;

    const t1 = Date.now();
    await store.get("k");
    const secondMs = Date.now() - t1;

    expect(firstMs).toBeGreaterThan(0);
    expect(secondMs).toBeLessThan(50);
    expect(secondMs).toBeLessThan(firstMs);
  });

  it("RedisRepository với Redis chết → throw (fail-fast)", async () => {
    const repo = new RedisRepository(BROKEN_ENV_KEY);
    await expect(repo.get("k")).rejects.toThrow();
  });

  /**
   * §3 review 2026-09-21 — chống log storm.
   *
   * Circuit đang mở = degrade ĐÃ BIẾT, đã log đúng 1 lần lúc mở. Log lại ở mỗi
   * lời gọi trong cửa sổ không thêm thông tin nhưng sinh hàng nghìn dòng/giây khi
   * Redis down. Test bắt regression: ai đó đổi `RedisCircuitOpenError` về `Error`
   * trần là `logFailOpen` log lại ngay.
   */
  it("circuit mở → KHÔNG log warn/error ở mỗi lời gọi (chống log storm)", async () => {
    const envKey = `${BROKEN_ENV_KEY}_NOLOG_${Date.now()}`;
    process.env[envKey] = "redis://127.0.0.1:6399";
    const store = new RedisCacheStore({ redisEnvKey: envKey });

    // Lời gọi 1: connect fail thật → log 1 lần (ở connectClient) + mở circuit.
    await store.get("k");

    // Chỉ spy TỪ ĐÂY: mọi lời gọi sau đều rơi vào nhánh circuit-open.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await Promise.all([store.get("k1"), store.get("k2"), store.set("k3", { v: 1 }, 60), store.delete("k4")]);

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  /**
   * Lỗi circuit phải là `RedisCircuitOpenError` (không `Error` trần): caller ghi
   * dữ liệu nghiệp vụ dựa vào class này để biết lệnh **CHẮC CHẮN CHƯA CHẠY** —
   * khác `DeadlineExceededError` (UNKNOWN). Xem JSDoc `RedisRepository`.
   */
  it("circuit mở → throw RedisCircuitOpenError", async () => {
    const envKey = `${BROKEN_ENV_KEY}_TYPE_${Date.now()}`;
    process.env[envKey] = "redis://127.0.0.1:6399";

    // Lời gọi 1 mở circuit.
    await getRedisClient(envKey).catch(() => undefined);

    const error = await getRedisClient(envKey).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(RedisCircuitOpenError);
  });

  it("lỗi connect giữ `cause` là lỗi gốc (truy được nguyên nhân thật)", async () => {
    const envKey = `${BROKEN_ENV_KEY}_CAUSE_${Date.now()}`;
    process.env[envKey] = "redis://127.0.0.1:6399";

    // `getRedisClient` (không qua store fail-open) để bắt đúng Error đã bọc.
    const error = await getRedisClient(envKey).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(Error);
    // Message không lộ chi tiết hạ tầng, nhưng cause phải còn.
    expect((error as Error).message).toContain(envKey);
    expect((error as Error).cause).toBeInstanceOf(Error);
  });
});

describe("RedisCacheStore — command-phase deadline (A7)", () => {
  /**
   * Không dựng TCP stall proxy trong CI: sau khi connect thật thành công,
   * spy `getJson` treo vô hạn → `runCommand` phải cắt bằng `withDeadline`, miss,
   * và KHÔNG mở circuit **connect** (connection vẫn khoẻ — A7). Mỗi lời gọi trả
   * giá đúng `deadlineMs` — không có circuit riêng cho pha command (đã bỏ, review
   * 2026-09-21: không caller nào cần cộng dồn latency bị chặn khi connection vẫn
   * `isOpen && isReady`; đường `get`+`set` của cache-miss chấp nhận trả 2×deadline).
   */
  it("command treo → miss trong commandTimeoutMs, mỗi lần gọi đều trả giá trọn deadline", async () => {
    const deadlineMs = 50;
    const store = new RedisCacheStore({ commandTimeoutMs: deadlineMs });

    // Warm connect trên REDIS_URI sống — getClient() phải OK trước khi op treo.
    await store.set("warm", { v: 1 }, 60);
    expect(await store.get("warm")).toEqual({ v: 1 });

    vi.spyOn(RedisRepository.prototype, "getJson").mockImplementation(
      () =>
        new Promise(() => {
          // Không bao giờ resolve — mô phỏng command đã gửi mà không có reply.
        }),
    );

    const t0 = Date.now();
    const first = await store.get("warm");
    const firstMs = Date.now() - t0;

    expect(first).toBeUndefined();
    expect(firstMs).toBeGreaterThanOrEqual(deadlineMs - 5);
    expect(firstMs).toBeLessThan(deadlineMs + 150);

    // Không có circuit command → lần 2 vẫn trả giá trọn deadline, không phải ~0ms.
    const t1 = Date.now();
    const second = await store.get("warm");
    const secondMs = Date.now() - t1;

    expect(second).toBeUndefined();
    expect(secondMs).toBeGreaterThanOrEqual(deadlineMs - 5);
    // Không liên quan tới connect deadline hằng (tránh nhầm với #12).
    expect(secondMs).toBeLessThan(DEFAULT_REDIS_COMMAND_TIMEOUT_MS + 200);
  });

  /**
   * `runCommand` nhận `deadlineMs` tuỳ chọn; `deleteByPrefix` PHẢI truyền trần
   * admin (15s) chứ không dùng mặc định hot path
   * (`DEFAULT_REDIS_COMMAND_TIMEOUT_MS` = 500ms). Regression này bắt ca refactor
   * vô tình để `deleteByPrefix` rơi về trần hot path → SCAN keyspace lớn bị cắt
   * oan, invalidate âm thầm không chạy.
   */
  it("deleteByPrefix dùng trần admin, không bị cắt ở commandTimeoutMs", async () => {
    // commandTimeoutMs cố tình ĐẶT RẤT THẤP: nếu deleteByPrefix dùng trần này
    // thì op 200ms dưới đây chắc chắn bị cắt.
    const store = new RedisCacheStore({ commandTimeoutMs: 20 });

    // Warm connect thật trước khi spy.
    await store.set("warm", { v: 1 }, 60);

    const spy = vi
      .spyOn(RedisRepository.prototype, "deleteByPrefix")
      // Repo trả số key đã xoá; ở đây chỉ cần op chạy đủ 200ms.
      .mockImplementation(() => new Promise<number>((resolve) => setTimeout(() => resolve(0), 200)));

    const t0 = Date.now();
    await store.deleteByPrefix("any:");
    const elapsed = Date.now() - t0;

    // Chạy trọn 200ms → KHÔNG bị cắt ở 20ms.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(elapsed).toBeGreaterThanOrEqual(190);
  });
});
