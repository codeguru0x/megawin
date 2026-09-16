import { Poppins } from "next/font/google";

/** Lazy — chỉ nạp khi user chọn font Poppins. */
export const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-poppins",
  display: "swap",
});
