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
};
