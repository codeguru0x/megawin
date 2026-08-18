/**
 * Disable built-in tool `read_file` — agent không có nhu cầu đọc filesystem sandbox.
 *
 * Xem lý do đầy đủ ở `bash.ts`: agent chỉ tra cứu số liệu qua use-case, mọi tool filesystem
 * đều là bề mặt tấn công vô ích và buộc spin-up sandbox không cần thiết.
 */

import { disableTool } from "eve/tools";

export default disableTool();
