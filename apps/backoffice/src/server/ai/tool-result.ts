/**
 * Biên tool eve — chuẩn hoá MỌI kết quả `useCase.safeRun()` trước khi trả cho model.
 *
 * Thay thế `serializeDates(await useCase.safeRun(...))` ở toàn bộ `agent/tools/*`. Lý do có file này
 * là hai lỗi THẬT đã bắt được ngày 17/08 khi tool `getGameConfig` đỏ toàn bộ:
 *
 * 1. **eve reject payload → mất luôn lỗi thật.** `safeRun()` trả `{ success: false, error }` với
 *    `error.details` là chính exception gốc (`UseCase.handleError` gọi `AppException.internal(msg, err)`).
 *    `details` là instance `TypeError`/`Error` → prototype KHÔNG phải `Object.prototype` → bộ kiểm tra
 *    JSON của eve coi cả payload là non-serializable và nuốt nội dung, chỉ hiện
 *    `Tool "getGameConfig" ... returned a non-JSON-serializable result`. Lỗi thật
 *    (`loaded.updatedAt.toISOString is not a function`) không tới được ai — cả model lẫn log.
 *    `serializeDates` KHÔNG cứu được: nó chỉ đổi `Date`, cố tình giữ nguyên class instance khác.
 *
 * 2. **Chi tiết kỹ thuật rò rỉ ra staff.** Khi payload lỗi tới được model, model đọc thấy tên tool +
 *    message kỹ thuật rồi nhắc lại nguyên văn trong câu trả lời ("Admin muốn tôi thử lại ngay hay báo
 *    kỹ thuật kiểm tra tool getGameConfig?"). Staff backoffice không hiểu và cũng không cần biết bên
 *    trong có tool nào.
 *
 * NGUYÊN TẮC: model nhận ĐÚNG hai thứ khi lỗi — một câu tiếng Việt nghiệp vụ (`message`) và chỉ dẫn
 * cách nói với staff (`guidance`). KHÔNG có `details`, KHÔNG stack, KHÔNG `statusCode`, KHÔNG tên tool.
 * Phần kỹ thuật đi vào `logError` server-side kèm `incidentId` để đối chiếu khi staff báo lại.
 */

import { APP_ERROR_CODES, type AppResult } from "@megawin/shared/errors";
import type { WireType } from "@megawin/shared/types";
import { logError, serializeDates } from "@megawin/shared/utils";

/** Label log cho mọi lỗi bị chặn ở biên tool. */
const SCOPE = "AiTool";

/**
 * Chỉ dẫn hành vi gắn kèm mọi lỗi tool — đây là **prompt engineering**, không phải thông báo cho staff.
 *
 * Viết ở đây (payload) thay vì chỉ trong `instructions.md` vì nó phải xuất hiện NGAY cạnh lỗi, đúng
 * lúc model quyết định nói gì: chỉ dẫn ở system prompt cách đó hàng nghìn token dễ bị bỏ qua khi model
 * đang loay hoay với một tool vừa đỏ.
 */
const ERROR_GUIDANCE =
  "Nói ngắn gọn với nhân viên rằng hiện chưa tra được số liệu này và sự cố đã được ghi nhận để xử lý. " +
  "TUYỆT ĐỐI không nhắc tên tool, tên hàm, mã lỗi, thông báo kỹ thuật, hay việc 'báo kỹ thuật kiểm tra'. " +
  "KHÔNG hỏi nhân viên có muốn thử lại hay không. KHÔNG gọi lại tool này với tham số khác cho cùng câu " +
  "hỏi — lỗi nằm ở hệ thống, không phải ở tham số. Nếu còn phần nào trả lời được bằng dữ liệu đã có, " +
  "trả lời phần đó trước rồi mới nêu phần còn thiếu.";

