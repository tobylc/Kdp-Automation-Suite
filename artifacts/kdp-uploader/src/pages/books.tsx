import { useListBooks } from "@workspace/api-client-react";
import { Link } from "wouter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge, KdpStatusPill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";

export default function BooksPage() {
  const [search, setSearch] = useState("");
  const { data: books, isLoading } = useListBooks();

  const filteredBooks = books?.filter(b =>
    b.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto w-full flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Catalog</h1>
          <p className="text-muted-foreground mt-1">All discovered manuscripts and assets</p>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-card p-2 rounded-md border shadow-sm max-w-md">
        <Search className="h-4 w-4 text-muted-foreground ml-2" />
        <Input
          placeholder="Search by title..."
          className="border-0 shadow-none focus-visible:ring-0 px-2 h-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="border rounded-md shadow-sm bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Discovered</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upload Jobs</span>
                <div className="flex gap-3 mt-0.5 text-xs font-normal text-muted-foreground">
                  <span>eBook</span>
                  <span>PB</span>
                  <span>HC</span>
                </div>
              </TableHead>
              <TableHead>
                <span className="text-xs font-semibold uppercase tracking-wide text-emerald-600">KDP Live</span>
                <div className="flex gap-3 mt-0.5 text-xs font-normal text-muted-foreground">
                  <span>eBook</span>
                  <span>PB</span>
                  <span>HC</span>
                </div>
              </TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Loading catalog...
                </TableCell>
              </TableRow>
            ) : filteredBooks?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No books found. Run a scan to discover content.
                </TableCell>
              </TableRow>
            ) : (
              filteredBooks?.map(book => (
                <TableRow
                  key={book.id}
                  className={book.status === "live" ? "bg-emerald-50/30" : undefined}
                >
                  <TableCell className="font-medium max-w-xs">
                    <Link href={`/books/${book.id}`} className="hover:underline hover:text-primary">
                      {book.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {format(new Date(book.discoveredAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={book.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={book.ebookStatus || "pending"} />
                      <StatusBadge status={book.paperbackStatus || "pending"} />
                      <StatusBadge status={book.hardcoverStatus || "pending"} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-4">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[10px] text-muted-foreground">eBook</span>
                        <KdpStatusPill status={book.ebookKdpStatus} />
                      </div>
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[10px] text-muted-foreground">PB</span>
                        <KdpStatusPill status={book.paperbackKdpStatus} />
                      </div>
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[10px] text-muted-foreground">HC</span>
                        <KdpStatusPill status={book.hardcoverKdpStatus} />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/books/${book.id}`}>Details</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
