/**
 * Tên header HTTP của MegaWin.
 *
 * Prefix `mw-` + lowercase — tránh trùng header generic của ứng dụng tenant/proxy.
 * Phải khớp `IDEMPOTENCY_KEY_HEADER` trong `@megawin/player-sdk`.
 */
export const IDEMPOTENCY_KEY_HEADER = "mw-idempotency-key" as const;
