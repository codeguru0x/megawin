/**
 * AI Chat — chuẩn hoá lỗi agent thành thông điệp staff đọc được.
 *
 * VÌ SAO CẦN: `error.message` từ eve/runtime là chuỗi kỹ thuật thô — thực tế gặp 17/08 là cả một
 * JSON `{"error":true,"stack":["ENOENT ... /node_modules/.pnpm/eve@0.38.3_.../compiled-agent-cache.js
 * ...]}` dài chục dòng, in nguyên vào khung hội thoại. Với staff vận hành thì vô nghĩa; tệ hơn, nó
 * phơi đường dẫn nội bộ, tên package, phiên bản runtime ra UI (cùng lý do
 * `tool-renderers/registry.tsx` không hiện tên tool thô).
 *
 * QUY TẮC:
 * - UI luôn hiện MỘT câu tiếng Việt chung chung + hành động phục hồi đúng loại lỗi.
 * - Chi tiết kỹ thuật đi vào `console` qua `logError` (đủ để dev/CloudWatch truy vết).
 * - CHỈ môi trường `development` mới hiện thêm dòng chi tiết (đã rút gọn) dưới thông điệp chung, và
 *   CHỈ cho nhóm lỗi thật sự cần debug — xem {@link AgentErrorKind.Session}.
 *   Cổng là `env.NEXT_PUBLIC_APP_ENV`, KHÔNG phải `NODE_ENV` — build staging cũng là "production"
 *   nên `NODE_ENV` sẽ vô tình bật chi tiết ở staging.
 */

import { logError, logWarn } from "@megawin/shared/utils";

import { env } from "@/env";

/**
 * Nhóm lỗi — quyết định câu hiện cho staff, cách phục hồi, và có in dev detail hay không.
 *
 * Tách thành nhóm (thay vì chỉ map message → message như bản đầu) vì ba quyết định trên KHÔNG cùng
 * nhau ở mọi lỗi: `Session` cần đổi nút thành "Tải lại trang" (bấm "Thử lại" chỉ 401 tiếp) và phải
 * TẮT dev detail, còn `Unknown` thì ngược lại — cần dev detail nhất.
 */
const AgentErrorKind = {
  /**
   * Phiên làm việc phía máy chủ không còn hiệu lực (HTTP 401/403 từ channel eve).
   *
   * Xảy ra thật 19/08: session better-auth hết hạn giữa phiên chat, `appSession()` trong
   * `agent/channels/eve.ts` trả `null` ⇒ eve trả 401 kèm message thô tiếng Anh
   * ("Authorization is required for this route.").
   *
   * ĐÂY KHÔNG PHẢI BUG — là vòng đời session bình thường. Nên:
   * - Câu hiện cho staff nói ĐÚNG VIỆC CẦN LÀM (tải lại trang) mà KHÔNG nhắc auth/session/401:
   *   staff vận hành không cần biết cơ chế xác thực, và chuỗi kỹ thuật ở đây chỉ gây hoang mang
   *   ("mình bị mất quyền?").
   * - KHÔNG in dev detail: chẳng có gì để debug, mà lại phơi thông điệp nội bộ của runtime.
   * - Log ở mức `warn` (không `error`) và chỉ một dòng — không dump stack cho một sự kiện dự kiến.
   */
  Session: "session",
  /**
   * Phiên hội thoại (eve session) phía máy chủ đã bị thu hồi — KHÁC với {@link Session} (đó là
   * đăng nhập better-auth hết hạn).
   *
   * Xảy ra thật 15/09: staff mở lại panel AI sau một thời gian dài không dùng, gửi tiếp đúng thread
   * cũ. Client vẫn giữ `sessionId` cũ trong `localStorage` (`thread-storage.ts`), nhưng phía server
   * eve đã tự thu hồi session đó do quá lâu không hoạt động. `ClientSession.send()` tự retry 3 lần
   * khi gặp mã `session_not_active` rồi mới throw `ClientError` với message nguyên văn tiếng Anh
   * "The session is no longer active." (xem `eve/dist/src/client/session.js`).
   *
   * "Tải lại trang" (recovery của {@link Session}) KHÔNG sửa được ca này: registry trong
   * `localStorage` vẫn trỏ về đúng `sessionId` đã bị thu hồi đó, reload xong gửi lại vẫn 409. Chỉ
   * có "Bắt đầu chat mới" (`newChat()` — tạo thread mới, `sessionId` mới) mới thoát được.
   */
  SessionExpired: "session-expired",
  /** Không tới được dịch vụ AI (fetch failed, ECONNREFUSED…). */
  Network: "network",
  /** Quá thời gian chờ hoặc request bị abort. */
  Timeout: "timeout",
  /** Model/hệ thống AI quá tải hoặc chạm rate limit. */
  Overloaded: "overloaded",
  /** Agent chưa sẵn sàng do lỗi cấu hình/build phía máy chủ. */
  ServerConfig: "server-config",
  /** Không nhận diện được — nhóm cần dev detail nhất. */
  Unknown: "unknown",
} as const;
type AgentErrorKind = (typeof AgentErrorKind)[keyof typeof AgentErrorKind];

