import { Outfit } from "next/font/google";

/** Lazy — chỉ nạp khi user chọn Outfit. `preload: false` — xem `roboto.ts`. */
export const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
  preload: false,
});
