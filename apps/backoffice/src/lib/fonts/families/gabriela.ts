import { Gabriela } from "next/font/google";

/** Lazy — chỉ nạp khi user chọn Gabriela. `preload: false` — xem `roboto.ts`. */
export const gabriela = Gabriela({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-gabriela",
  display: "swap",
  preload: false,
});
