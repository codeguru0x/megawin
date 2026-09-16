import { Outfit } from "next/font/google";

/** Lazy — chỉ nạp khi user chọn Outfit. */
export const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});
