"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { dashboardApi, activityApi, healthApi, brainApi } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { IssuesList } from "@/components/dashboard/IssuesList";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users, Plus, RefreshCw, Brain, Zap, Activity, Database,
  Cpu, HardDrive, Server, Globe, CheckCircle2, AlertTriangle,
  BookOpen, Link2, TrendingUp, Sparkles,
} from "lucide-react";
import Link from "next/link";
import { formatRelative, scoreColor, cn } from "@/lib/utils";

// ── Activity level colors ─────────────────────────────────────────
const LEVEL_CONFIG: Record<string, { dot: string; bg: string; text: string }> = {
  info:      { dot: "bg-blue-400",    bg: "bg-blue-50",   text: "text-blue-700" },
  success:   { dot: "bg-green-500",   bg: "bg-green-50",  text: "text-green-700" },
  warning:   { dot: "bg-yellow-500",  bg: "bg-yellow-50", text: "text-yellow-700" },
  discovery: { dot: "bg-purple-500",  bg: "bg-purple-50", text: "text-purple-700" },
  learning:  { dot: "bg-indigo-500",  bg: "bg-indigo-50", text: "text-indigo-700" },
};

const AGENT_ICONS: Record<string, string> = {
  "Brain Agent": "🧠",
  "Alex Brother": "🎯",
  "Blog Idea Agent": "✍️",
  "Backlink Agent": "🔗",
  "Technical SEO Agent": "⚙️",
  "AEO Agent": "🤖",
  "Semantic Agent": "🔬",
  "Reporting Agent": "📊",
};

