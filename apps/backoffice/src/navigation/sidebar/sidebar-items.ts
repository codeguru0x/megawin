import {
  Banknote,
  ChartBar,
  LayoutDashboard,
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
  Clock,
  Layers,
  CircleDollarSign,
  Ticket,
  Activity,
} from "lucide-react";

export interface NavSubItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
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
            isNew: true,
          },
          {
            title: "Kỳ quay",
            url: "/games/lotto535/draws",
            icon: CalendarClock,
          },
          {
            title: "Vé chờ quay",
            url: "/games/lotto535/pending-tickets",
            icon: Clock,
            isNew: true,
          },
          {
            title: "Vé nhiều kỳ",
            url: "/games/lotto535/multi-draw",
            icon: Layers,
            isNew: true,
          },
          {
            title: "Thống kê tài chính",
            url: "/games/lotto535/financial-reports",
            icon: CircleDollarSign,
            isNew: true,
          },
          { title: "Cấu hình", url: "/games/lotto535/config", icon: Settings2 },
          {
            title: "Cấu hình đại lý",
            url: "/games/lotto535/tenant-config",
            icon: Building2,
            isNew: true,
          },
          { title: "Jackpot", url: "/games/lotto535/jackpot", icon: Trophy },
        ],
      },
      {
        title: "Power 6/55",
        url: "/games/power655",
        icon: ChessQueen,
        subItems: [
          {
            title: "Kỳ quay",
            url: "/games/power655/draws",
            icon: CalendarClock,
          },
          {
            title: "Vé chờ quay",
            url: "/games/power655/pending-tickets",
            icon: Clock,
            isNew: true,
          },
          {
            title: "Quản lý vé",
            url: "/games/power655/tickets",
            icon: Ticket,
            isNew: true,
          },
          {
            title: "Thống kê tài chính",
            url: "/games/power655/financial-reports",
            icon: CircleDollarSign,
            isNew: true,
          },
          { title: "Cấu hình", url: "/games/power655/config", icon: Settings2 },
          {
            title: "Cấu hình đại lý",
            url: "/games/power655/tenant-config",
            icon: Building2,
            isNew: true,
          },
          { title: "Jackpot", url: "/games/power655/jackpot", icon: Trophy },
        ],
      },
      {
        title: "Mega 6/45",
        url: "/games/mega645",
        icon: ChessRook,
        subItems: [
          {
            title: "Kỳ quay",
            url: "/games/mega645/draws",
            icon: CalendarClock,
          },
          {
            title: "Vé chờ quay",
            url: "/games/mega645/pending-tickets",
            icon: Clock,
            isNew: true,
          },
          {
            title: "Quản lý vé",
            url: "/games/mega645/tickets",
            icon: Ticket,
            isNew: true,
          },
          {
            title: "Thống kê tài chính",
            url: "/games/mega645/financial-reports",
            icon: CircleDollarSign,
            isNew: true,
          },
          { title: "Cấu hình", url: "/games/mega645/config", icon: Settings2 },
          {
            title: "Cấu hình đại lý",
            url: "/games/mega645/tenant-config",
            icon: Building2,
            isNew: true,
          },
          { title: "Jackpot", url: "/games/mega645/jackpot", icon: Trophy },
        ],
      },
      {
        title: "Keno",
        url: "/games/keno",
        icon: ChessBishop,
        subItems: [
          { title: "Kỳ quay", url: "/games/keno/draws", icon: CalendarClock },
          {
            title: "Bảng giải thưởng",
            url: "/games/keno/prize-table",
            icon: Trophy,
            isNew: true,
          },
          {
            title: "Thống kê tài chính",
            url: "/games/keno/financial-reports",
            icon: CircleDollarSign,
            isNew: true,
          },
          { title: "Cấu hình", url: "/games/keno/config", icon: Settings2 },
          {
            title: "Cấu hình đại lý",
            url: "/games/keno/tenant-config",
            icon: Building2,
            isNew: true,
          },
        ],
      },
      {
        title: "Bingo 18",
        url: "/games/bingo18",
        icon: ChessKnight,
        isNew: true,
        subItems: [
          {
            title: "Kỳ quay",
            url: "/games/bingo18/draws",
            icon: CalendarClock,
          },
          {
            title: "Thống kê tài chính",
            url: "/games/bingo18/financial-reports",
            icon: CircleDollarSign,
            isNew: true,
          },
          { title: "Cấu hình", url: "/games/bingo18/config", icon: Settings2 },
          {
            title: "Cấu hình đại lý",
            url: "/games/bingo18/tenant-config",
            icon: Building2,
            isNew: true,
          },
        ],
      },
      {
        title: "Max 3D",
        url: "/games/max3d",
        icon: ChessRook,
        subItems: [
          {
            title: "Kỳ quay",
            url: "/games/max3d/draws",
            icon: CalendarClock,
          },
          {
            title: "Vé chờ quay",
            url: "/games/max3d/pending-tickets",
            icon: Clock,
            isNew: true,
          },
          {
            title: "Quản lý vé",
            url: "/games/max3d/tickets",
            icon: Ticket,
            isNew: true,
          },
          {
            title: "Thống kê tài chính",
            url: "/games/max3d/financial-reports",
            icon: CircleDollarSign,
            isNew: true,
          },
          {
            title: "Báo cáo",
            url: "/games/max3d/reports",
            icon: ChartBar,
            isNew: true,
          },
          { title: "Cấu hình", url: "/games/max3d/config", icon: Settings2 },
          {
            title: "Cấu hình đại lý",
            url: "/games/max3d/tenant-config",
            icon: Building2,
            isNew: true,
          },
        ],
      },
      {
        title: "Max 3D Pro",
        url: "/games/max3dpro",
        icon: ChessPawn,
        isNew: true,
        subItems: [
          {
            title: "Kỳ quay",
            url: "/games/max3dpro/draws",
            icon: CalendarClock,
          },
          {
            title: "Vé chờ quay",
            url: "/games/max3dpro/pending-tickets",
            icon: Clock,
            isNew: true,
          },
          {
            title: "Quản lý vé",
            url: "/games/max3dpro/tickets",
            icon: Ticket,
            isNew: true,
          },
          {
            title: "Thống kê tài chính",
            url: "/games/max3dpro/financial-reports",
            icon: CircleDollarSign,
            isNew: true,
          },
          {
            title: "Báo cáo",
            url: "/games/max3dpro/reports",
            icon: ChartBar,
            isNew: true,
          },
          {
            title: "Cấu hình",
            url: "/games/max3dpro/config",
            icon: Settings2,
          },
          {
            title: "Cấu hình đại lý",
            url: "/games/max3dpro/tenant-config",
            icon: Building2,
            isNew: true,
          },
        ],
      },
    ],
  },
];

export const sidebarItems = operatorSidebarItems;
