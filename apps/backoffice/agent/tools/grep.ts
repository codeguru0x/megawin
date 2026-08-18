/**
 * Disable built-in tool `grep` — agent không search file trong sandbox.
 *
 * Xem lý do đầy đủ ở `bash.ts`.
 */

import { disableTool } from "eve/tools";

export default disableTool();
