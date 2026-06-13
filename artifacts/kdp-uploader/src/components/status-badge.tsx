import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const s = status.toLowerCase();

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

  return <Badge variant="outline">{status}</Badge>;
}
