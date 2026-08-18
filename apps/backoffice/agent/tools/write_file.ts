/**
 * Disable built-in tool `write_file` — agent CHỈ ĐỌC số liệu, không ghi gì.
 *
 * Xem lý do đầy đủ ở `bash.ts`.
 */

import { disableTool } from "eve/tools";

export default disableTool();
