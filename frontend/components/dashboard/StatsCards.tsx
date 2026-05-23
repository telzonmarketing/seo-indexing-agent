import { Users, Globe, AlertTriangle, CheckSquare, Activity, TrendingUp } from "lucide-react";

interface Stat {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
  trend?: string;
}

interface StatsCardsProps {
  stats: {
    total_clients: number;
    total_websites: number;
    open_tasks: number;
    critical_issues: number;
    recent_crawls: number;
    avg_seo_score: number;
  };
}

export function StatsCards({ stats }: StatsCardsProps) {
  const items: Stat[] = [
    {
      label: "Active Clients",
      value: stats.total_clients,
      icon: <Users className="h-5 w-5 text-blue-500" />,
      description: "Managed accounts",
    },
    {
      label: "Websites",
      value: stats.total_websites,
      icon: <Globe className="h-5 w-5 text-green-500" />,
      description: "Under monitoring",
    },
    {
      label: "Critical Issues",
      value: stats.critical_issues,
      icon: <AlertTriangle className="h-5 w-5 text-red-500" />,
      description: "Need immediate fix",
    },
    {
      label: "Open Tasks",
      value: stats.open_tasks,
      icon: <CheckSquare className="h-5 w-5 text-orange-500" />,
      description: "Pending action",
    },
    {
      label: "Crawls (30d)",
      value: stats.recent_crawls,
      icon: <Activity className="h-5 w-5 text-purple-500" />,
      description: "Completed crawls",
    },
    {
      label: "Avg SEO Score",
      value: `${stats.avg_seo_score}/100`,
      icon: <TrendingUp className="h-5 w-5 text-teal-500" />,
      description: "Across all websites",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            {item.icon}
          </div>
          <div className="text-2xl font-bold">{item.value}</div>
          <div className="text-xs font-medium mt-0.5">{item.label}</div>
          {item.description && (
            <div className="text-xs text-muted-foreground mt-0.5">{item.description}</div>
          )}
        </div>
      ))}
    </div>
  );
}
