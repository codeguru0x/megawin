import {
  ChessKing,
  type LucideIcon,
  LayoutDashboard,
  Ticket,
  ListOrdered,
  FileBarChart,
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

export const agentSidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "Tổng quan",
    items: [
      {
        title: "Dashboard",
        url: "/",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    id: 2,
    label: "Trò chơi",
    items: [
      {
        title: "Lotto 5/35",
        url: "/lotto535",
        icon: ChessKing,
        subItems: [
          { title: "Vé", url: "/lotto535/tickets", icon: Ticket },
          { title: "Kết quả", url: "/lotto535/results", icon: ListOrdered },
          { title: "Báo cáo", url: "/lotto535/reports", icon: FileBarChart },
        ],
      },
    ],
  },
];

export const sidebarItems = agentSidebarItems;
