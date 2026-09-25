/**
 * Integration bật enforce (mặc định). Xóa van tắt nếu unit setup chạy chung process.
 */
delete process.env.GUARD_RATELIMIT_MODE;
