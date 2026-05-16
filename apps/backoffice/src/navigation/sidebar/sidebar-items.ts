import {
  type LucideIcon,
  Building2,
  Briefcase,
  User,
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
  FileSearch,
  Send,
  Undo2,
  History,
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
        url: "/reports/settle",
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
    id: 3,
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
            url: "/games/lotto535/reports/settle",
            icon: CircleDollarSign,
            sectionLabel: "Báo cáo",
          },
          {
            title: "Tồn đọng",
            url: "/games/lotto535/reports/outstanding",
            icon: Clock,
          },
          {
            title: "Kỳ huỷ",
            url: "/games/lotto535/reports/void",
            icon: Ban,
          },
          {
            title: "Cấu hình game",
            url: "/games/lotto535/config/game",
            icon: Settings2,
            sectionLabel: "Cài đặt",
          },
          {
            title: "Cấu hình đại lý",
            url: "/games/lotto535/config/tenant",
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
            url: "/games/power655/reports/settle",
            icon: CircleDollarSign,
            sectionLabel: "Báo cáo",
          },
          {
            title: "Tồn đọng",
            url: "/games/power655/reports/outstanding",
            icon: Clock,
          },
          {
            title: "Kỳ huỷ",
            url: "/games/power655/reports/void",
            icon: Ban,
          },
          {
            title: "Cấu hình game",
            url: "/games/power655/config/game",
            icon: Settings2,
            sectionLabel: "Cài đặt",
          },
          {
            title: "Cấu hình đại lý",
            url: "/games/power655/config/tenant",
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
            url: "/games/mega645/reports/settle",
            icon: CircleDollarSign,
            sectionLabel: "Báo cáo",
          },
          {
            title: "Tồn đọng",
            url: "/games/mega645/reports/outstanding",
            icon: Clock,
          },
          {
            title: "Kỳ huỷ",
            url: "/games/mega645/reports/void",
            icon: Ban,
          },
          {
            title: "Cấu hình game",
            url: "/games/mega645/config/game",
            icon: Settings2,
            sectionLabel: "Cài đặt",
          },
          {
            title: "Cấu hình đại lý",
            url: "/games/mega645/config/tenant",
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
            url: "/games/keno/reports/settle",
            icon: CircleDollarSign,
            sectionLabel: "Báo cáo",
          },
          {
            title: "Tồn đọng",
            url: "/games/keno/reports/outstanding",
            icon: Clock,
          },
          {
            title: "Kỳ huỷ",
            url: "/games/keno/reports/void",
            icon: Ban,
          },
          {
            title: "Cấu hình game",
            url: "/games/keno/config/game",
            icon: Settings2,
            sectionLabel: "Cài đặt",
          },
          {
            title: "Cấu hình đại lý",
            url: "/games/keno/config/tenant",
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
            url: "/games/bingo18/reports/settle",
            icon: CircleDollarSign,
            sectionLabel: "Báo cáo",
          },
          {
            title: "Tồn đọng",
            url: "/games/bingo18/reports/outstanding",
            icon: Clock,
          },
          {
            title: "Kỳ huỷ",
            url: "/games/bingo18/reports/void",
            icon: Ban,
          },
          {
            title: "Cấu hình game",
            url: "/games/bingo18/config/game",
            icon: Settings2,
            sectionLabel: "Cài đặt",
          },
          {
            title: "Cấu hình đại lý",
            url: "/games/bingo18/config/tenant",
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
            url: "/games/max3d/reports/settle",
            icon: CircleDollarSign,
            sectionLabel: "Báo cáo",
          },
          {
            title: "Tồn đọng",
            url: "/games/max3d/reports/outstanding",
            icon: Clock,
          },
          {
            title: "Kỳ huỷ",
            url: "/games/max3d/reports/void",
            icon: Ban,
          },
          {
            title: "Cấu hình game",
            url: "/games/max3d/config/game",
            icon: Settings2,
            sectionLabel: "Cài đặt",
          },
          {
            title: "Cấu hình đại lý",
            url: "/games/max3d/config/tenant",
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
            url: "/games/max3dpro/reports/settle",
            icon: CircleDollarSign,
            sectionLabel: "Báo cáo",
          },
          {
            title: "Tồn đọng",
            url: "/games/max3dpro/reports/outstanding",
            icon: Clock,
          },
          {
            title: "Kỳ huỷ",
            url: "/games/max3dpro/reports/void",
            icon: Ban,
          },
          {
            title: "Cấu hình game",
            url: "/games/max3dpro/config/game",
            icon: Settings2,
            sectionLabel: "Cài đặt",
          },
          {
            title: "Cấu hình đại lý",
            url: "/games/max3dpro/config/tenant",
            icon: Building2,
          },
        ],
      },
    ],
  },
  {
    id: 4,
    label: "Tài khoản",
    items: [
      {
        title: "Công ty",
        url: "/accounts/company",
        icon: Building2,
      },
      /* Tạm chưa dùng    {
        title: "Đại lý",
        url: "/accounts/agents",
        icon: Users,
      }, */
      {
        title: "Người chơi",
        url: "/accounts/players",
        icon: User,
      },
    ],
  },
  {
    id: 5,
    label: "Giao dịch đại lý",
    items: [
      {
        title: "Lệnh gửi đại lý",
        url: "/reports/transactions/dispatch",
        icon: Send,
      },
      {
        title: "Lịch sử giao dịch",
        url: "/reports/transactions/api-logs",
        icon: FileSearch,
      },
    ],
  },
];

export const sidebarItems = operatorSidebarItems;
