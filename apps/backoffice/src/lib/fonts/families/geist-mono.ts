import { Geist_Mono } from "next/font/google";

/**
 * Mono dùng toàn app (`--font-mono` / `font-mono`) — luôn gắn trên `<body>`.
 * Cũng là lựa chọn UI khi `data-font="geistMono"`.
 */
export const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});
