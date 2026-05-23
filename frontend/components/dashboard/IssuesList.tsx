import { cn, severityColor, truncate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";

interface Issue {
  id: string;
  title: string;
  severity: string;
  page_url: string;
  impact_score: number;
}

const SeverityIcon = ({ severity }: { severity: string }) => {
  if (severity === "critical") return <AlertTriangle className="h-4 w-4 text-red-500" />;
  if (severity === "high") return <AlertCircle className="h-4 w-4 text-orange-500" />;
  return <Info className="h-4 w-4 text-yellow-500" />;
};

export function IssuesList({ issues }: { issues: Issue[] }) {
  if (!issues.length) {
    return (
      <div className="py-8 text-center text-muted-foreground text-sm">
        No open issues found
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {issues.map((issue) => (
        <div key={issue.id} className="flex items-start gap-3 rounded-lg border p-3 hover:bg-accent/50 transition-colors">
          <SeverityIcon severity={issue.severity} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{issue.title}</p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{issue.page_url}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">Impact: {issue.impact_score}</span>
            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full capitalize", severityColor(issue.severity))}>
              {issue.severity}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
