import {
  Banknote,
  ChartBar,
  LayoutDashboard,
  type LucideIcon,
  Gamepad,
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
        url: "/accounts/tenants",
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
          { title: "Kỳ quay", url: "/games/lotto535/draws", icon: CalendarClock },
          { title: "Vé chờ quay", url: "/games/lotto535/pending-tickets", icon: Clock, isNew: true },
          { title: "Vé nhiều kỳ", url: "/games/lotto535/multi-draw", icon: Layers, isNew: true },
          { title: "Thống kê tài chính", url: "/games/lotto535/financial-reports", icon: CircleDollarSign, isNew: true },
          { title: "Cấu hình", url: "/games/lotto535/config", icon: Settings2 },
          { title: "Jackpot", url: "/games/lotto535/jackpot", icon: Trophy },
        ],
      },
      {
        title: "Power 6/55",
        url: "/dashboard/power-6_45",
        icon: ChessQueen,
        subItems: [
          { title: "Cấu hình", url: "/dashboard/game/1", icon: Gamepad },
          { title: "Jackpot", url: "/dashboard/game/2", icon: Gamepad },
          { title: "Lịch sử", url: "/dashboard/game/3", icon: Gamepad },
        ],
      },
      {
        title: "Mega 6/45",
        url: "/dashboard/mega-6_45",
        icon: ChessRook,
        subItems: [
          { title: "Cấu hình", url: "/dashboard/game/1", icon: Gamepad },
          { title: "Jackpot", url: "/dashboard/game/2", icon: Gamepad },
          { title: "Lịch sử", url: "/dashboard/game/3", icon: Gamepad },
        ],
      },
      {
        title: "Keno",
        url: "/games/keno",
        icon: ChessBishop,
        subItems: [
          { title: "Kỳ quay", url: "/games/keno/draws", icon: CalendarClock },
          { title: "Bảng giải thưởng", url: "/games/keno/prize-table", icon: Trophy, isNew: true },
          { title: "Thống kê tài chính", url: "/games/keno/financial-reports", icon: CircleDollarSign, isNew: true },
          { title: "Cấu hình", url: "/games/keno/config", icon: Settings2 },
        ],
      },
      {
        title: "Bingo 18",
        url: "/dashboard/bingo-18",
        icon: ChessKnight,
        subItems: [
          { title: "Cấu hình", url: "/dashboard/game/1", icon: Gamepad },
          { title: "Lịch sử", url: "/dashboard/game/3", icon: Gamepad },
        ],
      },
      {
        title: "Max 3D",
        url: "/dashboard/max-3d",
        icon: ChessRook,
        subItems: [
          { title: "Cấu hình", url: "/dashboard/game/1", icon: Gamepad },
          { title: "Lịch sử", url: "/dashboard/game/3", icon: Gamepad },
        ],
      },
      {
        title: "Max 3D Pro",
        url: "/dashboard/max-3d-pro",
        icon: ChessPawn,
        subItems: [
          { title: "Cấu hình", url: "/dashboard/game/1", icon: Gamepad },
          { title: "Lịch sử", url: "/dashboard/game/3", icon: Gamepad },
        ],
      },
    ],
  },
];

export const sidebarItems = operatorSidebarItems;