function HealthBar({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{value}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: () => dashboardApi.overview().then((r) => r.data),
    refetchInterval: 30000,
  });

  const { data: activityData } = useQuery({
    queryKey: ["activity-feed-dashboard"],
    queryFn: () => activityApi.feed({ limit: 15 }).then(r => r.data),
    refetchInterval: 8000,
  });

  const { data: healthData } = useQuery({
    queryKey: ["system-health"],
    queryFn: () => healthApi.system().then(r => r.data),
    refetchInterval: 20000,
  });

  const { data: brainData } = useQuery({
    queryKey: ["brain-status-mini"],
    queryFn: () => brainApi.status().then(r => r.data),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stats = data?.stats || {};
  const sys = healthData?.system || {};
  const queue = healthData?.redis_queue || {};
  const aiEngine = healthData?.ai_engine || {};
  const foodMessages = healthData?.ai_food_messages || [];
  const healthScore = healthData?.health_score ?? 0;
  const events = activityData?.events || [];

  return (
    <div className="flex flex-col h-full">
      <Header
        title="SEO OS Dashboard"
        description="Autonomous AI operating — 24/7"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              refetch();
              qc.invalidateQueries({ queryKey: ["activity-feed-dashboard"] });
              qc.invalidateQueries({ queryKey: ["system-health"] });
            }}>
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
            <Link href="/clients/new">
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> Add Client
              </Button>
            </Link>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* AI Status Bar */}
        <div className="flex items-center gap-3 rounded-xl border bg-gradient-to-r from-indigo-50 to-purple-50 p-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
            <Brain className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-indigo-800">AI Brain Active</span>
              <span className="flex items-center gap-1 text-xs text-indigo-600">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                Intelligence Score: {brainData?.intelligence_score ?? 0}
              </span>
              <span className="text-xs text-indigo-600">·</span>
              <span className="text-xs text-indigo-600">
                {brainData?.stats?.total_knowledge_entries ?? 0} knowledge entries
              </span>
              <span className="text-xs text-indigo-600">·</span>
              <span className="text-xs text-indigo-600">
                {brainData?.stats?.knowledge_vectors ?? 0} vectors
              </span>
            </div>
            {foodMessages.length > 0 && (
              <p className="text-xs text-indigo-500 mt-0.5 truncate">{foodMessages[0]}</p>
            )}
          </div>
          <Link href="/brain">
            <Button variant="outline" size="sm" className="shrink-0 text-indigo-700 border-indigo-200 hover:bg-indigo-100">
              <Sparkles className="h-3.5 w-3.5 mr-1" /> Open Brain
            </Button>
          </Link>
        </div>

        <StatsCards stats={stats} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Live Activity Feed */}
          <div className="lg:col-span-2 rounded-xl border bg-card">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-green-500" />
                <span className="font-semibold text-sm">Live AI Activity</span>
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              </div>
              <Link href="/brain" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                View all →
              </Link>
            </div>
            <div className="divide-y max-h-[460px] overflow-y-auto">
              {events.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-muted-foreground">
                  <Activity className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">No activity yet</p>
                  <p className="text-xs mt-1">Run a brain learning session to start</p>
                </div>
              ) : (
                events.map((event: any) => {
                  const cfg = LEVEL_CONFIG[event.level] ?? LEVEL_CONFIG.info;
                  return (
                    <div key={event.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                      <div className={cn("mt-1.5 h-2 w-2 rounded-full shrink-0", cfg.dot)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-sm">
                            {AGENT_ICONS[event.agent] || "🤖"}
                          </span>
                          <span className="text-xs font-semibold text-muted-foreground">{event.agent}</span>
                          {event.is_milestone && (
                            <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-bold">★ KEY</span>
                          )}
                        </div>
                        <p className="text-sm leading-snug">{event.message}</p>
                        {event.website_domain && (
                          <span className="text-xs text-muted-foreground">{event.website_domain}</span>
                        )}
                      </div>
                      <div className="shrink-0 text-[10px] text-muted-foreground whitespace-nowrap">
                        {event.created_at ? new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* AI Energy Core */}
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Cpu className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold text-sm">AI Energy Core</span>
                <span className={cn(
                  "ml-auto text-xs px-2 py-0.5 rounded-full font-medium",
                  healthScore >= 70 ? "bg-green-50 text-green-700" :
                  healthScore >= 40 ? "bg-yellow-50 text-yellow-700" : "bg-red-50 text-red-700"
                )}>
                  {healthData?.status ?? "checking..."}
                </span>
              </div>

              <div className="space-y-3">
                <HealthBar
                  value={sys.cpu_percent ?? 0}
                  label="CPU"
                  color={sys.cpu_percent > 80 ? "bg-red-500" : sys.cpu_percent > 60 ? "bg-yellow-500" : "bg-green-500"}
                />
                <HealthBar
                  value={sys.ram_percent ?? 0}
                  label="RAM"
                  color={sys.ram_percent > 85 ? "bg-red-500" : sys.ram_percent > 70 ? "bg-yellow-500" : "bg-blue-500"}
                />
                <HealthBar
                  value={sys.disk_percent ?? 0}
                  label="Disk"
                  color={sys.disk_percent > 85 ? "bg-red-500" : "bg-gray-400"}
                />
              </div>

              <div className="mt-4 space-y-2 border-t pt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Server className="h-3 w-3" /> Celery Queue
                  </span>
                  <span className={cn(
                    "font-medium",
                    queue.pressure === "high" ? "text-red-600" : queue.pressure === "medium" ? "text-yellow-600" : "text-green-600"
                  )}>
                    {queue.total_queued ?? 0} tasks
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Brain className="h-3 w-3" /> Ollama AI
                  </span>
                  <span className={cn(
                    "font-medium",
                    aiEngine.status === "running" ? "text-green-600" : "text-red-600"
                  )}>
                    {aiEngine.status === "running" ? `${aiEngine.models_loaded} models` : "offline"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Database className="h-3 w-3" /> Vector DB
                  </span>
                  <span className="font-medium text-green-600">
                    {brainData?.stats?.knowledge_vectors ?? 0} vectors
                  </span>
                </div>
              </div>

              {foodMessages.length > 0 && (
                <div className="mt-3 rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2">
                  <p className="text-xs text-indigo-700">{foodMessages[0]}</p>
                </div>
              )}
            </div>

            {/* Recent Clients */}
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold text-sm">Clients</span>
                </div>
                <Link href="/clients" className="text-xs text-muted-foreground hover:text-foreground">View all →</Link>
              </div>
              {(data?.recent_clients || []).length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-xs text-muted-foreground">No clients yet</p>
                  <Link href="/clients/new">
                    <Button size="sm" className="mt-2 h-7 text-xs">
                      <Plus className="h-3 w-3 mr-1" /> Add Client
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {(data?.recent_clients || []).slice(0, 5).map((client: any) => (
                    <Link key={client.id} href={`/clients/${client.id}`}>
                      <div className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-accent/50 transition-colors cursor-pointer">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-[10px] font-bold text-primary">
                              {client.name[0].toUpperCase()}
                            </span>
                          </div>
                          <span className="text-xs font-medium">{client.name}</span>
                        </div>
                        <span className={cn("text-xs font-bold", scoreColor(client.seo_health_score))}>
                          {client.seo_health_score}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Issues + Quick Actions */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                Critical Issues
              </CardTitle>
            </CardHeader>
            <CardContent>
              <IssuesList issues={data?.top_issues || []} />
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-yellow-500" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { href: "/clients/new", icon: Users, label: "Add Client", color: "text-blue-500" },
                  { href: "/brain", icon: Brain, label: "AI Brain", color: "text-indigo-500" },
                  { href: "/blog-ideas", icon: BookOpen, label: "Blog Ideas", color: "text-green-500" },
                  { href: "/backlinks", icon: Link2, label: "Backlinks", color: "text-orange-500" },
                  { href: "/rankings", icon: TrendingUp, label: "Rankings", color: "text-purple-500" },
                  { href: "/autonomous", icon: Activity, label: "Autonomous", color: "text-cyan-500" },
                ].map(({ href, icon: Icon, label, color }) => (
                  <Link key={href} href={href}>
                    <div className="flex items-center gap-2 rounded-lg border px-3 py-2.5 hover:bg-accent transition-colors cursor-pointer">
                      <Icon className={cn("h-4 w-4 shrink-0", color)} />
                      <span className="text-sm font-medium">{label}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
