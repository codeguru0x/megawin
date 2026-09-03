"use client";

import type { SourceEntity } from "@megawin/resultfeed/entities";
import { Loader2, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { RESULTFEED_GAME_LABELS, SOURCE_ROLE_LABELS } from "../../_lib/labels";

export interface SourcesTableProps {
  rows: SourceEntity[];
  isLoading: boolean;
  onEdit: (row: SourceEntity) => void;
}

/** Bảng liệt kê toàn bộ nguồn thu thập — trang `sources`. */
export function SourcesTable({ rows, isLoading, onEdit }: SourcesTableProps) {
  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <span className="text-sm">Đang tải danh sách nguồn…</span>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-5">Nguồn</TableHead>
            <TableHead>Vai trò</TableHead>
            <TableHead className="text-right">Trust</TableHead>
            <TableHead>Game</TableHead>
            <TableHead className="text-center">Trạng thái</TableHead>
            <TableHead className="w-20 pr-5" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="pl-5">
                <div className="flex flex-col">
                  <span className="font-medium text-sm">{row.name}</span>
                  <span className="font-mono text-muted-foreground text-xs">{row.sourceId}</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{SOURCE_ROLE_LABELS[row.role]}</Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">{row.trustWeight}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {row.gameKeys.map((key) => (
                    <Badge key={key} variant="secondary" className="text-xs">
                      {RESULTFEED_GAME_LABELS[key]}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell className="text-center">
                <Badge variant={row.isEnabled ? "secondary" : "destructive"}>
                  {row.isEnabled ? "Đang chạy" : "Đã tắt"}
                </Badge>
              </TableCell>
              <TableCell className="pr-5 text-right">
                <Button variant="ghost" size="icon" className="size-7" onClick={() => onEdit(row)}>
                  <Pencil className="size-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
