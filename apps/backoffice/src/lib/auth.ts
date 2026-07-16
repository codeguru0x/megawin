/**
 * Better Auth – Server-side configuration.
 *
 * Sử dụng AWS Cognito làm social provider cho hosted UI login.
 * Session được lưu bằng cookie (default) – phù hợp SSR/RSC của Next.js.
 *
 * @see https://www.better-auth.com/docs/authentication/cognito
 * @see https://better-auth.com/docs/integrations/next
 */

import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";

import { ClaimKey, AccountStatus, AccountType } from "@megawin/identity/entities";
import { auditLogin } from "@megawin/identity-application/services";

import { actorFromAuthUser } from "@/lib/audit-actor";
import { env } from "@/env";

export const auth = betterAuth({
  /**
   * BETTER_AUTH_SECRET – bắt buộc, dùng để ký session.
   * BETTER_AUTH_URL – base URL của app (auto-detected trong production).
   */
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,

  /**
   * Custom fields trên user – better-auth lưu & trả lại trong session.
   * `mapProfileToUser` populate các fields này từ Cognito ID token claims.
   *
   * QUAN TRỌNG — `input: true` là BẮT BUỘC (không dùng `input: false`):
   * từ better-auth 1.6.23 (PR #10196), OAuth sign-up/sign-in bỏ qua mọi field
   * đánh dấu `input: false` khi ghi user từ provider profile. App này chạy
   * DB-less + Cognito nên toàn bộ giá trị đến từ ID token đã ký (user KHÔNG tự
   * nhập được — không có endpoint signup/updateUser mở), do đó `input: true`
   * không tạo rủi ro nhưng lại giữ `mapProfileToUser` hoạt động → `accountType`
   * và `roles` có mặt trong `session_data`, tránh redirect nhầm `/unauthorized`.
   */
  user: {
    additionalFields: {
      sub: {
        type: "string",
        required: false,
        input: true,
      },
      roles: {
        type: "string",
        required: false,
        defaultValue: "",
        input: true,
      },
      accountStatus: {
        type: "string",
        required: false,
        defaultValue: AccountStatus.Active,
        input: true,
      },
      accountId: {
        type: "string",
        required: false,
        input: true,
      },
      tenantId: {
        type: "string",
        required: false,
        input: true,
      },
      accountType: {
        type: "string",
        required: false,
        input: true,
      },
      username: {
        type: "string",
        required: false,
        input: true,
      },
    },
  },

  /**
   * AWS Cognito social provider.
   * Redirect user sang Cognito Hosted UI để đăng nhập,
   * sau đó callback về /api/auth/callback/cognito.
   */
  socialProviders: {
    cognito: {
      clientId: env.COGNITO_WORKFORCE_CLIENT_ID,
      //clientSecret: env.COGNITO_CLIENT_SECRET,
      domain: env.COGNITO_WORKFORCE_DOMAIN,
      region: env.COGNITO_WORKFORCE_REGION,
      userPoolId: env.COGNITO_WORKFORCE_POOL_ID,
      redirectURI: `${env.BETTER_AUTH_URL}/api/auth/callback/cognito`,
      /**
       * Refresh custom fields (accountType, roles, …) mỗi lần đăng nhập lại.
       *
       * Khi user đã tồn tại (in-memory adapter còn giữ record trong 1 process),
       * better-auth mặc định CHỈ update account tokens, KHÔNG ghi lại user fields.
       * Bật cờ này để nhánh sign-in chạy lại `mapProfileToUser` → giá trị từ ID
       * token luôn được đồng bộ vào session, không phụ thuộc user cũ hay mới.
       */
      overrideUserInfoOnSignIn: true,
      mapProfileToUser: (profile) => {
        const raw = profile as Record<string, unknown>;

        return {
          sub: (raw[ClaimKey.Sub] as string) ?? undefined,
          accountStatus: (raw[ClaimKey.AccountStatus] as string) ?? AccountStatus.Active,
          accountId: (raw[ClaimKey.AccountId] as string) ?? undefined,
          roles: (raw[ClaimKey.Roles] as string) ?? "",
          tenantId: (raw[ClaimKey.TenantId] as string) ?? undefined,
          accountType: (raw[ClaimKey.AccountType] as string) ?? undefined,
          username: (raw[ClaimKey.Username] as string) ?? undefined,
        };
      },
    },
  },

  /**
   * Session configuration.
   *
   * App này chạy DB-less (không có `database` config) → better-auth dùng stateless
   * cookie-only session. Trong chế độ này `cookieCache.maxAge` CHÍNH LÀ thời gian
   * sống thực của session (không có DB để fallback). `session.expiresIn` chỉ ảnh
   * hưởng đến cookie `session_token`; cookie `session_data` (chứa user data) dùng
   * `cookieCache.maxAge` — khi `session_data` expire → user bị logout.
   *
   * Đặt `maxAge` = 24h để khớp với Cognito ID Token TTL.
   */
  session: {
    expiresIn: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      /** 24h — khớp với Cognito ID Token TTL. */
      maxAge: 60 * 60 * 24,
    },
  },

  /**
   * Redirect error page sang custom page thay vì dùng trang mặc định
   * để tránh lộ thông tin package đang sử dụng.
   */
  onAPIError: {
    errorURL: `${env.BETTER_AUTH_URL}/auth/error`,
  },

  /**
   * Hook sau mỗi better-auth endpoint — dùng để audit `auth.login`.
   *
   * Chạy sau OAuth callback (`/callback/:id`) khi Cognito redirect về. Nếu
   * `ctx.context.newSession` tồn tại → phiên vừa được tạo → đăng nhập thành công.
   * Chỉ audit `company`/`agent` (KHÔNG `player` — volume lớn gây rác dữ liệu).
   *
   * Fire-and-forget: audit fail KHÔNG bao giờ chặn luồng đăng nhập. IP + HTTP
   * context (userAgent/requestId) của actor lấy từ `ctx.headers` (request tới
   * callback), gắn sẵn trong {@link actorFromAuthUser}. `auditLogin` chủ động lưu
   * HTTP context (login là action cần nhận diện thiết bị đăng nhập).
   *
   * LƯU Ý: `auth.logout` KHÔNG audit ở đây — better-auth xoá cookie trong endpoint
   * signOut trước khi hook chạy nên mất actor. Logout được audit ở route
   * `/api/auth/sign-out-redirect` (còn session hợp lệ).
   */
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      const newSession = ctx.context.newSession;
      if (!newSession) {
        return;
      }

      const user = newSession.user as Record<string, unknown>;
      const accountType = user.accountType as string | undefined;

      // Chỉ ghi company/agent — player bỏ qua để tránh rác dữ liệu volume lớn.
      if (accountType !== AccountType.Company && accountType !== AccountType.Agent) {
        return;
      }

      console.log("better-auth hook after ctx.headers:", JSON.stringify(ctx.headers, null, 2));

      auditLogin({
        actor: actorFromAuthUser(user, ctx.headers),
      });
    }),
  },

  /**
   * Plugins.
   * nextCookies – tự động set cookies cho server actions.
   * PHẢI đặt cuối mảng plugins.
   */
  plugins: [nextCookies()],
});

/** Inferred types for client-side usage. */
export type Session = typeof auth.$Infer.Session;
