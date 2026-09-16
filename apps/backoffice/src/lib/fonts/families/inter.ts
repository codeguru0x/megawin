import { Inter } from "next/font/google";

/**
 * Sans mặc định — luôn gắn trên `<body>` (critical path).
 * Chỉ weight UI hay dùng — tránh next/font preload cả dải weight rồi Chrome
 * cảnh báo "preloaded but not used within a few seconds".
 */
export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});
