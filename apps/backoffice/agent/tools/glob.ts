/**
 * Disable built-in tool `glob` — agent không tìm file trong sandbox.
 *
 * Xem lý do đầy đủ ở `bash.ts`.
 */

import { disableTool } from "eve/tools";

export default disableTool();
