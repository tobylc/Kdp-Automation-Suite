import { useState } from "react";
import { useGetSetupStatus, usePrepareWorkspace, getGetSetupStatusQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, Terminal, RefreshCw, AlertTriangle, Copy, Check, Download } from "lucide-react";

// ─── Copy-to-clipboard helper ─────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="inline-flex items-center gap-1 ml-2 px-1.5 py-0.5 rounded text-xs bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ─── Status row ───────────────────────────────────────────────────────────────

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
      <span className={`text-sm ${ok ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
    </div>
  );
}

// ─── Step result row ──────────────────────────────────────────────────────────

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

// ─── "Not in local mode" panel ────────────────────────────────────────────────

function LocalSetupGuide() {
  const downloadUrl = `${window.location.origin}/api/setup/start.sh`;

  return (
    <Card className="shadow-sm border-blue-200 bg-blue-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Terminal className="h-4 w-4 text-blue-600" />
          Run Automation on Your Mac
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-4 text-sm">
        <p className="text-muted-foreground">
          This dashboard is your control panel. To actually upload books to KDP, the automation
          needs to run on your local Mac — where your Chrome session and Amazon login live.
        </p>

        {/* Step 1 */}
        <div className="space-y-1.5">
          <p className="font-medium text-foreground">Step 1 — Download the project</p>
          <p className="text-muted-foreground text-xs">
            In this Replit editor: click the <strong>three-dot menu (⋯)</strong> at the top of the
            file panel → <strong>Download as ZIP</strong> → unzip it on your Mac.
          </p>
        </div>

        {/* Step 2 */}
        <div className="space-y-1.5">
          <p className="font-medium text-foreground">Step 2 — Open Terminal and run one command</p>
          <p className="text-muted-foreground text-xs mb-2">
            Drag the unzipped folder into Terminal to navigate to it, then run:
          </p>
          <div className="flex items-center bg-zinc-900 text-green-400 rounded-md px-3 py-2 font-mono text-xs">
            <span className="flex-1 select-all">./start.sh</span>
            <CopyButton text="./start.sh" />
          </div>
          <p className="text-muted-foreground text-xs">
            The script installs everything, creates your config file (it will ask for your
            database URL and Anthropic API key once), opens Chrome, and launches the app.
          </p>
        </div>

        {/* Step 3 */}
        <div className="space-y-1.5">
          <p className="font-medium text-foreground">Step 3 — Log in to Amazon KDP</p>
          <p className="text-muted-foreground text-xs">
            A Chrome window opens automatically. Sign into your KDP account there — the
            automation will reuse that session for all uploads.
          </p>
        </div>

        <div className="pt-1 border-t flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            After starting, open <strong>http://localhost:3000</strong> for the local dashboard.
          </p>
          <a href={downloadUrl} download="start.sh">
            <Button variant="outline" size="sm" className="gap-2 text-xs">
              <Download className="h-3.5 w-3.5" />
              Download start.sh
            </Button>
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main card (local mode active) ───────────────────────────────────────────

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

  // Show the local setup guide when CDP_ENDPOINT is not configured
  if (status && !status.localMode) {
    return <LocalSetupGuide />;
  }

  const isReady = status?.isReady ?? false;
  const isPreparing = prepareMutation.isPending;

  return (
    <Card
      className={`shadow-sm transition-colors ${
        isReady ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/30"
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
