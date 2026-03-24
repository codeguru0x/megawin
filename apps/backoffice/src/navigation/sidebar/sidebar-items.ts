import {
  type LucideIcon,
  Building2,
  Briefcase,
  User,
  Users,
  ChessBishop,
  ChessKing,
  ChessQueen,
  ChessRook,
  ChessKnight,
  ChessPawn,
  Trophy,
  Settings2,
  CalendarClock,
  Activity,
  BarChart3,
  Clock,
  CircleDollarSign,
  Ban,
} from "lucide-react";

import { CompanyRole } from "@megawin/identity/entities";
import type { AccountRole } from "@megawin/identity/entities";

export interface NavSubItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
  /** Nhãn phân nhóm hiển thị phía trên item (separator + label). */
  sectionLabel?: string;
  /**
   * Danh sách roles được phép thấy sub-item này.
   * Nếu không khai báo → không giới hạn, mọi user đã đăng nhập đều thấy.
   * User có 1 trong các role liệt kê sẽ được hiển thị.
   */
  roles?: AccountRole[];
}

export interface NavMainItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  subItems?: NavSubItem[];
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
  /**
   * Danh sách roles được phép thấy item này.
   * Nếu không khai báo → không giới hạn, mọi user đã đăng nhập đều thấy.
   * User có 1 trong các role liệt kê sẽ được hiển thị.
   */
  roles?: AccountRole[];
}

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
  /**
   * Danh sách roles được phép thấy cả group này.
   * Nếu không khai báo → không giới hạn.
   * Nếu khai báo → chỉ hiện group khi user có ít nhất 1 role phù hợp.
   */
  roles?: AccountRole[];
}

