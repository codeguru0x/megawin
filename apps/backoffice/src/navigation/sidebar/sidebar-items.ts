import {
  Banknote,
  Calendar,
  ChartBar,
  Fingerprint,
  Forklift,
  Gauge,
  GraduationCap,
  Kanban,
  LayoutDashboard,
  Lock,
  type LucideIcon,
  Mail,
  MessageSquare,
  ReceiptText,
  ShoppingBag,
  Gamepad,
  Building2,
  Briefcase,
  SquareArrowUpRight,
  User,
  ChessBishop,
  ChessKing,
  ChessQueen,
  ChessRook,
  ChessKnight,
  ChessPawn,
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

export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "Thống kê",
    items: [
      {
        title: "Thắng thua",
        url: "/dashboard/default",
        icon: LayoutDashboard,
      },
      {
        title: "Doanh thu",
        url: "/dashboard/crm",
        icon: ChartBar,
      },
      { title: "Chi tiêu", url: "/dashboard/finance", icon: Banknote },
    ],
  },
  {
    id: 2,
    label: "Tài khoản",
    items: [
      {
        title: "Công ty",
        url: "/dashboard/company",
        icon: Building2,
      },
      {
        title: "Đối tác",
        url: "/dashboard/tenant",
        icon: Briefcase,
      },
      {
        title: "Người chơi",
        url: "/dashboard/player",
        icon: User,
      },
    ],
  },
  {
    id: 3,
    label: "Trò chơi",
    items: [
      {
        title: "Lotto 5/35",
        url: "/dashboard/lotto-5_35",
        icon: ChessKing,
        subItems: [
          { title: "Cấu hình", url: "/dashboard/game/1", icon: Gamepad },
          { title: "Jackpot", url: "/dashboard/game/2", icon: Gamepad },
          { title: "Lịch sử", url: "/dashboard/game/3", icon: Gamepad },
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
        url: "/dashboard/keno",
        icon: ChessBishop,
        subItems: [
          { title: "Cấu hình", url: "/dashboard/game/1", icon: Gamepad },
          { title: "Lịch sử", url: "/dashboard/game/3", icon: Gamepad },
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
