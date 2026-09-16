import { Great_Vibes } from "next/font/google";

/** Lazy — chỉ nạp khi user chọn Great Vibes. */
export const greatVibes = Great_Vibes({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-great-vibes",
  display: "swap",
});
