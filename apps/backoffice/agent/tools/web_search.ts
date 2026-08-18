/**
 * Disable built-in tool `web_search` — mọi câu trả lời PHẢI đến từ số liệu nội bộ.
 *
 * `instructions.md` §1 cấm bịa số liệu và giới hạn phạm vi ở dữ liệu vận hành MegaWin. Web
 * search cho model một nguồn số liệu ngoài, dễ bị trộn vào câu trả lời tài chính — rủi ro
 * nghiêm trọng hơn lợi ích với agent chỉ tra cứu báo cáo nội bộ.
 */

import { disableTool } from "eve/tools";

export default disableTool();
