import { Plus_Jakarta_Sans } from "next/font/google";

/** Lazy — chỉ nạp khi user chọn Plus Jakarta Sans. */
export const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});
