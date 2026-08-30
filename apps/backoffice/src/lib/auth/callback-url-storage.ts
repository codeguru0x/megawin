"use client";

/**
 * Lưu tạm `callbackUrl` (trang đích sau khi đăng nhập) vào localStorage TRƯỚC KHI
 * redirect sang Cognito Hosted UI.
 *
 * LÝ DO CẦN FILE NÀY: better-auth giới hạn CỨNG thời gian sống của OAuth state ở
 * 10 phút (`expiresAt: Date.now() + 10 * 60 * 1000`, hardcode trong
 * `oauth2/state.ts`, KHÔNG có config nào override được — xem
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

export function saveAuthCallbackUrl(callbackUrl: string): void {
  setLocalStorageValue(AUTH_CALLBACK_URL_STORAGE_KEY, callbackUrl);
}

/** Trả về callbackUrl đã lưu, hoặc `"/"` nếu chưa từng lưu (fallback an toàn). */
export function readAuthCallbackUrl(): string {
  return getLocalStorageValue(AUTH_CALLBACK_URL_STORAGE_KEY) ?? "/";
}
