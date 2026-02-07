import { isEmpty } from "lodash";
import { createClient } from "redis";
import getRedisClient from "./client";

export abstract class RedisRepository {
  protected _redisEnvKey: string;

  constructor(redisEnvKey: string) {
    this._redisEnvKey = redisEnvKey;
  }

  /**
   * Get Redis Client
   */
  public async getClient(): Promise<ReturnType<typeof createClient>> {
    return await getRedisClient(this._redisEnvKey);
  }

  /**
   * Cache
   * @param key
   * @param value
   * @param expiresInSec
   * @returns
   */
  public async cache(
    key: string,
    value: any | undefined,
    expiresInSec?: number
  ): Promise<void> {
    return await this.set(
      key,
      value != null ? JSON.stringify(value) : "null",
      expiresInSec
    );
  }

  /**
   * Get cache
   * @param key
   * @returns
   */
  public async getCache<T>(key: string): Promise<T | null> {
    const cache = await this.get(key);

    if (cache == null) {
      return null;
    }

    return JSON.parse(cache) as T;
  }

  /**
   * Xoá cache
   * @param key
   * @returns
   */
  public async deleteCache(key: string): Promise<void> {
    return await this.delete(key);
  }

  /**
   * GET string
   * @param key
   * @returns
   */
  public async get(key: string): Promise<any> {
    if (key == null) {
      return null;
    }

    const client = await this.getClient();
    return await client.get(key);
  }

  /**
   * SET string
   * @param key
   * @param value
   * @param expiresInSec
   * @returns
   */
  public async set(
    key: string,
    value: string,
    expiresInSec?: number
  ): Promise<any> {
    if (key == null) {
      return null;
    }

    const client = await this.getClient();

    if (expiresInSec != null && expiresInSec > 0) {
      return await client.set(key, value, {
        //- Set the specified expire time, in seconds.
        EX: expiresInSec,
      });
    }

    return await client.set(key, value);
  }

  /**
   * DEL key
   * @param {string} keys
   * @returns {Promise<any>}
   * @memberof RedisRepository
   */
  public async delete(...keys: string[]): Promise<any> {
    if (isEmpty(keys)) {
      return null;
    }

    const client = await this.getClient();
    return await client.del(keys);
  }

  /**
   * Kiểm tra xem key có tồn tại không
   * @param {string} key
   * @returns {Promise<any>}
   * @memberof RedisRepository
   */
  public async exists(key: string): Promise<boolean> {
    const client = await this.getClient();

    return (await client.exists(key)) > 0;
  }

  /**
   * Tăng 1 key lên 1 đơn vị
   * @param key
   * @param value
   * @returns
   */
  public async incr(key: string, value: number = 1): Promise<number> {
    const client = await this.getClient();
    return await client.incrBy(key, value);
  }

  /**
   * Cập nhật thời gian hết hạn 1 key theo giây
   * @param key
   * @param expiredInSec
   * @returns
   */
  public async expire(
    key: string,
    expiredInSec: number,
    mode?: "NX" | "XX" | "GT" | "LT"
  ): Promise<boolean> {
    const client = await this.getClient();
    return (await client.expire(key, expiredInSec, mode)) === 1;
  }

  /**
   * Cập nhật thời gian hết hạn 1 key theo mili giây
   * @param key
   * @param expiredInMiliSecs
   * @param mode
   * @returns
   */
  public async pExpire(
    key: string,
    expiredInMiliSecs: number,
    mode?: "NX" | "XX" | "GT" | "LT"
  ): Promise<boolean> {
    const client = await this.getClient();
    return (await client.pExpire(key, expiredInMiliSecs, mode)) === 1;
  }

  /**
   * Lấy thời gian TTL hiện tại của 1 key
   * @param key
   * @returns
   */
  public async ttl(key: string): Promise<number> {
    const client = await this.getClient();
    return await client.ttl(key);
  }

  /**
   * HGET multiple fields
   * @param key
   * @param fields
   * @returns
   */
  public async hmget(
    key: string,
    fields: string[]
  ): Promise<(string | null)[]> {
    const client = await this.getClient();
    return await client.hmGet(key, fields);
  }

  /**
   * HGET https://redis.io/commands/hget/
   * @param key
   * @param field
   * @returns
   */
  public async hget(key: string, field: string): Promise<string | null> {
    const client = await this.getClient();
    return await client.hGet(key, field);
  }

  /**
   * HINCR key by number
   * @param key
   * @param field
   * @param incr
   * @returns
   */
  public async hIncrBy(key: string, field: string, incr: number = 1) {
    const client = await this.getClient();
    return await client.hIncrBy(key, field, incr);
  }

  /**
   * Thêm 1 hoặc nhiều member vào 1 SET
   * @param key
   * @param members
   * @returns
   */
  public async sadd(key: string, members: string | string[]): Promise<number> {
    const client = await this.getClient();
    return await client.sAdd(key, members);
  }

  /**
   * Kiểm tra xem member này có tồn tại trong SET chưa
   * @param key
   * @param member
   * @returns
   */
  public async sIsMember(key: string, member: string): Promise<boolean> {
    const client = await this.getClient();
    return (await client.sIsMember(key, member)) === 1;
  }
}
