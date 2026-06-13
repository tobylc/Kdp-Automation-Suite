import { useRoute } from "wouter";
import { useGetBook, useRunJob, getGetBookQueryKey, getGetStatsQueryKey, getListJobsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { FormatBadge } from "@/components/format-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, ExternalLink, FileText, Image as ImageIcon, Play, FileJson, Calendar } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { UploadJobDetail } from "@workspace/api-client-react/src/generated/api.schemas";

export default function BookDetailPage() {
  const [, params] = useRoute("/books/:id");
  const id = Number(params?.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: book, isLoading } = useGetBook(id, {
    query: { enabled: !!id, refetchInterval: 3000 } // Poll to keep jobs updated
  });

  const runJobMutation = useRunJob({
    mutation: {
      onSuccess: () => {
        toast({ title: "Job Started", description: "The upload job has been queued." });
        queryClient.invalidateQueries({ queryKey: getGetBookQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Error", description: err.error, variant: "destructive" });
      }
    }
  });

  if (isLoading) {
    return <div className="p-10 flex justify-center text-muted-foreground">Loading book details...</div>;
  }

  if (!book) {
    return <div className="p-10 flex justify-center text-muted-foreground">Book not found.</div>;
  }

  // Pre-fill missing formats so all 3 show up even if no job exists yet
  const formats = ['ebook', 'paperback', 'hardcover'] as const;
  
  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto w-full flex flex-col gap-6">
      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
        <Link href="/books" className="hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to Catalog
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{book.title}</h1>
          <div className="flex items-center gap-3 mt-3">
            <StatusBadge status={book.status} />
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Calendar className="h-4 w-4" /> Discovered {format(new Date(book.discoveredAt), "MMM d, yyyy")}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
        <Card className="md:col-span-2 shadow-sm border">
          <CardHeader>
            <CardTitle>Asset Inventory</CardTitle>
            <CardDescription>Source files downloaded for this title</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {book.sourceUrl && (
              <a href={book.sourceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 rounded-md border bg-muted/30 hover:bg-muted/50 transition-colors">
                <ExternalLink className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1 overflow-hidden">
                  <div className="font-medium text-sm">Source Post</div>
                  <div className="text-xs text-muted-foreground truncate">{book.sourceUrl}</div>
                </div>
              </a>
            )}
            {book.manuscriptUrl && (
              <a href={book.manuscriptUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 rounded-md border bg-muted/30 hover:bg-muted/50 transition-colors">
                <FileText className="h-5 w-5 text-blue-500" />
                <div className="flex-1 overflow-hidden">
                  <div className="font-medium text-sm">Manuscript (.docx)</div>
                  <div className="text-xs text-muted-foreground truncate">{book.manuscriptUrl}</div>
                </div>
              </a>
            )}
            {book.kdpContentUrl && (
              <a href={book.kdpContentUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 rounded-md border bg-muted/30 hover:bg-muted/50 transition-colors">
                <FileJson className="h-5 w-5 text-amber-500" />
                <div className="flex-1 overflow-hidden">
                  <div className="font-medium text-sm">KDP Metadata (.json)</div>
                  <div className="text-xs text-muted-foreground truncate">{book.kdpContentUrl}</div>
                </div>
              </a>
            )}
            <div className="grid grid-cols-2 gap-3 mt-2">
              {book.coverJpgUrl && (
                <a href={book.coverJpgUrl} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-2 p-4 rounded-md border bg-muted/30 hover:bg-muted/50 transition-colors text-center">
                  <ImageIcon className="h-8 w-8 text-green-500" />
                  <div className="font-medium text-sm">eBook Cover (.jpg)</div>
                </a>
              )}
              {book.coverPngUrl && (
                <a href={book.coverPngUrl} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-2 p-4 rounded-md border bg-muted/30 hover:bg-muted/50 transition-colors text-center">
                  <ImageIcon className="h-8 w-8 text-green-600" />
                  <div className="font-medium text-sm">Print Cover (.png)</div>
                </a>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-tight">Upload Formats</h2>
          {formats.map(f => {
            const job = book.jobs.find(j => j.format === f);
            return <JobCard key={f} format={f} job={job} onRun={() => {
              if (job) runJobMutation.mutate({ id: job.id });
            }} isRunning={runJobMutation.isPending} />
          })}
        </div>
      </div>
    </div>
  );
}

function JobCard({ format, job, onRun, isRunning }: { format: string, job?: UploadJobDetail, onRun: () => void, isRunning: boolean }) {
  const lastLog = job?.logs && job.logs.length > 0 ? job.logs[0] : null;

  return (
    <Card className={`shadow-sm border relative overflow-hidden ${job?.status === 'running' ? 'border-blue-300 shadow-blue-100' : ''}`}>
      {job?.status === 'running' && (
        <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 animate-pulse" />
      )}
      <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
        <FormatBadge format={format} />
        <StatusBadge status={job?.status || 'pending'} />
      </CardHeader>
      <CardContent className="p-4 pt-2 flex flex-col gap-3">
        {job ? (
          <>
            {lastLog ? (
              <div className="bg-muted p-2 rounded-md text-xs font-mono break-words border">
                <span className={`font-semibold mr-2 ${
                  lastLog.level === 'error' ? 'text-red-500' : 
                  lastLog.level === 'success' ? 'text-green-500' : 
                  lastLog.level === 'warn' ? 'text-amber-500' : 'text-blue-500'
                }`}>
                  [{lastLog.level.toUpperCase()}]
                </span>
                {lastLog.message}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground text-center py-2">No logs yet</div>
            )}
            
            {job.errorMessage && (
              <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100">
                {job.errorMessage}
              </div>
            )}

            <Button 
              size="sm" 
              variant="outline" 
              className="w-full mt-1 font-mono"
              onClick={onRun}
              disabled={isRunning || job.status === 'running'}
            >
              <Play className="h-3 w-3 mr-2" /> 
              {job.status === 'running' ? 'RUNNING...' : job.status === 'failed' ? 'RETRY_JOB' : 'RUN_JOB'}
            </Button>
          </>
        ) : (
           <div className="text-center py-4">
             <div className="text-xs text-muted-foreground mb-3">Job not generated yet</div>
           </div>
        )}
      </CardContent>
    </Card>
  )
}
