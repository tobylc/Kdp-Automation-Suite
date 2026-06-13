import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  useGetStats,
  useListJobs,
  useScanForBooks,
  useRunAllJobs,
  useGetSchedule,
  useScanKdpBookshelf,
  getGetStatsQueryKey,
  getListJobsQueryKey,
  getListBooksQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { FormatBadge } from "@/components/format-badge";
import { StatusBadge } from "@/components/status-badge";
import { WorkspaceSetupCard } from "@/components/workspace-setup-card";
import { RefreshCw, Play, Library, CheckCircle2, Clock, AlertTriangle, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: stats } = useGetStats({
    query: { refetchInterval: 5000 }
  });

  const { data: schedule } = useGetSchedule();

  const hasRunningJobs = stats?.jobsRunning ? stats.jobsRunning > 0 : false;
  
  const { data: recentJobs } = useListJobs(
    { limit: 10 },
    { query: { refetchInterval: hasRunningJobs ? 2000 : false } }
  );

  const scanMutation = useScanForBooks({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Scan Complete", description: data.message });
        queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListBooksQueryKey() });
      },
      onError: (error) => {
        toast({ title: "Scan Failed", description: (error as any).error ?? "Scan failed", variant: "destructive" });
      }
    }
  });

  const bookshelfScanMutation = useScanKdpBookshelf({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "KDP Bookshelf Scanned", description: data.message });
        queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListBooksQueryKey() });
      },
      onError: (error) => {
        toast({ title: "Bookshelf Scan Failed", description: (error as any).error ?? "Scan failed", variant: "destructive" });
      }
    }
  });

  const runAllMutation = useRunAllJobs({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Jobs Queued", description: data.message });
        queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
      }
    }
  });

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto w-full flex flex-col gap-8">

      <WorkspaceSetupCard />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mission Control</h1>
          <p className="text-muted-foreground mt-1">Real-time KDP upload automation status</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {schedule && (
            <Badge variant="outline" className="h-9 px-3 gap-2 border-border text-sm font-normal">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Schedule: {schedule.enabled
                ? <span className="text-green-600 font-medium">Active</span>
                : <span className="text-muted-foreground">Disabled</span>}
            </Badge>
          )}
          <Button
            variant="outline"
            onClick={() => bookshelfScanMutation.mutate()}
            disabled={bookshelfScanMutation.isPending}
            className="font-mono text-sm border-emerald-300 text-emerald-700 hover:bg-emerald-50"
          >
            <Sparkles className={`mr-2 h-4 w-4 ${bookshelfScanMutation.isPending ? 'animate-pulse' : ''}`} />
            KDP_SHELF
          </Button>
          <Button
            variant="outline"
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
            className="font-mono text-sm"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${scanMutation.isPending ? 'animate-spin' : ''}`} />
            SCAN_NOW
          </Button>
          <Button
            onClick={() => runAllMutation.mutate()}
            disabled={runAllMutation.isPending || stats?.jobsPending === 0}
            className="font-mono text-sm bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Play className="mr-2 h-4 w-4" />
            RUN_ALL
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Books</CardTitle>
            <Library className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.totalBooks || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.booksReady || 0} ready to process
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-emerald-200 bg-emerald-50/40">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-emerald-700">Live on KDP</CardTitle>
            <Sparkles className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-700">{stats?.booksLiveOnKdp || 0}</div>
            <p className="text-xs text-emerald-600 mt-1">
              All 3 formats confirmed live
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Jobs</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.jobsPending || 0}</div>
            <p className="text-xs text-muted-foreground mt-1 text-blue-600">
              {stats?.jobsRunning || 0} running now
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.jobsCompleted || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Successful uploads</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Failed</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.jobsFailed || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Require attention</p>
          </CardContent>
        </Card>
      </div>

      {stats?.lastBookshelfScanAt && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3 text-emerald-500" />
          KDP bookshelf last scanned {formatDistanceToNow(new Date(stats.lastBookshelfScanAt), { addSuffix: true })}
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Recent Activity</h2>
          <Button variant="link" asChild className="text-primary px-0">
            <Link href="/jobs">View all jobs</Link>
          </Button>
        </div>
        
        <Card className="shadow-sm border overflow-hidden">
          <div className="divide-y">
            {recentJobs?.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No recent jobs found.</div>
            ) : (
              recentJobs?.map(job => (
                <div key={job.id} className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-24">
                      <StatusBadge status={job.status} />
                    </div>
                    <div>
                      <div className="font-medium text-sm">
                        <Link href={`/books/${job.bookId}`} className="hover:underline">
                          {job.bookTitle}
                        </Link>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <FormatBadge format={job.format} />
                        <span className="text-xs text-muted-foreground font-mono">
                          ID:{job.id}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          • {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/books/${job.bookId}`}>View</Link>
                  </Button>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
