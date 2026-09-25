/**
 * Unit test handler không được đụng Redis. Tắt rate limit để test Zod/use-case
 * không bị 429 khi máy dev vô tình có REDIS_URI.
 */
process.env.GUARD_RATELIMIT_MODE = "off";
