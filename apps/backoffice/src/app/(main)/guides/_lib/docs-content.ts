/**
 * Bản đồ `file` (theo manifest) -> nội dung Markdown raw, nạp build-time.
 *
 * Mọi `.md` staff được import qua loader raw (`asset/source` / `raw-loader`) nên
 * nội dung nằm thẳng trong JS chunk — server KHÔNG đọc file lúc runtime, không I/O.
 *
 * Thêm doc mới: thêm 1 import + 1 dòng trong `DOC_CONTENT`, đồng bộ với manifest
 * (`@megawin/ops-docs/manifest`). Script `docs:check` chặn nếu lệch file <-> manifest.
 */

import l535_a from "@megawin/ops-docs/docs/resettle/lotto535/type-a.md";
import l535_b1 from "@megawin/ops-docs/docs/resettle/lotto535/type-b1.md";
import l535_b2 from "@megawin/ops-docs/docs/resettle/lotto535/type-b2.md";
import m645_a from "@megawin/ops-docs/docs/resettle/mega645/type-a.md";
import m645_b1 from "@megawin/ops-docs/docs/resettle/mega645/type-b1.md";
import m645_b2 from "@megawin/ops-docs/docs/resettle/mega645/type-b2.md";
import p655_a from "@megawin/ops-docs/docs/resettle/power655/type-a.md";
import p655_b1 from "@megawin/ops-docs/docs/resettle/power655/type-b1.md";
import p655_b2 from "@megawin/ops-docs/docs/resettle/power655/type-b2.md";

/**
 * Key = `doc.file` trong manifest. Value = nội dung Markdown raw.
 */
export const DOC_CONTENT: Record<string, string> = {
  "resettle/power655/type-a.md": p655_a,
  "resettle/power655/type-b1.md": p655_b1,
  "resettle/power655/type-b2.md": p655_b2,
  "resettle/lotto535/type-a.md": l535_a,
  "resettle/lotto535/type-b1.md": l535_b1,
  "resettle/lotto535/type-b2.md": l535_b2,
  "resettle/mega645/type-a.md": m645_a,
  "resettle/mega645/type-b1.md": m645_b1,
  "resettle/mega645/type-b2.md": m645_b2,
};
