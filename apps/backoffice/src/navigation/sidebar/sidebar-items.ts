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
} from "lucide-react";

export interface NavSubItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
  /** Nhãn phân nhóm hiển thị phía trên item (separator + label). */
  sectionLabel?: string;
}

export interface NavMainItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  subItems?: NavSubItem[];
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
}

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
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
      },
    ],
  },
  /*
  {
    id: 2,
    label: "Thống kê",
    items: [
      {
        title: "Thắng thua",
        url: "/default",
        icon: LayoutDashboard,
      },
      {
        title: "Doanh thu",
        url: "/crm",
        icon: ChartBar,
      },
      { title: "Chi tiêu", url: "/finance", icon: Banknote },
    ],
  },
  */
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
          /* {
            title: "Tài chính",
            url: "/games/lotto535/financial-reports",
            icon: CircleDollarSign,
            sectionLabel: "Báo cáo",
          },
          {
            title: "Thống kê",
            url: "/games/lotto535/stats",
            icon: ChartBar,
          }, */
          {
            title: "Cấu hình game",
            url: "/games/lotto535/config",
            icon: Settings2,
            sectionLabel: "Cài đặt",
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
];

export const sidebarItems = operatorSidebarItems;
