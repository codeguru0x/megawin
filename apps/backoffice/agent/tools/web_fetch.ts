/**
 * Disable built-in tool `web_fetch` — không còn nhu cầu fetch URL bên ngoài.
 *
 * Agent chỉ tra số liệu nội bộ (tool báo cáo + `getVietlottResult` khi cần đối chiếu kết quả).
 * Giữ file này (không xoá) để `disableTool()` chặn default của eve — xoá file = tool bật lại.
 */

import { disableTool } from "eve/tools";

export default disableTool();
