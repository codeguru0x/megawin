/**
 * ResultFeed – Vietlott: Shared Checksum Labels
 *
 * Nhãn tiếng Việt do Vietlott (chính chủ) công bố cho từng checksum — đây là THUẬT NGỮ
 * CHÍNH THỨC của game, KHÔNG phải cách trình bày riêng của 1 website. Mọi site mirror kết
 * quả Vietlott (`vietlott.vn` chính chủ, `minhchinh.com`, hoặc site khác trong tương lai)
 * nhiều khả năng dùng LẠI đúng các nhãn này — đặt ở `vietlott/shared/` (không phải riêng
 * trong `vietlott-detail/`) để mọi adapter con của `vietlott/` tái dùng, tránh lặp lại
 * mapping giống nhau ở từng site (DRY).
 *
 * ⚠️ Nếu 1 site cụ thể dùng nhãn KHÁC (VD viết hoa khác, hoặc tiếng Anh), site đó tự khai
 * mapping riêng trong adapter của mình — KHÔNG sửa file này để "vá" cho 1 site ngoại lệ.
 */

/** Nhãn CHẴN/LẺ/LỚN/NHỎ (Keno) → key `claimedChecksums` khớp `checkIntrinsic` domain. */
export const KENO_CHECKSUM_LABELS: Record<string, string> = {
  CHẴN: "even",
  LẺ: "odd",
  LỚN: "big",
  NHỎ: "small",
};

/** Nhãn phân loại "Lớn/Hòa/Nhỏ" (Bingo18) → giá trị `bigSmallDraw` khớp `checkIntrinsic` domain. */
export const BIG_SMALL_DRAW_LABELS: Record<string, string> = {
  Nhỏ: "small",
  Hòa: "draw",
  Lớn: "big",
};
