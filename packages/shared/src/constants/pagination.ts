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
} as const;
