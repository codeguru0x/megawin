import { Geist_Mono } from "next/font/google";

/**
 * Mono dùng toàn app (`--font-mono` / `font-mono`) — luôn gắn trên `<body>`.
 * Cũng là lựa chọn UI khi `data-font="geistMono"`.
 *
 * `preload: false` — mono chỉ hiện trên code/ID; preload sớm hay bị Chrome
 * cảnh báo unused (đặc biệt khi soft-nav / nhiều `<Link prefetch>`).
 */
export const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
  preload: false,
  weight: ["400", "500", "600", "700"],
});
