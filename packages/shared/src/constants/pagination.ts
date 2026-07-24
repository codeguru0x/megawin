/**
 * Pagination – Hằng số mặc định dùng chung toàn hệ thống.
 *
 * Import: @megawin/shared/constants/pagination
 */

export const Pagination = {
  Default: {
    Page: 1,
    Size: 20,
  },

  Max: {
    Page: 100,
    Size: 100,
  },

  /**
   * Report — danh sách báo cáo entries trúng thưởng (winning entries) sau khi
   * settle. Cursor-based "Load more" (không phân trang theo Page). Size lớn
   * hơn Default vì phục vụ đối soát kế toán, cần load nhiều dòng/lần hơn danh
   * sách UI thường (audit log, tx log...).
   */
  Report: {
    Size: 50,
    Max: 200,
  },
} as const;
