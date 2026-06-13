import { Badge } from "@/components/ui/badge";

export function FormatBadge({ format }: { format: string | null | undefined }) {
  if (!format) return null;
  const f = format.toLowerCase();
  
  if (f === "ebook") {
    return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">eBook</Badge>;
  }
  if (f === "paperback") {
    return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Paperback</Badge>;
  }
  if (f === "hardcover") {
    return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Hardcover</Badge>;
  }
  
  return <Badge variant="outline">{format}</Badge>;
}