/** Thông điệp mặc định khi không nhận diện được loại lỗi. */
const GENERIC_MESSAGE = "Không xử lý được yêu cầu này. Thử lại sau ít phút, nếu vẫn lỗi hãy báo kỹ thuật.";

/**
 * Nhận diện nhóm lỗi qua dấu hiệu trong message thô để cho staff câu trả lời hữu ích hơn "lỗi rồi".
 * Khớp bằng `includes` trên chuỗi lowercase — dấu hiệu đến từ nhiều tầng (fetch, eve runtime, HTTP)
 * nên không có mã lỗi thống nhất để `switch`.
 */
const ERROR_HINTS: readonly { kind: AgentErrorKind; match: readonly string[]; message: string }[] = [
  {
    kind: AgentErrorKind.Network,
    match: ["fetch failed", "network", "econnrefused", "enotfound", "socket hang up"],
    message: "Không kết nối được tới máy chủ. Kiểm tra mạng rồi thử lại.",
  },
  {
    kind: AgentErrorKind.Timeout,
    match: ["timeout", "timed out", "aborted"],
    message: "Yêu cầu quá thời gian chờ. Thử lại, hoặc chia câu hỏi thành phần nhỏ hơn.",
  },
  {
    kind: AgentErrorKind.Session,
    match: ["unauthorized", "forbidden", "authorization is required", "401", "403"],
    message: "Không gửi được yêu cầu. Hãy tải lại trang rồi thử lại.",
  },
  {
    kind: AgentErrorKind.SessionExpired,
    // "session_not_active" là `code` của `ClientError` (409); "no longer active" là `message` thô —
    // khớp cả hai vì tuỳ tầng ném lỗi mà field nào lọt vào `error.message` (xem JSDoc SessionExpired).
    match: ["session_not_active", "no longer active"],
    message: "Cuộc hội thoại này đã hết hiệu lực do không dùng trong thời gian dài. Hãy bắt đầu chat mới.",
  },
  {
    kind: AgentErrorKind.Overloaded,
    match: ["rate limit", "429", "quota", "overloaded"],
    message: "Hệ thống AI đang quá tải. Chờ một lát rồi thử lại.",
  },
  {
    kind: AgentErrorKind.ServerConfig,
    match: ["enoent", "manifest", "compile", "module not found"],
    message: "Trợ lý AI chưa sẵn sàng (lỗi cấu hình phía máy chủ). Hãy báo kỹ thuật.",
  },
];

/** Độ dài tối đa của dòng chi tiết hiện ở môi trường development. */
const DEV_DETAIL_MAX_LENGTH = 200;

/**
 * Error đã ghi log — chặn log lặp khi React render lại cùng một `error`.
 *
 * `describeAgentError` cố ý gọi trong render (xem JSDoc của nó), mà banner re-render vì nhiều lý do
 * khác nhau: double-render ở dev, đổi `input` của composer, panel resize… Thực tế 19/08 một lần 401
 * in ra 4 dòng `console.error` giống hệt, che mất log thật ở phía trên. `WeakSet` key theo object
 * nên mỗi lỗi MỚI (mỗi lần gửi lại) vẫn log đúng một lần, và không giữ Error sống mãi trong bộ nhớ.
 */
const loggedErrors = new WeakSet<Error>();

