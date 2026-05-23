import { cn, scoreColor } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

interface ScoreCardProps {
  label: string;
  score: number;
  description?: string;
  icon?: React.ReactNode;
}

export function ScoreCard({ label, score, description, icon }: ScoreCardProps) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        {icon}
      </div>
      <div className={cn("text-3xl font-bold mb-2", scoreColor(score))}>
        {score}<span className="text-lg text-muted-foreground">/100</span>
      </div>
      <Progress value={score} className="h-2 mb-2" />
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}