/**
 * Message thay thế khi lỗi là sự cố hệ thống — model KHÔNG được thấy chuỗi kỹ thuật.
 *
 * VÌ SAO CHỈ CHẶN `INTERNAL`: từ 02/09/2026, `UseCase.handleError()` (`@megawin/app-core`) đã tự
 * chặn leak ở nguồn — mọi exception KHÔNG phải `AppException`/`AppError` bị log server-side qua
 * `logError` rồi bọc thành `AppException.internal(UNEXPECTED_ERROR_MESSAGE)` (message chung, KHÔNG
 * còn giữ nguyên `err.message`/`details` gốc). Guard ở đây vẫn giữ lại làm **defense-in-depth**:
 * phòng trường hợp lỗi đến từ nguồn không đi qua `UseCase.run()` (VD throw `AppException.internal`
 * trực tiếp kèm message kỹ thuật, hoặc code cũ trước khi fix này được áp dụng). Các mã khác
 * (`NOT_FOUND`, `BAD_REQUEST`, `BUSINESS_RULE_VIOLATION`…) chỉ phát sinh khi dev tự `throw` với câu
 * tiếng Việt nghiệp vụ — giữ nguyên message để model trả lời chính xác ("kỳ quay không tồn tại"
 * khác hẳn "hệ thống lỗi").
 *
 * Đánh đổi đã chấp nhận: dev tự `AppException.internal("Không đọc được cấu hình game keno.")` cũng bị
 * thay bằng câu chung. Không mất gì đáng kể — model biết nó vừa hỏi gì, và staff chỉ cần biết là chưa
 * tra được.
 */
const INTERNAL_ERROR_MESSAGE = "Hệ thống chưa lấy được dữ liệu cho yêu cầu này.";

/** Lỗi tool ở dạng model được phép thấy — cố tình KHÔNG có `details`/`statusCode`/stack. */
interface ToolErrorPayload {
  code: string;
  /** Câu tiếng Việt nghiệp vụ, an toàn để model diễn đạt lại cho staff. */
  message: string;
  /** Mã sự cố khớp với dòng log server-side — dùng khi cần truy vết, KHÔNG đọc cho staff. */
  incidentId: string;
  guidance: string;
}

/** Kết quả tool sau chuẩn hoá — union rõ ràng để model không phải đoán. */
export type ToolResult<T> = { success: true; data: WireType<T> } | { success: false; error: ToolErrorPayload };

/**
 * Sinh mã sự cố ngắn, đủ để grep log (`INC-` + base36 của timestamp + 3 ký tự ngẫu nhiên).
 *
 * KHÔNG dùng UUID: mã này lọt vào ngữ cảnh model nên càng ngắn càng ít token và ít khả năng model
 * đọc nguyên chuỗi dài ra cho staff.
 */
function newIncidentId(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `INC-${stamp}${rand}`;
}

/**
 * Chuẩn hoá kết quả `safeRun()` cho biên tool eve.
 *
 * - Thành công: `serializeDates` đổi mọi `Date` còn sót thành ISO string (eve KHÔNG gọi `toJSON()`).
 * - Thất bại: log toàn bộ lỗi thật server-side, trả cho model payload sạch + chỉ dẫn cách nói.
 *
 * @param result   - Giá trị `await useCase.safeRun(...)`.
 * @param toolName - Tên tool, CHỈ dùng cho log server-side (không bao giờ vào payload trả model).
 *
 * @example
 * ```ts
 * execute: async (input) => toToolResult(await useCase.safeRun(input), "getGameConfig"),
 * ```
 */
export function toToolResult<T>(result: AppResult<T>, toolName: string): ToolResult<T> {
  if (result.success) {
    return { success: true, data: serializeDates(result.data) };
  }

  const incidentId = newIncidentId();
  // Log NGUYÊN error gốc (kể cả `details` là Error instance) — `logError`/`serializeError` xử lý được
  // và đây là nơi DUY NHẤT còn giữ stack sau khi payload gửi model đã bị lược sạch.
  logError(SCOPE, result.error, { incidentId, toolName });

  const isInternal = result.error.code === APP_ERROR_CODES.INTERNAL;

  return {
    success: false,
    error: {
      code: result.error.code,
      message: isInternal ? INTERNAL_ERROR_MESSAGE : result.error.message,
      incidentId,
      guidance: ERROR_GUIDANCE,
    },
  };
}
