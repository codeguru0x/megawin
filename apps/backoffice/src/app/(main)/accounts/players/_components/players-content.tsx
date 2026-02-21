"use client";

import { useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { PlayersTable } from "./players-table";

export function PlayersContent() {
  const [tenantInput, setTenantInput] = useState("");
  const [activeTenantId, setActiveTenantId] = useState("");

  function handleSearch() {
    setActiveTenantId(tenantInput.trim());
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="tenant-search">Tenant ID</Label>
          <Input
            id="tenant-search"
            placeholder="Nhập Tenant ID để tìm kiếm..."
            value={tenantInput}
            onChange={(e) => setTenantInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>
        <Button onClick={handleSearch} disabled={!tenantInput.trim()}>
          <Search className="mr-2 h-4 w-4" />
          Tìm kiếm
        </Button>
      </div>

      <PlayersTable tenantId={activeTenantId} />
    </div>
  );
}
