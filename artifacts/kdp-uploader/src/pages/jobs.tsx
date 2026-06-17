import { useState } from "react";
import { useListJobs } from "@workspace/api-client-react";
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
import { FormatBadge } from "@/components/format-badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDistanceToNow, format } from "date-fns";

export default function JobsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [formatFilter, setFormatFilter] = useState<string>("all");

  const queryParams: any = {};
  if (statusFilter !== "all") queryParams.status = statusFilter;
  if (formatFilter !== "all") queryParams.format = formatFilter;

  const { data: jobs, isLoading } = useListJobs(queryParams, {
    query: { refetchInterval: 3000 } as any
  });

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto w-full flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Job Monitor</h1>
          <p className="text-muted-foreground mt-1">Global view of all browser automation jobs</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 bg-card p-3 rounded-md border shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Status:</span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-8 text-sm">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Format:</span>
          <Select value={formatFilter} onValueChange={setFormatFilter}>
            <SelectTrigger className="w-[140px] h-8 text-sm">
              <SelectValue placeholder="All Formats" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Formats</SelectItem>
              <SelectItem value="ebook">eBook</SelectItem>
              <SelectItem value="paperback">Paperback</SelectItem>
              <SelectItem value="hardcover">Hardcover</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border rounded-md shadow-sm bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[100px]">Job ID</TableHead>
              <TableHead>Book Title</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Loading jobs...
                </TableCell>
              </TableRow>
            ) : jobs?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No jobs found matching criteria.
                </TableCell>
              </TableRow>
            ) : (
              jobs?.map(job => (
                <TableRow key={job.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    #{job.id}
                  </TableCell>
                  <TableCell className="font-medium max-w-[300px] truncate">
                    <Link href={`/books/${job.bookId}`} className="hover:underline hover:text-primary">
                      {job.bookTitle}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <FormatBadge format={job.format} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={job.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(job.createdAt), "MMM d, HH:mm")}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground font-mono">
                    {job.startedAt && job.completedAt ? (
                       <span>
                         {Math.round((new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000)}s
                       </span>
                    ) : job.startedAt ? (
                       <span className="text-blue-500 animate-pulse">Running...</span>
                    ) : (
                       <span>-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/books/${job.bookId}`}>View Log</Link>
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
