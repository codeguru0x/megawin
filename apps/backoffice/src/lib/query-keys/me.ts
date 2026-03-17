import { MODULES } from "./modules";

const MODULE = MODULES.me;

export const meKeys = {
  /** Invalidate toàn bộ module me */
  all: [MODULE] as const,
  /** Profile của user đang đăng nhập — GET /me/profile */
  profile: [MODULE, "profile"] as const,
  /** Trạng thái MFA của user — GET /me/mfa/status */
  mfaStatus: [MODULE, "mfa", "status"] as const,
};
