"use client";

/**
 * Lưu tạm `callbackUrl` (trang đích sau khi đăng nhập) vào localStorage TRƯỚC KHI
 * redirect sang Cognito Hosted UI.
 *
 * LÝ DO CẦN FILE NÀY: better-auth giới hạn CỨNG thời gian sống của OAuth state ở
 * 10 phút (`maxAge: 600` cho cookie `oauth_state` + `expiresAt: Date.now() + 600 * 1e3`
 * trong payload, hardcode ở `dist/state.mjs` và `dist/oauth2/state.mjs`, KHÔNG có
 * config nào override được — xem
 * https://github.com/better-auth/better-auth/issues/11012). Nếu user bị timeout
 * session → tự động redirect `/login` → tự động sang Cognito Hosted UI, rồi để
 * trang Cognito mở quá 10 phút mới nhập thông tin, `oauth_state` cookie đã hết hạn
 * → callback báo `state_mismatch`, và `callbackUrl` gốc (đã đóng gói trong cookie đó)
 * cũng biến mất theo.
 *
 * `auth/error/page.tsx` đọc lại giá trị này khi tự động điều hướng user quay lại
 * `/login` sau lỗi `state_*`, để họ vẫn được đưa về đúng trang đích ban đầu.
 */
import { getLocalStorageValue, setLocalStorageValue } from "@/lib/local-storage.client";

const AUTH_CALLBACK_URL_STORAGE_KEY = "megawin.backoffice.auth-callback-url";

const DEFAULT_CALLBACK_URL = "/";

/**
 * Chỉ chấp nhận path nội bộ dạng `/games/keno/draws?tab=x`.
 *
 * Giá trị này đến từ localStorage — tức có thể bị sửa tay hoặc bị ghi bởi script
 * khác cùng origin — rồi được nhúng vào `href` của link "Đăng nhập lại" và cuối
 * cùng thành `callbackURL` của OAuth flow. Không lọc = mở đường open-redirect.
 *
 * Chặn cả `//evil.com` (protocol-relative URL: browser hiểu là host khác) và mọi
 * dạng có scheme (`https:`, `javascript:`).
 */
function sanitizeCallbackUrl(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_CALLBACK_URL;
  }

  // `\` bị một số browser normalize thành `/` → `/\evil.com` có thể thoát origin.
  if (value.includes("\\")) {
    return DEFAULT_CALLBACK_URL;
  }

  return value;
}

export function saveAuthCallbackUrl(callbackUrl: string): void {
  setLocalStorageValue(AUTH_CALLBACK_URL_STORAGE_KEY, sanitizeCallbackUrl(callbackUrl));
}

/** Trả về callbackUrl đã lưu, hoặc `"/"` nếu chưa từng lưu / giá trị không an toàn. */
export function readAuthCallbackUrl(): string {
  return sanitizeCallbackUrl(getLocalStorageValue(AUTH_CALLBACK_URL_STORAGE_KEY));
}