export const operatorSidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "Quản lý",
    items: [
      {
        title: "Ứng dụng",
        url: "/tenants",
        icon: Briefcase,
        /** Chỉ admin mới có quyền quản lý ứng dụng (tenants). */
        roles: [CompanyRole.Admin],
      },
    ],
  },
  {
    id: 2,
    label: "Báo cáo",
    items: [
      {
        title: "Tài chính",
        url: "/reports/financial",
        icon: BarChart3,
      },
      {
        title: "Tồn đọng",
        url: "/reports/outstanding",
        icon: Clock,
      },
    ],
  },

  {
    id: 4,
    label: "Trò chơi",
    items: [
      {
        title: "Lotto 5/35",
        url: "/games/lotto535",
        icon: ChessKing,
        subItems: [
          {
            title: "Vận hành",
            url: "/games/lotto535/operations",
            icon: Activity,
            sectionLabel: "Vận hành",
          },
          {
            title: "Kỳ quay",
            url: "/games/lotto535/draws",
            icon: CalendarClock,
          },
          {
            title: "Jackpot",
            url: "/games/lotto535/jackpot",
            icon: Trophy,
          },
          {
            title: "Báo cáo tài chính",
            url: "/games/lotto535/financial-reports",
            icon: CircleDollarSign,
            sectionLabel: "Báo cáo",
          },
          {
            title: "Tồn đọng",
            url: "/games/lotto535/outstanding",
            icon: Clock,
          },
          {
            title: "Kỳ huỷ",
            url: "/games/lotto535/void-reports",
            icon: Ban,
          },
          {
            title: "Cấu hình game",
            url: "/games/lotto535/config",
            icon: Settings2,
            sectionLabel: "Cài đặt",
            /** Chỉ admin mới được chỉnh cấu hình game. */
          },
          {
            title: "Cấu hình đại lý",
            url: "/games/lotto535/tenant-config",
            icon: Building2,
          },
        ],
      },
      {
        title: "Power 6/55",
        url: "/games/power655",
        icon: ChessQueen,
        subItems: [
          {
            title: "Vận hành",
            url: "/games/power655/operations",
            icon: Activity,
            sectionLabel: "Vận hành",
          },
          {
            title: "Kỳ quay",
            url: "/games/power655/draws",
            icon: CalendarClock,
          },
          {
            title: "Jackpot",
            url: "/games/power655/jackpot",
            icon: Trophy,
          },
          {
            title: "Báo cáo tài chính",
            url: "/games/power655/financial-reports",
            icon: CircleDollarSign,
            sectionLabel: "Báo cáo",
          },
          {
            title: "Tồn đọng",
            url: "/games/power655/outstanding",
            icon: Clock,
          },
          {
            title: "Kỳ huỷ",
            url: "/games/power655/void-reports",
            icon: Ban,
          },
          {
            title: "Cấu hình game",
            url: "/games/power655/config",
            icon: Settings2,
            sectionLabel: "Cài đặt",
          },
          {
            title: "Cấu hình đại lý",
            url: "/games/power655/tenant-config",
            icon: Building2,
          },
        ],
      },
      {
        title: "Mega 6/45",
        url: "/games/mega645",
        icon: ChessRook,
        subItems: [
          {
            title: "Vận hành",
            url: "/games/mega645/operations",
            icon: Activity,
            sectionLabel: "Vận hành",
          },
          {
            title: "Kỳ quay",
            url: "/games/mega645/draws",
            icon: CalendarClock,
          },
          {
            title: "Jackpot",
            url: "/games/mega645/jackpot",
            icon: Trophy,
          },
          {
            title: "Báo cáo tài chính",
            url: "/games/mega645/financial-reports",
            icon: CircleDollarSign,
            sectionLabel: "Báo cáo",
          },
          {
            title: "Tồn đọng",
            url: "/games/mega645/outstanding",
            icon: Clock,
          },
          {
            title: "Kỳ huỷ",
            url: "/games/mega645/void-reports",
            icon: Ban,
          },
          {
            title: "Cấu hình game",
            url: "/games/mega645/config",
            icon: Settings2,
            sectionLabel: "Cài đặt",
          },
          {
            title: "Cấu hình đại lý",
            url: "/games/mega645/tenant-config",
            icon: Building2,
          },
        ],
      },
      {
        title: "Keno",
        url: "/games/keno",
        icon: ChessBishop,
        subItems: [
          {
            title: "Vận hành",
            url: "/games/keno/operations",
            icon: Activity,
            sectionLabel: "Vận hành",
          },
          {
            title: "Kỳ quay",
            url: "/games/keno/draws",
            icon: CalendarClock,
          },
          {
            title: "Báo cáo tài chính",
            url: "/games/keno/financial-reports",
            icon: CircleDollarSign,
            sectionLabel: "Báo cáo",
          },
          {
            title: "Tồn đọng",
            url: "/games/keno/outstanding",
            icon: Clock,
          },
          {
            title: "Kỳ huỷ",
            url: "/games/keno/void-reports",
            icon: Ban,
          },
          {
            title: "Cấu hình game",
            url: "/games/keno/config",
            icon: Settings2,
            sectionLabel: "Cài đặt",
          },
          {
            title: "Cấu hình đại lý",
            url: "/games/keno/tenant-config",
            icon: Building2,
          },
        ],
      },
      {
        title: "Bingo 18",
        url: "/games/bingo18",
        icon: ChessKnight,
        subItems: [
          {
            title: "Vận hành",
            url: "/games/bingo18/operations",
            icon: Activity,
            sectionLabel: "Vận hành",
          },
          {
            title: "Kỳ quay",
            url: "/games/bingo18/draws",
            icon: CalendarClock,
          },
          {
            title: "Báo cáo tài chính",
            url: "/games/bingo18/financial-reports",
            icon: CircleDollarSign,
            sectionLabel: "Báo cáo",
          },
          {
            title: "Tồn đọng",
            url: "/games/bingo18/outstanding",
            icon: Clock,
          },
          {
            title: "Kỳ huỷ",
            url: "/games/bingo18/void-reports",
            icon: Ban,
          },
          {
            title: "Cấu hình game",
            url: "/games/bingo18/config",
            icon: Settings2,
            sectionLabel: "Cài đặt",
          },
          {
            title: "Cấu hình đại lý",
            url: "/games/bingo18/tenant-config",
            icon: Building2,
          },
        ],
      },
      {
        title: "Max 3D",
        url: "/games/max3d",
        icon: ChessRook,
        subItems: [
          {
            title: "Vận hành",
            url: "/games/max3d/operations",
            icon: Activity,
            sectionLabel: "Vận hành",
          },
          {
            title: "Kỳ quay",
            url: "/games/max3d/draws",
            icon: CalendarClock,
          },
          {
            title: "Báo cáo tài chính",
            url: "/games/max3d/financial-reports",
            icon: CircleDollarSign,
            sectionLabel: "Báo cáo",
          },
          {
            title: "Tồn đọng",
            url: "/games/max3d/outstanding",
            icon: Clock,
          },
          {
            title: "Kỳ huỷ",
            url: "/games/max3d/void-reports",
            icon: Ban,
          },
          {
            title: "Cấu hình game",
            url: "/games/max3d/config",
            icon: Settings2,
            sectionLabel: "Cài đặt",
          },
          {
            title: "Cấu hình đại lý",
            url: "/games/max3d/tenant-config",
            icon: Building2,
          },
        ],
      },
      {
        title: "Max 3D Pro",
        url: "/games/max3dpro",
        icon: ChessPawn,
        subItems: [
          {
            title: "Vận hành",
            url: "/games/max3dpro/operations",
            icon: Activity,
            sectionLabel: "Vận hành",
          },
          {
            title: "Kỳ quay",
            url: "/games/max3dpro/draws",
            icon: CalendarClock,
          },
          {
            title: "Báo cáo tài chính",
            url: "/games/max3dpro/financial-reports",
            icon: CircleDollarSign,
            sectionLabel: "Báo cáo",
          },
          {
            title: "Tồn đọng",
            url: "/games/max3dpro/outstanding",
            icon: Clock,
          },
          {
            title: "Kỳ huỷ",
            url: "/games/max3dpro/void-reports",
            icon: Ban,
          },
          {
            title: "Cấu hình game",
            url: "/games/max3dpro/config",
            icon: Settings2,
            sectionLabel: "Cài đặt",
          },
          {
            title: "Cấu hình đại lý",
            url: "/games/max3dpro/tenant-config",
            icon: Building2,
          },
        ],
      },
    ],
  },
  {
    id: 3,
    label: "Tài khoản",
    items: [
      {
        title: "Công ty",
        url: "/accounts/company",
        icon: Building2,
      },
      {
        title: "Đại lý",
        url: "/accounts/agents",
        icon: Users,
      },
      {
        title: "Người chơi",
        url: "/accounts/players",
        icon: User,
      },
    ],
  },
];

export const sidebarItems = operatorSidebarItems;
