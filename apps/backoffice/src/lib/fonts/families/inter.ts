import { Inter } from "next/font/google";

/** Sans mặc định — luôn gắn trên `<body>` (critical path). */
export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
