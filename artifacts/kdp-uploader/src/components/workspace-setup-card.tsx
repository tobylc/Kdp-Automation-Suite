import { useState } from "react";
import { useGetSetupStatus, usePrepareWorkspace, getGetSetupStatusQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, Terminal, RefreshCw, AlertTriangle } from "lucide-react";

// ─── Individual status row ────────────────────────────────────────────────────

function StatusRow({ label, ok, loading }: { label: string; ok: boolean; loading: boolean }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
      ) : ok ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-red-400 shrink-0" />
      )}
      <span className={`text-sm ${ok ? "text-foreground" : "text-muted-foreground"}`}>
        {label}
      </span>
    </div>
  );
}

// ─── Step result row (shown after prepare runs) ───────────────────────────────

function StepRow({ name, status, message }: { name: string; status: string; message: string }) {
  return (
    <div className="flex items-start gap-3 py-1.5 text-sm">
      {status === "ok" ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
      ) : status === "error" ? (
        <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
      ) : (
        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
      )}
      <div>
        <span className="font-medium">{name}</span>
        <p className="text-muted-foreground text-xs mt-0.5">{message}</p>
      </div>
    </div>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────

export function WorkspaceSetupCard() {
  const [prepareResult, setPrepareResult] = useState<{
    steps: Array<{ name: string; status: string; message: string }>;
    isReady: boolean;
    message: string;
  } | null>(null);

  const { data: status, isLoading, refetch, isFetching } = useGetSetupStatus({
    query: { queryKey: getGetSetupStatusQueryKey(), refetchInterval: 4_000 },
  });

  const prepareMutation = usePrepareWorkspace({
    mutation: {
      onSuccess: (data) => {
        setPrepareResult(data);
        refetch();
      },
    },
  });

  // If CDP_ENDPOINT is not set, show a compact "not in local mode" notice
  if (status && !status.localMode) {
    return (
      <Card className="shadow-sm border-dashed border-muted-foreground/30 bg-muted/20">
        <CardContent className="p-4 flex items-center gap-3 text-sm text-muted-foreground">
          <Terminal className="h-4 w-4 shrink-0" />
          <span>
            <strong>Local mode not active.</strong> Set{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">CDP_ENDPOINT=http://localhost:9222</code>{" "}
            in your <code className="text-xs bg-muted px-1 py-0.5 rounded">.env</code> to enable
            one-click workspace setup.
          </span>
        </CardContent>
      </Card>
    );
  }

  const isReady = status?.isReady ?? false;
  const isPreparing = prepareMutation.isPending;

  return (
    <Card
      className={`shadow-sm transition-colors ${
        isReady
          ? "border-emerald-200 bg-emerald-50/40"
          : "border-amber-200 bg-amber-50/30"
      }`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Local Workspace
            {isReady && (
              <span className="text-xs font-normal text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                Ready
              </span>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {/* Status checklist */}
        <div className="divide-y divide-border/50">
          <StatusRow
            label="Chrome running with remote debugging"
            ok={status?.chromeCdpAvailable ?? false}
            loading={isLoading}
          />
          <StatusRow
            label="KDP Bookshelf tab open"
            ok={status?.kdpTabOpen ?? false}
            loading={isLoading}
          />
          <StatusRow
            label="Logged in to Amazon KDP"
            ok={status?.kdpLoggedIn ?? false}
            loading={isLoading}
          />
          <StatusRow
            label="My Study Guides tab open"
            ok={status?.studyGuidesTabOpen ?? false}
            loading={isLoading}
          />
        </div>

        {/* Step results (shown after Prepare runs) */}
        {prepareResult && (
          <div className="rounded-md border bg-background/60 p-3 space-y-0.5">
            {prepareResult.steps.map((step, i) => (
              <StepRow key={i} {...step} />
            ))}
            <p
              className={`text-xs mt-2 pt-2 border-t ${
                prepareResult.isReady ? "text-emerald-600" : "text-amber-700"
              }`}
            >
              {prepareResult.message}
            </p>
          </div>
        )}

        {/* Action button */}
        {!isReady && (
          <Button
            onClick={() => {
              setPrepareResult(null);
              prepareMutation.mutate();
            }}
            disabled={isPreparing}
            className="w-full font-mono text-sm"
            size="sm"
          >
            {isPreparing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Preparing workspace…
              </>
            ) : (
              <>
                <Terminal className="mr-2 h-4 w-4" />
                PREPARE_WORKSPACE
              </>
            )}
          </Button>
        )}

        {isReady && !prepareResult && (
          <p className="text-xs text-emerald-600 text-center">
            All prerequisites met — automation is ready to run.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
