import { Roboto } from "next/font/google";

/**
 * Lazy — chỉ nạp khi user chọn font Roboto.
 *
 * `preload: false` BẮT BUỘC: font lazy vẫn nằm trong module graph của route
 * (`ensure-font-loaded.ts`), nên Next vẫn chèn `<link rel="preload">` woff2 nếu
 * preload bật → Chrome cảnh báo "preloaded but not used within a few seconds".
 */
export const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
  display: "swap",
  preload: false,
});
