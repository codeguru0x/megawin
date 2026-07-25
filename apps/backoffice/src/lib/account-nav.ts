import { CircleUser, History, KeyRound, type LucideIcon, ShieldCheck } from "lucide-react";

/** 1 mục điều hướng trong khu vực tài khoản cá nhân (`/me/*`). */
export interface AccountNavItem {
  /** Nhãn hiển thị (tiếng Việt). */
  title: string;
  /** Đường dẫn tuyệt đối trong `/me`. */
  href: string;
  /** Icon lucide đi kèm. */
  icon: LucideIcon;
}

/**
 * Nguồn chân lý DUY NHẤT cho các mục tài khoản cá nhân — dùng chung ở:
 * - `NavUser` (dropdown góc dưới trái, menu đầy đủ),
 * - `account-nav.tsx` (in-page nav bên trong trang `/me`).
 *
 * Sửa 1 chỗ → cả 2 tầng đồng bộ, tránh lệch link/nhãn giữa các menu.
 */
export const ACCOUNT_NAV_ITEMS: readonly AccountNavItem[] = [
  { title: "Tài khoản", href: "/me", icon: CircleUser },
  { title: "Nhật ký", href: "/me/activity", icon: History },
  { title: "Đổi mật khẩu", href: "/me/change-password", icon: KeyRound },
  { title: "Bảo mật (MFA)", href: "/me/mfa", icon: ShieldCheck },
] as const;
