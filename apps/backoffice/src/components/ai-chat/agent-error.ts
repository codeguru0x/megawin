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
 * - UI luôn hiện MỘT câu tiếng Việt chung chung + gợi ý hành động.
 * - Chi tiết kỹ thuật đi vào `console` qua `logError` (đủ để dev/CloudWatch truy vết).
 * - CHỈ môi trường `development` mới hiện thêm dòng chi tiết (đã rút gọn) dưới thông điệp chung.
 *   Cổng là `env.NEXT_PUBLIC_APP_ENV`, KHÔNG phải `NODE_ENV` — build staging cũng là "production"
 *   nên `NODE_ENV` sẽ vô tình bật chi tiết ở staging.
 */

import { logError } from "@megawin/shared/utils";

import { env } from "@/env";

/** Thông điệp mặc định khi không nhận diện được loại lỗi. */
const GENERIC_MESSAGE = "Không xử lý được yêu cầu này. Thử lại sau ít phút, nếu vẫn lỗi hãy báo kỹ thuật.";

/**
 * Nhận diện loại lỗi qua dấu hiệu trong message thô để cho staff câu trả lời hữu ích hơn "lỗi rồi".
 * Khớp bằng `includes` trên chuỗi lowercase — dấu hiệu đến từ nhiều tầng (fetch, eve runtime, HTTP)
 * nên không có mã lỗi thống nhất để `switch`.
 */
const ERROR_HINTS: readonly { match: readonly string[]; message: string }[] = [
  {
    match: ["fetch failed", "network", "econnrefused", "enotfound", "socket hang up"],
    message: "Không kết nối được tới dịch vụ AI. Kiểm tra mạng rồi thử lại.",
  },
  {
    match: ["timeout", "timed out", "aborted"],
    message: "Yêu cầu quá thời gian chờ. Thử lại, hoặc chia câu hỏi thành phần nhỏ hơn.",
  },
  {
    match: ["unauthorized", "forbidden", "401", "403"],
    message: "Phiên đăng nhập không còn hiệu lực. Tải lại trang và đăng nhập lại.",
  },
  {
    match: ["rate limit", "429", "quota", "overloaded"],
    message: "Hệ thống AI đang quá tải. Chờ một lát rồi thử lại.",
  },
  {
    match: ["enoent", "manifest", "compile", "module not found"],
    message: "Trợ lý AI chưa sẵn sàng (lỗi cấu hình phía máy chủ). Hãy báo kỹ thuật.",
  },
];

/** Độ dài tối đa của dòng chi tiết hiện ở môi trường development. */
const DEV_DETAIL_MAX_LENGTH = 200;

export interface AgentErrorDisplay {
  /** Câu tiếng Việt hiện cho staff — luôn có, không bao giờ là chuỗi kỹ thuật. */
  message: string;
  /** Chi tiết kỹ thuật đã rút gọn, CHỈ có ở `development`. */
  devDetail: string | undefined;
}

/**
 * Chuẩn hoá lỗi agent để render, đồng thời ghi log chi tiết.
 *
 * Gọi trong render (không phải effect) là CHỦ Ý: mỗi lần `error` đổi thì banner render lại và log
 * đúng một lần cho lỗi đó — thêm effect chỉ để log sẽ chậm hơn banner một tick và phải tự quản
 * dedupe. React có thể render lại cùng `error` (double-render ở dev, re-render do state khác), nên
 * log có thể lặp; đây là log chẩn đoán, lặp không gây hại nghiệp vụ.
 */
export function describeAgentError(error: Error | undefined): AgentErrorDisplay {
  if (!error) {
    return { message: GENERIC_MESSAGE, devDetail: undefined };
  }

  logError("ai-chat", error);

  const raw = error.message.toLowerCase();
  const hint = ERROR_HINTS.find((entry) => entry.match.some((needle) => raw.includes(needle)));

  return {
    message: hint?.message ?? GENERIC_MESSAGE,
    devDetail: env.NEXT_PUBLIC_APP_ENV === "development" ? condenseDetail(error.message) : undefined,
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