/** Hành động phục hồi mà banner mời staff bấm. */
export const AgentErrorRecovery = {
  /** Gửi lại đúng nội dung vừa gửi — hợp lý khi lỗi mang tính tạm thời. */
  Retry: "retry",
  /** Tải lại trang — lối ra duy nhất khi phiên đăng nhập better-auth đã hết (`Session`). */
  Reload: "reload",
  /**
   * Bắt đầu thread mới — lối ra duy nhất khi phiên hội thoại eve đã bị thu hồi (`SessionExpired`).
   * "Tải lại trang" KHÔNG đủ ở đây: registry `localStorage` vẫn giữ đúng `sessionId` đã chết, phải
   * tạo `sessionId` mới thật (xem JSDoc `AgentErrorKind.SessionExpired`).
   */
  NewChat: "new-chat",
} as const;
export type AgentErrorRecovery = (typeof AgentErrorRecovery)[keyof typeof AgentErrorRecovery];

export interface AgentErrorDisplay {
  /** Câu tiếng Việt hiện cho staff — luôn có, không bao giờ là chuỗi kỹ thuật. */
  message: string;
  /** Chi tiết kỹ thuật đã rút gọn — CHỈ ở `development`, và KHÔNG có với nhóm `Session`/`SessionExpired`. */
  devDetail: string | undefined;
  /** Nút nào hiện trên banner. */
  recovery: AgentErrorRecovery;
}

/**
 * Chuẩn hoá lỗi agent để render, đồng thời ghi log chi tiết.
 *
 * Gọi trong render (không phải effect) là CHỦ Ý: mỗi lần `error` đổi thì banner render lại và log
 * đúng một lần cho lỗi đó — thêm effect chỉ để log sẽ chậm hơn banner một tick. Việc dedupe log qua
 * các lần re-render do {@link loggedErrors} lo.
 */
export function describeAgentError(error: Error | undefined): AgentErrorDisplay {
  if (!error) {
    return { message: GENERIC_MESSAGE, devDetail: undefined, recovery: AgentErrorRecovery.Retry };
  }

  const raw = error.message.toLowerCase();
  const hint = ERROR_HINTS.find((entry) => entry.match.some((needle) => raw.includes(needle)));
  const kind = hint?.kind ?? AgentErrorKind.Unknown;

  if (!loggedErrors.has(error)) {
    loggedErrors.add(error);
    if (kind === AgentErrorKind.Session) {
      // Sự kiện dự kiến, không phải bug: một dòng warn là đủ để dev hiểu vì sao chat dừng, không
      // dump message thô/stack của runtime.
      logWarn("ai-chat", "phiên làm việc hết hiệu lực — bạn cần tải lại trang và đăng nhập lại");
    } else if (kind === AgentErrorKind.SessionExpired) {
      // Cũng là vòng đời dự kiến (session eve tự thu hồi sau thời gian dài không dùng), không phải
      // bug — cùng mức độ log như `Session`, chỉ khác hành động phục hồi.
      logWarn("ai-chat", "phiên hội thoại eve đã bị thu hồi — bạn cần bắt đầu chat mới");
    } else {
      logError("ai-chat", error);
    }
  }

  const recovery =
    kind === AgentErrorKind.Session
      ? AgentErrorRecovery.Reload
      : kind === AgentErrorKind.SessionExpired
        ? AgentErrorRecovery.NewChat
        : AgentErrorRecovery.Retry;

  return {
    message: hint?.message ?? GENERIC_MESSAGE,
    devDetail:
      kind !== AgentErrorKind.Session &&
      kind !== AgentErrorKind.SessionExpired &&
      env.NEXT_PUBLIC_APP_ENV === "development"
        ? condenseDetail(error.message)
        : undefined,
    recovery,
  };
}

/**
 * Rút gọn message thô thành 1 dòng đọc được: bỏ newline (JSON stack in ra chục dòng làm banner
 * chiếm nửa màn hình), nén khoảng trắng, cắt theo {@link DEV_DETAIL_MAX_LENGTH}.
 */
function condenseDetail(message: string): string {
  const oneLine = message.replaceAll(/\s+/g, " ").trim();
  if (oneLine.length <= DEV_DETAIL_MAX_LENGTH) {
    return oneLine;
  }
  return `${oneLine.slice(0, DEV_DETAIL_MAX_LENGTH)}…`;
}
