/**
 * Vercel Project Configuration — @megawin/backoffice
 *
 * Thay thế `vercel.json`. **CHỈ ĐƯỢC TỒN TẠI MỘT trong hai file** — nếu tạo lại
 * `vercel.json` cạnh file này, Vercel sẽ báo lỗi config.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ HAI NHÓM FIELD — CƠ CHẾ ĐỌC KHÁC NHAU, ĐỌC TRƯỚC KHI THÊM CONFIG MỚI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── NHÓM 1: STATIC FIELDS (literal tĩnh — BẮT BUỘC) ────────────────────────
 *
 * Vercel TRÍCH XUẤT các field này TRƯỚC KHI build chạy, bằng static analysis —
 * KHÔNG thực thi code. Vì vậy giá trị PHẢI là literal viết cứng tại chỗ.
 *
 * Danh sách (theo `validateStaticFields` của @vercel/config):
 *   - git.deploymentEnabled
 *   - github.enabled | github.autoAlias | github.autoJobCancelation
 *   - buildCommand | devCommand | installCommand
 *   - framework | nodeVersion | outputDirectory
 *   - relatedProjects
 *
 * CẤM với nhóm này: biến, `process.env`, `deploymentEnv()`, gọi hàm, ternary,
 * spread, template string, giá trị import từ file khác. Viết như vậy Vercel sẽ
 * KHÔNG đọc được giá trị → config bị bỏ qua âm thầm, KHÔNG có lỗi build.
 *
 *   SAI:   buildCommand: `${pkgManager} run build`
 *   SAI:   deploymentEnabled: { dev: process.env.ALLOW_DEV === "true" }
 *   ĐÚNG:  buildCommand: "next build"
 *   ĐÚNG:  deploymentEnabled: { dev: false }
 *
 * Lý do tồn tại cơ chế này: `git.deploymentEnabled` quyết định CÓ build hay
 * KHÔNG, nên phải đọc được trước cả khi build khởi động — không thể chờ chạy code.
 *
 * ── NHÓM 2: DYNAMIC FIELDS (được phép dùng logic động) ─────────────────────
 *
 * Chạy tại build time nên dùng được `process.env`, `deploymentEnv()`, gọi API,
 * vòng lặp, hàm helper:
 *   rewrites, redirects, headers, crons, functions, regions,
 *   functionFailoverRegions, images, cleanUrls, trailingSlash, fluid,
 *   ignoreCommand, bulkRedirectsPath
 *
 * Với rewrites/redirects/headers, ưu tiên helper `routes.*` từ @vercel/config.
 *
 * @see https://vercel.com/docs/project-configuration/git-configuration
 * @see https://vercel.com/docs/project-configuration/vercel-ts
 */

import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  // ⚠️ STATIC FIELD — literal tĩnh, xem NHÓM 1 ở header.
  git: {
    // Branch không khai báo mặc định là `true`. `main`/`staging` liệt kê tường
    // minh để rõ ý đồ whitelist; chỉ `dev: false` là dòng thực sự chặn deploy.
    deploymentEnabled: {
      main: true,
      staging: true,
      dev: false,
    },
  },

  /**
   * Pin function về Singapore — ĐẶT THEO VỊ TRÍ DATABASE, không theo vị trí người dùng.
   *
   * Toàn bộ hạ tầng stateful của hệ thống nằm ở AWS `ap-southeast-1`: MongoDB Atlas, Redis, và
   * Step Functions settle/void/resettle (grep `ap-southeast-1` toàn repo: 100% ARN, không có
   * region thứ hai). `sin1` của Vercel cùng chỗ đó ⇒ RTT tới DB ~1-5ms.
   *
   * VÌ SAO QUAN TRỌNG HƠN BÌNH THƯỜNG Ở APP NÀY: backoffice có AI Panel, và một lượt trả lời của
   * agent gọi nhiều tool liên tiếp, mỗi tool vài query Mongo — TUẦN TỰ, vì model phải đọc kết quả
   * tool trước mới quyết định gọi tool sau. Latency DB vì vậy được nhân lên chứ không cộng: để
   * mặc định (`iad1`, Washington DC — default của MỌI project mới theo docs Vercel) thì mỗi round
   * trip tới Atlas Singapore ~230ms, cộng TLS+auth handshake ~5 RTT (~1,2s) mỗi cold start ⇒ chậm
   * hơn local vài giây/lượt dù model y hệt.
   *
   * ĐÁNH ĐỔI ĐÃ CÂN: model call đi qua AI Gateway từ `sin1` có thể xa provider hơn `iad1` một
   * chút (~+100-150ms/call). Nhưng input đã đo là ~64.770 token/lượt (trung vị, xem `agent/agent.ts`
   * §limits) nên thời gian model xử lý tính bằng giây — trăm ms đó không đáng kể, còn phía DB thì
   * tiết kiệm hàng giây. Staff cũng ở VN nên `sin1` đồng thời tốt hơn cho TTFB streaming.
   *
   * Một region duy nhất là CÓ CHỦ ĐÍCH dù plan Pro cho tới 5: mọi state chỉ có MỘT bản ở
   * Singapore, nên replica ở region xa DB chỉ đổi chỗ độ trễ, không giảm. Thêm region ở đây là
   * tăng tiền mà chậm hơn.
   *
   * ⚠️ GIẢ ĐỊNH CHƯA VERIFY BẰNG MÁY: "Atlas ở `ap-southeast-1`" được SUY RA từ việc 100% ARN
   * Step Functions trong repo là `ap-southeast-1`, KHÔNG phải từ việc đọc cluster thật —
   * `MONGODB_URI` không hardcode ở đâu trong repo (đúng như phải vậy) nên không kiểm được từ code.
   * Nếu Atlas thực tế ở region khác (vd `us-east-1`) thì toàn bộ lập luận trên ĐẢO CHIỀU và `sin1`
   * làm CHẬM HƠN default. Kiểm bằng Atlas UI → Cluster → Region trước khi tin con số ở đây.
   *
   * Đồng bộ với dashboard: Project → Settings → Functions → Function Regions cũng đã chọn `sin1`
   * (18/08). Giữ cả ở file này vì file mới là thứ **review được và có lịch sử git** — đổi trên
   * dashboard không để lại dấu vết nào trong repo. Hệ quả cần biết: sửa region trên dashboard mà
   * không sửa dòng này thì sẽ có cảm giác "đổi mà không ăn" — sửa ở ĐÂY.
   */
  regions: ["sin1"],
};
