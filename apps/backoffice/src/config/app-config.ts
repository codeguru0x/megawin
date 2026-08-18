const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "Megawin",
  version: "20260818",
  copyright: `© ${currentYear} - Megawin`,
  meta: {
    title: "Megawin Backoffice",
    description: "Megawin Backoffice",
  },
};

/**
 * Tên riêng của trợ lý AI trong backoffice — dùng xuyên suốt panel, trang `/ai` (p1-01),
 * tooltip, và persona system prompt (p0-02). Đặt tập trung ở đây để đổi tên chỉ 1 chỗ.
 */
export const AI_ASSISTANT_NAME = "Mira";

/**
 * Route trang chat full-page (p1-01) — panel tự ẩn trigger + tự đóng khi đang ở route này
 * (2 bề mặt chat cùng hiện là dư thừa). Hằng số dùng chung giữa `ai-panel-trigger.tsx`,
 * `ai-panel-provider.tsx`, và sidebar nav item — đổi path chỉ 1 chỗ.
 */
export const AI_FULL_PAGE_PATH = "/ai";
