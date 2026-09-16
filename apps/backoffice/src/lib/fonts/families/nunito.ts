import { Nunito } from "next/font/google";

/** Lazy — chỉ nạp khi user chọn Nunito. `preload: false` — xem `roboto.ts`. */
export const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
  preload: false,
});
