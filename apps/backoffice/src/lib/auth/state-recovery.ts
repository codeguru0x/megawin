"use client";

/**
 * Tự động khôi phục luồng đăng nhập khi OAuth `state` không còn hợp lệ.
 *
 * NGUYÊN NHÂN GỐC (đã verify lại trong `better-auth@1.7.2`): TTL của OAuth state bị
 * hardcode 600 giây ở CẢ HAI lớp và KHÔNG có option nào override —
 * `dist/state.mjs` set cookie `oauth_state` với `maxAge: 600`, còn
 * `dist/oauth2/state.mjs` nhúng `expiresAt: Date.now() + 600 * 1e3` vào payload
 * đã mã hoá. `betterAuth()` chỉ expose `oauthConfig.storeStateStrategy` và
 * `oauthConfig.skipStateCookieCheck`, không có TTL. Vì vậy KHÔNG thể "nới" hạn
 * 10 phút — chỉ có thể làm cho việc hết hạn trở nên vô hình với người dùng.
 *
 * BA TÌNH HUỐNG cùng sinh ra mã lỗi `state_*`, đều tự khỏi khi chạy lại flow:
 * 1. User để Cognito Hosted UI mở > 10 phút mới nhập thông tin → cookie
 *    `oauth_state` đã bị browser xoá → `state_mismatch`.
 * 2. Nhiều tab cùng bị đẩy sang `/login` (session hết hạn) → mỗi tab sinh state
 *    riêng và ghi đè cookie của nhau → tab thua cuộc nhận `state_mismatch`.
 * 3. Cookie bị mất do đổi domain/xoá cookie giữa flow → `state_not_found`.
 *
 * Chạy lại flow gần như luôn thành công NGAY và IM LẶNG vì lúc này Cognito đã có
 * session cookie riêng của nó (user vừa nhập credential xong) → Hosted UI redirect
 * về ngay, không hỏi lại mật khẩu.
 *
 * BUDGET CHỐNG LOOP là bắt buộc: nếu lỗi mang tính hệ thống (browser chặn cookie,
 * cấu hình Cognito sai), auto-recovery sẽ tạo vòng lặp vô hạn
 * `/auth/error` → `/login` → Cognito → `/auth/error`. Budget dùng `sessionStorage`
 * (per-tab, tự mất khi đóng tab) và tự hết hiệu lực sau {@link RECOVERY_WINDOW_MS}
 * nên KHÔNG cần ai chủ động clear — quan trọng: TUYỆT ĐỐI không clear ở `/login`,
 * vì chính `/login` là một chặng của luồng recovery (clear ở đó = tái tạo loop).
 */

/**
 * Các mã lỗi better-auth trả về ở `/auth/error?error=` mà chạy lại flow sẽ khỏi.
 *
 * KHÔNG thêm mã lỗi mang tính từ chối truy cập (`access_denied`) hay lỗi phía
 * provider (`server_error`) vào đây — chạy lại chỉ tạo vòng lặp vô nghĩa.
 */
export const RecoverableAuthErrorCode = {
  /** Cookie `oauth_state` mất/hết hạn, hoặc `state` trên URL không khớp cookie. */
  StateMismatch: "state_mismatch",
  /** Cookie còn nhưng giải mã/parse thất bại (đổi `BETTER_AUTH_SECRET`, cookie hỏng). */
  StateInvalid: "state_invalid",
  /** Callback về mà không có query `state` nào. */
  StateNotFound: "state_not_found",
  /** better-auth không tạo được state ở đầu flow. */
  StateGenerationError: "state_generation_error",
  /** Mã chung của better-auth khi flow bị gián đoạn giữa đường. */
  PleaseRestartTheProcess: "please_restart_the_process",
} as const;
export type RecoverableAuthErrorCode = (typeof RecoverableAuthErrorCode)[keyof typeof RecoverableAuthErrorCode];

const RECOVERABLE_CODES = new Set<string>(Object.values(RecoverableAuthErrorCode));

const RECOVERY_STORAGE_KEY = "megawin.backoffice.auth-recovery";

/** Số lần tự động chạy lại flow tối đa trong một cửa sổ thời gian. */
const MAX_RECOVERY_ATTEMPTS = 2;

/** Cửa sổ tính budget. Hết cửa sổ → counter reset, user gặp lỗi lần sau vẫn được auto-recovery. */
const RECOVERY_WINDOW_MS = 5 * 60 * 1000;

type RecoveryRecord = {
  /** Số lần đã thử trong cửa sổ hiện tại. */
  readonly count: number;
  /** Mốc bắt đầu cửa sổ (epoch ms). */
  readonly startedAt: number;
};

export function isRecoverableAuthError(code: string | null | undefined): boolean {
  if (!code) {
    return false;
  }
  return RECOVERABLE_CODES.has(code);
}

function readRecord(): RecoveryRecord | null {
  try {
    const raw = window.sessionStorage.getItem(RECOVERY_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<RecoveryRecord>;
    if (typeof parsed.count !== "number" || typeof parsed.startedAt !== "number") {
      return null;
    }

    return { count: parsed.count, startedAt: parsed.startedAt };
  } catch {
    // sessionStorage bị chặn (private mode) hoặc JSON hỏng → coi như chưa từng thử.
    return null;
  }
}

function writeRecord(record: RecoveryRecord): void {
  try {
    window.sessionStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Không ghi được budget → chấp nhận, nhánh gọi vẫn giới hạn bằng cửa sổ thời gian
    // của lần load trang kế tiếp. Không được throw: lỗi lưu trữ không được chặn đăng nhập.
  }
}

/**
 * Xin một suất tự động chạy lại flow đăng nhập.
 *
 * @returns `true` nếu còn budget (và đã ghi nhận lần thử này), `false` nếu đã vượt
 * {@link MAX_RECOVERY_ATTEMPTS} trong {@link RECOVERY_WINDOW_MS} — lúc đó caller
 * PHẢI hiển thị lỗi cho user thay vì redirect tiếp.
 */
export function consumeAuthRecoveryAttempt(): boolean {
  const now = Date.now();
  const record = readRecord();

  // Ngoài cửa sổ (hoặc chưa từng thử) → mở cửa sổ mới, tính là lần thử thứ 1.
  if (!record || now - record.startedAt > RECOVERY_WINDOW_MS) {
    writeRecord({ count: 1, startedAt: now });
    return true;
  }

  if (record.count >= MAX_RECOVERY_ATTEMPTS) {
    return false;
  }

  writeRecord({ count: record.count + 1, startedAt: record.startedAt });
  return true;
}
