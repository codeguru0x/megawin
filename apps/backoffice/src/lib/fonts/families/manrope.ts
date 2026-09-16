import { Manrope } from "next/font/google";

/** Lazy — chỉ nạp khi user chọn Manrope. `preload: false` — xem `roboto.ts`. */
export const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
  preload: false,
});
