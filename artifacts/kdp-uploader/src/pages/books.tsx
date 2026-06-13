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
import { StatusBadge } from "@/components/status-badge";
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
              <TableHead>Global Status</TableHead>
              <TableHead>eBook</TableHead>
              <TableHead>Paperback</TableHead>
              <TableHead>Hardcover</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Loading catalog...
                </TableCell>
              </TableRow>
            ) : filteredBooks?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No books found. Run a scan to discover content.
                </TableCell>
              </TableRow>
            ) : (
              filteredBooks?.map(book => (
                <TableRow key={book.id}>
                  <TableCell className="font-medium">
                    <Link href={`/books/${book.id}`} className="hover:underline hover:text-primary">
                      {book.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(book.discoveredAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={book.status} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={book.ebookStatus || 'pending'} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={book.paperbackStatus || 'pending'} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={book.hardcoverStatus || 'pending'} />
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
