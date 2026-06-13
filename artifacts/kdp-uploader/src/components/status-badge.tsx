import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const s = status.toLowerCase();

  // ── Upload job statuses ──────────────────────────────────────────────────────
  if (s === "pending") {
    return <Badge variant="secondary" className="text-gray-500">Pending</Badge>;
  }
  if (s === "running") {
    return (
      <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 relative">
        <span className="absolute -left-1 top-1/2 -translate-y-1/2 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
        </span>
        <span className="ml-2">Running</span>
      </Badge>
    );
  }
  if (s === "completed") {
    return <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">Completed</Badge>;
  }
  if (s === "failed") {
    return <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">Failed</Badge>;
  }

  // ── Book-level statuses ──────────────────────────────────────────────────────
  if (s === "discovered") {
    return <Badge variant="secondary" className="text-gray-500">Discovered</Badge>;
  }
  if (s === "downloading") {
    return <Badge variant="outline" className="border-yellow-200 bg-yellow-50 text-yellow-700">Downloading</Badge>;
  }
  if (s === "ready") {
    return <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700">Ready</Badge>;
  }
  if (s === "uploading") {
    return <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">Uploading</Badge>;
  }
  if (s === "partial") {
    return <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Partial</Badge>;
  }
  if (s === "live") {
    return (
      <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 font-semibold">
        ✦ Live
      </Badge>
    );
  }

  // ── KDP Bookshelf per-format statuses ────────────────────────────────────────
  if (s === "live" || s === "kdp_live") {
    return (
      <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 font-semibold">
        ✦ Live
      </Badge>
    );
  }
  if (s === "in_review") {
    return <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">In Review</Badge>;
  }
  if (s === "publishing") {
    return <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">Publishing</Badge>;
  }
  if (s === "draft") {
    return <Badge variant="secondary" className="text-gray-400">Draft</Badge>;
  }
  if (s === "blocked") {
    return <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">Blocked</Badge>;
  }
  if (s === "not_created") {
    return <Badge variant="secondary" className="text-gray-300">—</Badge>;
  }

  return <Badge variant="outline">{status}</Badge>;
}

/** Small pill used inside the KDP status column to show per-format KDP bookshelf status. */
export function KdpStatusPill({ status }: { status: string | null | undefined }) {
  if (!status || status === "not_created") {
    return <span className="text-xs text-gray-300 font-mono">—</span>;
  }
  const s = status.toLowerCase();

  if (s === "live") {
    return <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">✦ Live</span>;
  }
  if (s === "in_review") {
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600">⏳ Review</span>;
  }
  if (s === "publishing") {
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-600">↑ Publishing</span>;
  }
  if (s === "draft") {
    return <span className="inline-flex items-center gap-1 text-xs text-gray-400">Draft</span>;
  }
  if (s === "blocked") {
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">✕ Blocked</span>;
  }

  return <span className="text-xs text-gray-500">{status}</span>;
}
