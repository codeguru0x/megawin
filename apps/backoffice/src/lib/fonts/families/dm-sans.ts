import { DM_Sans } from "next/font/google";

/** Lazy — chỉ nạp khi user chọn DM Sans. */
export const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});
