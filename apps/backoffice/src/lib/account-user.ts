/**
 * Thông tin tài khoản dùng để HIỂN THỊ (avatar, tên, email) trên sidebar/header.
 *
 * Tách riêng thành file pure (không `"use client"`, không import React/Next) để
 * server layout và client component dùng CHUNG một hàm chuẩn hoá — server đọc từ
 * `requireOperatorSession()`, truyền xuống bằng prop. Nếu để client tự đọc
 * `useSession()` thì SSR ra "User"/rỗng còn client ra tên thật ⇒ hydration mismatch.
 */
export interface AccountDisplayUser {
  /** Tên hiển thị. Ưu tiên `username` (Cognito) rồi `name`; fallback `"User"`. */
  name: string;
  /** Email. Rỗng nếu session không có. */
  email: string;
  /** URL avatar. Rỗng nếu không có — component tự fallback sang initials. */
  avatar: string;
}

/**
 * Chuẩn hoá `session.user` (shape của better-auth + custom claim Cognito) thành
 * {@link AccountDisplayUser}. Nhận `unknown` để dùng được cho cả session server
 * (`requireOperatorSession`) và client (`useSession`) mà không cần cast ở caller.
 */
export function toAccountDisplayUser(sessionUser: unknown): AccountDisplayUser {
  const user = (sessionUser ?? {}) as Record<string, unknown>;
  const username = typeof user.username === "string" ? user.username : undefined;
  const name = typeof user.name === "string" ? user.name : undefined;
  const email = typeof user.email === "string" ? user.email : undefined;
  const image = typeof user.image === "string" ? user.image : undefined;

  return {
    name: username ?? name ?? "User",
    email: email ?? "",
    avatar: image ?? "",
  };
}
