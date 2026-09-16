import { Nunito } from "next/font/google";

/** Lazy — chỉ nạp khi user chọn Nunito. */
export const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
});
