import { Roboto } from "next/font/google";

/** Lazy — chỉ nạp khi user chọn font Roboto. */
export const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
  display: "swap",
});
