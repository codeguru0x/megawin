import { Geist } from "next/font/google";

/** Lazy — chỉ nạp khi user chọn font Geist. */
export const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});
