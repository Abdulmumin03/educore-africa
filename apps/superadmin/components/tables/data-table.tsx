"use client"

import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table"
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, Inbox } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

const SKELETON_ROWS = 10

function HeaderSort({ state }: { state: false | "asc" | "desc" }) {
  if (state === "asc") return <ChevronUp className="h-3 w-3" aria-hidden="true" />
  if (state === "desc") return <ChevronDown className="h-3 w-3" aria-hidden="true" />
  return <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />
}

/**
 * Console table. Client-side sorting, filtering and pagination — fine for the
 * few-hundred-row sets the console shows; anything larger should paginate
 * server-side and hand this one page at a time.
 *
 * `stickyFirst` pins the first column so a wide table can be scrolled
 * sideways without losing the row's identity.
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  loading = false,
  searchPlaceholder = "Filter…",
  searchable = true,
  pageSize = 25,
  stickyFirst = false,
  toolbar,
  emptyIcon: EmptyIcon = Inbox,
  emptyTitle = "No results",
  emptyDescription,
  getRowId,
  onRowClick,
}: {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  loading?: boolean
  searchPlaceholder?: string
  searchable?: boolean
  pageSize?: number
  stickyFirst?: boolean
  toolbar?: React.ReactNode
  emptyIcon?: LucideIcon
  emptyTitle?: string
  emptyDescription?: string
  getRowId?: (row: TData, index: number) => string
  onRowClick?: (row: TData) => void
}) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = React.useState("")
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, rowSelection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId,
    initialState: { pagination: { pageSize } },
  })

  const rows = table.getRowModel().rows
  const filteredCount = table.getFilteredRowModel().rows.length
  const { pageIndex, pageSize: currentSize } = table.getState().pagination
  const firstRow = filteredCount === 0 ? 0 : pageIndex * currentSize + 1
  const lastRow = Math.min((pageIndex + 1) * currentSize, filteredCount)
  const selectedCount = Object.keys(rowSelection).length

  // Sticky cells need an opaque background of their own, or the scrolled
  // content shows through them.
  const stickyCell = (index: number, background: string) =>
    stickyFirst && index === 0 ? cn("sticky left-0 z-10", background) : undefined

  return (
    <div className="space-y-3">
      {(searchable || toolbar) && (
        <div className="flex flex-wrap items-center gap-2">
          {searchable && (
            <Input
              value={globalFilter}
              onChange={(event) => setGlobalFilter(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 max-w-xs bg-sa-base text-body"
            />
          )}
          {toolbar}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-sa-border bg-sa-surface">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-body">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-sa-border bg-sa-base/40">
                  {headerGroup.headers.map((header, index) => {
                    const sortable = header.column.getCanSort()
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        className={cn(
                          "h-8 px-3 text-left text-[11px] font-semibold uppercase tracking-wider text-sa-dim",
                          stickyCell(index, "bg-[#131f33]"),
                        )}
                      >
                        {header.isPlaceholder ? null : sortable ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex items-center gap-1 transition-colors hover:text-sa-text"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            <HeaderSort state={header.column.getIsSorted()} />
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>

            <tbody>
              {loading &&
                Array.from({ length: SKELETON_ROWS }, (_, row) => (
                  <tr key={`skeleton-${row}`} className="border-b border-sa-border last:border-b-0">
                    {columns.map((_, column) => (
                      <td key={column} className="h-9 px-3">
                        <div
                          className="h-2.5 animate-pulse rounded bg-sa-raised"
                          style={{ width: `${[70, 45, 55, 40, 60][column % 5]}%` }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}

              {!loading &&
                rows.map((row) => {
                  const selected = row.getIsSelected()
                  return (
                    <tr
                      key={row.id}
                      data-state={selected ? "selected" : undefined}
                      onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                      className={cn(
                        "group border-b border-sa-border last:border-b-0",
                        selected
                          ? "bg-sa-blue/5 shadow-[inset_2px_0_0_theme(colors.sa.blue)]"
                          : "hover:bg-sa-raised",
                        onRowClick && "cursor-pointer",
                      )}
                    >
                      {row.getVisibleCells().map((cell, index) => (
                        <td
                          key={cell.id}
                          className={cn(
                            "h-9 px-3 align-middle",
                            stickyCell(
                              index,
                              selected
                                ? "bg-[#1b2c47]"
                                : "bg-sa-surface group-hover:bg-sa-raised",
                            ),
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  )
                })}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-14">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <EmptyIcon className="h-6 w-6 text-sa-disabled" aria-hidden="true" />
                      <p className="text-body font-medium text-sa-muted">{emptyTitle}</p>
                      {emptyDescription && (
                        <p className="max-w-sm text-caption text-sa-dim">{emptyDescription}</p>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sa-border bg-sa-base/40 px-3 py-2">
          <p className="text-caption text-sa-dim">
            {loading ? (
              "Loading…"
            ) : (
              <>
                Showing <span className="tabular text-sa-muted">{firstRow}</span>–
                <span className="tabular text-sa-muted">{lastRow}</span> of{" "}
                <span className="tabular text-sa-muted">{filteredCount}</span>
                {selectedCount > 0 && ` · ${selectedCount} selected`}
              </>
            )}
          </p>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-caption text-sa-dim">
              Rows
              <select
                value={currentSize}
                onChange={(event) => table.setPageSize(Number(event.target.value))}
                className="h-6 rounded-md border border-sa-border-em bg-sa-surface px-1.5 font-mono text-caption text-sa-text"
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>

            <span className="mx-1 h-4 w-px bg-sa-border-em" aria-hidden="true" />

            <button
              type="button"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
              className="flex h-6 w-6 items-center justify-center rounded-md border border-sa-border-em text-sa-muted transition-colors hover:bg-sa-raised hover:text-sa-text disabled:cursor-not-allowed disabled:border-sa-border disabled:text-sa-disabled disabled:hover:bg-transparent"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <span className="tabular text-caption text-sa-muted">
              {pageIndex + 1} / {Math.max(table.getPageCount(), 1)}
            </span>
            <button
              type="button"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
              className="flex h-6 w-6 items-center justify-center rounded-md border border-sa-border-em text-sa-muted transition-colors hover:bg-sa-raised hover:text-sa-text disabled:cursor-not-allowed disabled:border-sa-border disabled:text-sa-disabled disabled:hover:bg-transparent"
            >
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
