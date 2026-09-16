import { Great_Vibes } from "next/font/google";

/** Lazy — chỉ nạp khi user chọn Great Vibes. `preload: false` — xem `roboto.ts`. */
export const greatVibes = Great_Vibes({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-great-vibes",
  display: "swap",
  preload: false,
});
