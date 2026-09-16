import { Manrope } from "next/font/google";

/** Lazy — chỉ nạp khi user chọn Manrope. */
export const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});
