import { Geist } from "next/font/google";

/** Lazy — chỉ nạp khi user chọn font Geist. `preload: false` — xem `roboto.ts`. */
export const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
  preload: false,
});
