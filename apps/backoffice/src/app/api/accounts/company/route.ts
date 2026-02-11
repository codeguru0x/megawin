import { NextResponse } from "next/server";

type Role = "admin" | "manager" | "staff";
type Status = "active" | "inactive";

type CompanyAccount = {
  id: string;
  username: string;
  roles: Role[];
  status: Status;
  mfaEnabled: boolean;
  createdAt: string;
};

const MOCK_COMPANY_ACCOUNTS: CompanyAccount[] = [
  {
    id: "1",
    username: "admin.company",
    roles: ["admin"],
    status: "active",
    mfaEnabled: true,
    createdAt: "2024-01-10T09:00:00Z",
  },
  {
    id: "2",
    username: "ketoan.01",
    roles: ["manager", "staff"],
    status: "active",
    mfaEnabled: false,
    createdAt: "2024-02-15T10:30:00Z",
  },
  {
    id: "3",
    username: "nhanvien.sale",
    roles: ["staff"],
    status: "inactive",
    mfaEnabled: false,
    createdAt: "2024-03-01T14:20:00Z",
  },
];

export async function GET() {
  // TODO: Thay mock bằng gọi domain thực tế / database
  return NextResponse.json(MOCK_COMPANY_ACCOUNTS);
}
