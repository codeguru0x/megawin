const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "Megawin",
  version: "20260815",
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
