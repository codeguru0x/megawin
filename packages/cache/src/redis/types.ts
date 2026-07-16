/**
 * Type công khai của Redis layer — suy trực tiếp từ package `redis`.
 *
 * Tách khỏi `repository.ts` để `RedisRepository` chỉ còn logic, còn type dùng
 * chung (client, multi, sorted-set option…) gom một chỗ, export sạch qua barrel.
 * `redis` KHÔNG export nhiều type này ra public API (đã kiểm tra v5 & v6), nên
 * suy từ signature thật của `RedisClient` — tự đồng bộ khi bump version, không
 * sửa tay.
 */

import type { RedisClientType } from "redis";

/**
 * Alias client type của package `redis`.
 *
 * Dùng `RedisClientType` (generic ở dạng default) thay cho
 * `ReturnType<typeof createClient>`: `createClient()` không truyền generic trả
 * về `RedisClientType<RedisDefaultModules, {}, {}, 3, {}>`, còn `ReturnType<...>`
 * lại giải generic ở dạng constraint (`RedisModules`, `RespVersions`…) → 2 type
 * không gán được cho nhau (bug generic-default của redis@6). `RedisClientType`
 * khớp chính xác giá trị runtime nên loại được mismatch.
 */
export type RedisClient = RedisClientType;

/** Alias type multi/transaction trả ra từ `client.multi()`. */
export type RedisMultiCommand = ReturnType<RedisClient["multi"]>;

/** Mode cho EXPIRE/PEXPIRE — NX: chỉ khi chưa có TTL, XX: chỉ khi đã có, GT/LT: chỉ khi lớn/nhỏ hơn TTL hiện tại. */
export type ExpireMode = "NX" | "XX" | "GT" | "LT";

/**
 * Command options của 1 lệnh Redis (timeout, abortSignal, asap, typeMapping…).
 *
 * Suy từ tham số của `client.withCommandOptions` — `redis@6` không export type
 * này ra public API sạch. Dùng để truyền timeout/abortSignal per-nhóm-lệnh
 * xuống repo mà không hard-code shape (tự đồng bộ khi bump version).
 */
export type RedisCommandOptions = Parameters<RedisClient["withCommandOptions"]>[0];

/**
 * `ElementOf` phải là generic thật (không alias tĩnh) để TypeScript distribute
 * đúng qua từng nhánh của union — bóc phần tử ra khỏi kiểu mảng tham số.
 */
type ElementOf<T> = T extends readonly unknown[] ? T[number] : T;

/** Kiểu 1 member của sorted set — suy từ tham số thật của `zAdd`. */
export type SortedSetMember = ElementOf<Parameters<RedisClient["zAdd"]>[1]>;

/** Options của lệnh ZADD (NX/XX/GT/LT/CH…). */
export type ZAddOptions = NonNullable<Parameters<RedisClient["zAdd"]>[2]>;

/** Options của lệnh ZRANGE (REV/LIMIT/BY…). */
export type ZRangeOptions = NonNullable<Parameters<RedisClient["zRange"]>[3]>;

/** Options của lệnh ZRANGEBYSCORE. */
export type ZRangeByScoreOptions = NonNullable<Parameters<RedisClient["zRangeByScore"]>[3]>;
