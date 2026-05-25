"use client";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clientsApi, alertsApi, crawlsApi } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Globe, RefreshCw, Plus, Play, ExternalLink,
  Bell, BotMessageSquare, Lightbulb, Link2, TrendingUp,
  TrendingDown, Minus, AlertCircle, CheckCircle2, Zap,
  BarChart3, FileSpreadsheet, Folder, Clock, Target,
  ChevronRight, Shield, Activity, Search,
} from "lucide-react";
import Link from "next/link";
import { cn, scoreColor, formatRelative } from "@/lib/utils";
import toast from "react-hot-toast";
import { useState } from "react";

type Tab = "overview" | "websites" | "tasks" | "blog-ideas" | "backlinks" | "rankings" | "alerts" | "workspace";

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "websites", label: "Websites", icon: Globe },
  { id: "tasks", label: "Tasks", icon: Target },
  { id: "blog-ideas", label: "Blog Ideas", icon: Lightbulb },
  { id: "backlinks", label: "Backlinks", icon: Link2 },
  { id: "rankings", label: "Rankings", icon: TrendingUp },
  { id: "alerts", label: "Alerts", icon: Bell },
  { id: "workspace", label: "Workspace", icon: Folder },
];

const BOT_MODE_COLORS: Record<string, string> = {
  fully_automated: "bg-green-100 text-green-800 border-green-200",
  partial_automation: "bg-blue-100 text-blue-800 border-blue-200",
  recommendation_only: "bg-orange-100 text-orange-800 border-orange-200",
};

const BOT_MODE_LABELS: Record<string, string> = {
  fully_automated: "⚡ Full Auto",
  partial_automation: "🔵 Partial",
  recommendation_only: "📋 Report Only",
};

const CMS_COLORS: Record<string, string> = {
  wordpress: "bg-blue-50 text-blue-700",
  shopify: "bg-green-50 text-green-700",
  nextjs: "bg-gray-900 text-white",
  react: "bg-cyan-50 text-cyan-700",
  webflow: "bg-purple-50 text-purple-700",
  wix: "bg-yellow-50 text-yellow-700",
  custom_html: "bg-slate-50 text-slate-700",
  unknown: "bg-gray-100 text-gray-600",
};

function ScoreBadge({ score, large = false }: { score?: number | null; large?: boolean }) {
  const s = score ?? 0;
  const color = s >= 80 ? "text-green-600" : s >= 60 ? "text-yellow-600" : "text-red-600";
  return (
    <span className={cn("font-bold tabular-nums", color, large ? "text-4xl" : "text-2xl")}>
      {s}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const cls = {
    critical: "bg-red-100 text-red-800",
    high: "bg-orange-100 text-orange-800",
    medium: "bg-yellow-100 text-yellow-800",
    low: "bg-green-100 text-green-800",
  }[priority] ?? "bg-gray-100 text-gray-600";
  return <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", cls)}>{priority}</span>;
}

function SeverityDot({ severity }: { severity: string }) {
  const color = {
    critical: "bg-red-500",
    high: "bg-orange-500",
    medium: "bg-yellow-500",
    low: "bg-blue-400",
    info: "bg-gray-400",
  }[severity] ?? "bg-gray-400";
  return <span className={cn("inline-block w-2 h-2 rounded-full shrink-0", color)} />;
}

export default function ClientDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [showAddWebsite, setShowAddWebsite] = useState(false);

  const { data: dash, isLoading, refetch } = useQuery({
    queryKey: ["client-dashboard", id],
    queryFn: () => clientsApi.dashboard(id).then((r) => r.data),
    refetchInterval: 60_000,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => alertsApi.markAllRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-dashboard", id] });
      toast.success("All alerts marked as read");
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (alertId: string) => alertsApi.markRead(alertId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-dashboard", id] }),
  });

  const seedAlertsMutation = useMutation({
    mutationFn: () => alertsApi.seedDemo(id, dash?.websites?.[0]?.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-dashboard", id] });
      toast.success("Demo alerts created!");
    },
  });

  const crawlMutation = useMutation({
    mutationFn: (websiteId: string) =>
      crawlsApi.start({ website_id: websiteId, max_pages: 200, include_ai_audit: true }),
    onSuccess: () => toast.success("Crawl started!"),
    onError: () => toast.error("Failed to start crawl"),
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!dash) return <div className="p-6 text-muted-foreground">Client not found</div>;

  const { client, summary, websites, tasks, rankings, blog_ideas, backlinks, alerts, recent_ai_actions, workspace, crawl_summaries } = dash;
  const unreadAlerts = alerts?.filter((a: any) => !a.is_read) ?? [];

  return (
    <div className="flex flex-col h-full">
      <Header
        title={client.name}
        description={client.company || client.industry || client.email || "SEO Client"}
        actions={
          <div className="flex gap-2">
            <Link href="/clients">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" /> Clients
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
            <Button size="sm" onClick={() => setShowAddWebsite(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Website
            </Button>
          </div>
        }
      />

      {/* Add Website CTA */}
      {showAddWebsite && (
        <div className="mx-6 mt-4">
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-4 pb-4">
              <p className="font-medium mb-1">Add a website to this client</p>
              <p className="text-sm text-muted-foreground mb-3">Use the onboarding wizard to detect CMS, verify ownership, and set up AI automation.</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => { setShowAddWebsite(false); router.push(`/websites/new?client_id=${id}`); }}>
                  <Globe className="h-4 w-4 mr-1" /> Start Onboarding Wizard
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowAddWebsite(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0 border-b bg-background px-6 pt-4 overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          const badge = t.id === "alerts" && unreadAlerts.length > 0 ? unreadAlerts.length : null;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              {badge && (
                <span className="ml-1 text-xs bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none">{badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* ─── OVERVIEW ─── */}
        {tab === "overview" && (
          <div className="space-y-6">
            {/* KPI strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              {[
                { label: "SEO Score", value: summary.avg_seo_score, color: scoreColor(summary.avg_seo_score), suffix: "/100" },
                { label: "Websites", value: summary.total_websites },
                { label: "Issues", value: summary.total_issues, color: summary.total_issues > 0 ? "text-orange-600" : "text-green-600" },
                { label: "Critical", value: summary.critical_issues, color: summary.critical_issues > 0 ? "text-red-600" : "text-green-600" },
                { label: "Open Tasks", value: summary.open_tasks, color: summary.open_tasks > 0 ? "text-orange-600" : "text-green-600" },
                { label: "Blog Ideas", value: summary.total_blog_ideas, color: "text-blue-600" },
                { label: "Backlinks", value: summary.backlink_opportunities, color: "text-purple-600" },
                { label: "Alerts", value: summary.unread_alerts, color: summary.unread_alerts > 0 ? "text-red-600" : "text-green-600" },
              ].map((kpi) => (
                <Card key={kpi.label} className="text-center">
                  <CardContent className="pt-4 pb-3 px-2">
                    <p className="text-xs text-muted-foreground mb-1">{kpi.label}</p>
                    <p className={cn("text-2xl font-bold", kpi.color ?? "text-foreground")}>
                      {kpi.value ?? 0}{kpi.suffix ?? ""}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Website crawl summaries */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Globe className="h-4 w-4 text-primary" /> Website Snapshots
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {crawl_summaries?.length === 0 && (
                    <p className="text-sm text-muted-foreground py-2">No crawl data yet. Start a crawl from the Websites tab.</p>
                  )}
                  {crawl_summaries?.map((cs: any, i: number) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                      <div>
                        <p className="font-medium">{cs.website}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {cs.pages} pages · {cs.issues} issues · {formatRelative(cs.crawled_at)}
                        </p>
                      </div>
                      <ScoreBadge score={cs.score} />
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Recent AI Actions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BotMessageSquare className="h-4 w-4 text-primary" /> Recent AI Actions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {recent_ai_actions?.length === 0 && (
                    <p className="text-sm text-muted-foreground py-2">No AI actions yet. Run autonomous tasks to see activity here.</p>
                  )}
                  {recent_ai_actions?.map((action: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 rounded-md border p-3 text-sm">
                      <Zap className="h-4 w-4 text-yellow-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{action.title}</p>
                        <p className="text-xs text-muted-foreground">{action.category} · {formatRelative(action.created_at)}</p>
                      </div>
                      <PriorityBadge priority={action.priority} />
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Top Rankings */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" /> Keyword Rankings
                  </CardTitle>
                  <button onClick={() => setTab("rankings")} className="text-xs text-primary hover:underline">View all</button>
                </CardHeader>
                <CardContent>
                  {rankings?.length === 0 && (
                    <p className="text-sm text-muted-foreground py-2">No rankings tracked yet.</p>
                  )}
                  <div className="space-y-2">
                    {rankings?.slice(0, 5).map((r: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="truncate text-muted-foreground flex-1 min-w-0 pr-2">{r.keyword}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-bold">#{r.position}</span>
                          {r.change > 0 && <span className="text-green-600 text-xs flex items-center"><TrendingUp className="h-3 w-3" />+{r.change}</span>}
                          {r.change < 0 && <span className="text-red-600 text-xs flex items-center"><TrendingDown className="h-3 w-3" />{r.change}</span>}
                          {r.change === 0 && <span className="text-gray-400 text-xs"><Minus className="h-3 w-3" /></span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Unread Alerts */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Bell className="h-4 w-4 text-primary" /> Unread Alerts
                    {unreadAlerts.length > 0 && <span className="bg-red-500 text-white text-xs rounded-full px-1.5">{unreadAlerts.length}</span>}
                  </CardTitle>
                  <button onClick={() => setTab("alerts")} className="text-xs text-primary hover:underline">View all</button>
                </CardHeader>
                <CardContent className="space-y-2">
                  {unreadAlerts.length === 0 && (
                    <div className="flex items-center gap-2 text-sm text-green-600 py-2">
                      <CheckCircle2 className="h-4 w-4" /> All clear — no unread alerts
                    </div>
                  )}
                  {unreadAlerts.slice(0, 4).map((a: any) => (
                    <div key={a.id} className="flex items-start gap-2 rounded-md border p-3 text-sm">
                      <SeverityDot severity={a.severity} />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{a.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{a.message}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Client Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Client Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  {client.email && <div><p className="text-muted-foreground text-xs">Email</p><p>{client.email}</p></div>}
                  {client.phone && <div><p className="text-muted-foreground text-xs">Phone</p><p>{client.phone}</p></div>}
                  {client.company && <div><p className="text-muted-foreground text-xs">Company</p><p>{client.company}</p></div>}
                  {client.industry && <div><p className="text-muted-foreground text-xs">Industry</p><p>{client.industry}</p></div>}
                </div>
                {client.tags?.length > 0 && (
                  <div className="flex gap-2 flex-wrap mt-3">
                    {client.tags.map((tag: string) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
                  </div>
                )}
                {client.notes && <p className="mt-3 text-sm text-muted-foreground">{client.notes}</p>}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ─── WEBSITES ─── */}
        {tab === "websites" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{websites?.length ?? 0} website(s) connected</p>
              <Button size="sm" onClick={() => router.push(`/websites/new?client_id=${id}`)}>
                <Plus className="h-4 w-4 mr-1" /> Add Website
              </Button>
            </div>

            {websites?.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <Globe className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="font-medium mb-1">No websites connected</p>
                  <p className="text-sm text-muted-foreground mb-4">Connect a website to start running AI SEO analysis</p>
                  <Button onClick={() => router.push(`/websites/new?client_id=${id}`)}>
                    <Plus className="h-4 w-4 mr-1" /> Connect Website
                  </Button>
                </CardContent>
              </Card>
            )}

            {websites?.map((w: any) => (
              <Card key={w.id} className="hover:border-primary/30 transition-colors">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="mt-0.5">
                        <Globe className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link href={`/websites/${w.id}`} className="font-semibold hover:text-primary truncate">
                            {w.domain}
                          </Link>
                          {w.cms_type && w.cms_type !== "unknown" && (
                            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", CMS_COLORS[w.cms_type] ?? CMS_COLORS.unknown)}>
                              {w.framework_detected || w.cms_type}
                            </span>
                          )}
                          <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", BOT_MODE_COLORS[w.bot_mode] ?? BOT_MODE_COLORS.recommendation_only)}>
                            {BOT_MODE_LABELS[w.bot_mode] ?? w.bot_mode}
                          </span>
                          {w.is_verified && (
                            <span className="text-xs text-green-600 flex items-center gap-1">
                              <Shield className="h-3 w-3" /> Verified
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground flex-wrap">
                          {w.hosting_provider && <span>🖥 {w.hosting_provider}</span>}
                          {w.has_ssl && <span className="text-green-600">🔒 SSL</span>}
                          {w.has_sitemap && <span className="text-green-600">🗺 Sitemap</span>}
                          {w.has_schema && <span className="text-green-600">📐 Schema</span>}
                          {w.has_analytics && <span className="text-green-600">📊 Analytics</span>}
                          {w.last_crawled_at && <span>Last crawled: {formatRelative(w.last_crawled_at)}</span>}
                        </div>
                        {!w.onboarding_complete && (
                          <div className="mt-2">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full" style={{ width: `${(w.onboarding_step / 6) * 100}%` }} />
                              </div>
                              <span className="text-xs text-muted-foreground">Step {w.onboarding_step}/6</span>
                              <Link href={`/websites/new?website_id=${w.id}&step=${w.onboarding_step + 1}`} className="text-xs text-primary hover:underline">
                                Continue setup
                              </Link>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {/* Scores */}
                      <div className="text-center hidden md:block">
                        <p className="text-xs text-muted-foreground">Tech</p>
                        <ScoreBadge score={w.technical_score} />
                      </div>
                      <div className="text-center hidden md:block">
                        <p className="text-xs text-muted-foreground">Content</p>
                        <ScoreBadge score={w.content_score} />
                      </div>
                      <div className="text-center hidden md:block">
                        <p className="text-xs text-muted-foreground">AEO</p>
                        <ScoreBadge score={w.aeo_score} />
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => crawlMutation.mutate(w.id)}
                        disabled={crawlMutation.isPending}
                      >
                        <Play className="h-3.5 w-3.5 mr-1" /> Crawl
                      </Button>
                      <Link href={`/websites/${w.id}`}>
                        <Button size="sm" variant="ghost">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ─── TASKS ─── */}
        {tab === "tasks" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {summary.open_tasks} open · {summary.critical_tasks} critical · {summary.ai_tasks} AI-generated
              </p>
              <Link href={`/tasks?client_id=${id}`}>
                <Button variant="outline" size="sm">View all tasks</Button>
              </Link>
            </div>
            {tasks?.length === 0 && (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  <Target className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No tasks yet. Run an AI audit to generate tasks automatically.</p>
                </CardContent>
              </Card>
            )}
            {tasks?.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg border p-4 bg-card hover:bg-accent/20 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  {t.ai_generated && <span title="AI Generated"><Zap className="h-4 w-4 text-yellow-500 shrink-0" /></span>}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{t.title}</p>
                    {t.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{t.description}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      <PriorityBadge priority={t.priority} />
                      {t.category && <span className="text-xs text-muted-foreground">{t.category}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className={cn("text-xs px-2 py-0.5 rounded-full", {
                    "bg-green-100 text-green-800": t.status === "done",
                    "bg-blue-100 text-blue-800": t.status === "in_progress",
                    "bg-gray-100 text-gray-700": t.status === "todo",
                  })}>{t.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── BLOG IDEAS ─── */}
        {tab === "blog-ideas" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{blog_ideas?.length ?? 0} blog ideas generated by AI</p>
              <Link href="/blog-ideas">
                <Button variant="outline" size="sm">Manage all</Button>
              </Link>
            </div>
            {blog_ideas?.length === 0 && (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  <Lightbulb className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No blog ideas yet. The AI will generate ideas daily based on trends and competitor analysis.</p>
                </CardContent>
              </Card>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {blog_ideas?.map((idea: any) => (
                <Card key={idea.id} className="hover:border-primary/30 transition-colors">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm leading-snug">{idea.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">🔑 {idea.target_keyword}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {idea.search_intent && (
                            <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{idea.search_intent}</span>
                          )}
                          {idea.is_ai_friendly && (
                            <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">🤖 AI-friendly</span>
                          )}
                          <span className={cn("text-xs px-2 py-0.5 rounded-full", {
                            "bg-green-100 text-green-700": idea.status === "published",
                            "bg-blue-100 text-blue-700": idea.status === "writing",
                            "bg-gray-100 text-gray-600": idea.status === "idea",
                          })}>{idea.status}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">Score</p>
                        <p className="font-bold text-primary">{idea.priority_score}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ─── BACKLINKS ─── */}
        {tab === "backlinks" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{backlinks?.length ?? 0} backlink opportunities found by AI</p>
              <Link href="/backlinks">
                <Button variant="outline" size="sm">Manage all</Button>
              </Link>
            </div>
            {backlinks?.length === 0 && (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  <Link2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No backlink opportunities yet. The AI scans directories, forums, and competitor links daily.</p>
                </CardContent>
              </Card>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4">Platform</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">DA</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2">Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {backlinks?.map((b: any, i: number) => (
                    <tr key={i} className="hover:bg-accent/20">
                      <td className="py-2.5 pr-4 font-medium">{b.platform}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{b.type}</td>
                      <td className="py-2.5 pr-4">
                        <span className={cn("font-bold", b.domain_authority >= 70 ? "text-green-600" : b.domain_authority >= 40 ? "text-yellow-600" : "text-gray-500")}>
                          {b.domain_authority}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className={cn("text-xs px-2 py-0.5 rounded-full", {
                          "bg-green-100 text-green-700": b.status === "acquired",
                          "bg-blue-100 text-blue-700": b.status === "submitted",
                          "bg-gray-100 text-gray-600": b.status === "opportunity",
                          "bg-red-100 text-red-700": b.status === "rejected",
                        })}>{b.status}</span>
                      </td>
                      <td className="py-2.5">
                        {b.source_url && (
                          <a href={b.source_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── RANKINGS ─── */}
        {tab === "rankings" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{rankings?.length ?? 0} keywords tracked</p>
            </div>
            {rankings?.length === 0 && (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No keyword rankings tracked yet. Rankings are pulled hourly once keywords are added.</p>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardContent className="pt-0 pb-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-3 pr-4">#</th>
                      <th className="py-3 pr-4">Keyword</th>
                      <th className="py-3 pr-4 text-center">Position</th>
                      <th className="py-3 text-center">Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rankings?.map((r: any, i: number) => (
                      <tr key={i} className="hover:bg-accent/20">
                        <td className="py-3 pr-4 text-muted-foreground text-xs">{i + 1}</td>
                        <td className="py-3 pr-4 font-medium">{r.keyword}</td>
                        <td className="py-3 pr-4 text-center font-bold">#{r.position}</td>
                        <td className="py-3 text-center">
                          {r.change > 0 && <span className="text-green-600 text-xs flex items-center justify-center gap-0.5"><TrendingUp className="h-3 w-3" />+{r.change}</span>}
                          {r.change < 0 && <span className="text-red-600 text-xs flex items-center justify-center gap-0.5"><TrendingDown className="h-3 w-3" />{r.change}</span>}
                          {r.change === 0 && <span className="text-gray-400 text-xs flex items-center justify-center"><Minus className="h-3 w-3" /></span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ─── ALERTS ─── */}
        {tab === "alerts" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {unreadAlerts.length} unread · {alerts?.length ?? 0} total
              </p>
              <div className="flex gap-2">
                {alerts?.length === 0 && (
                  <Button variant="outline" size="sm" onClick={() => seedAlertsMutation.mutate()} disabled={seedAlertsMutation.isPending}>
                    <Activity className="h-4 w-4 mr-1" /> Seed Demo Alerts
                  </Button>
                )}
                {unreadAlerts.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => markAllReadMutation.mutate()} disabled={markAllReadMutation.isPending}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Mark all read
                  </Button>
                )}
              </div>
            </div>

            {alerts?.length === 0 && (
              <Card>
                <CardContent className="py-10 text-center">
                  <Bell className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground mb-3">No alerts yet. Alerts fire when rankings drop, pages break, or backlinks are lost.</p>
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              {alerts?.map((a: any) => (
                <div
                  key={a.id}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-4 transition-colors",
                    a.is_read ? "bg-card opacity-60" : "bg-card hover:border-primary/30"
                  )}
                >
                  <SeverityDot severity={a.severity} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{a.title}</p>
                      <span className={cn("text-xs px-1.5 py-0.5 rounded", {
                        "bg-red-100 text-red-700": a.severity === "critical" || a.severity === "high",
                        "bg-yellow-100 text-yellow-700": a.severity === "medium",
                        "bg-gray-100 text-gray-600": a.severity === "low" || a.severity === "info",
                      })}>{a.severity}</span>
                      <span className="text-xs text-muted-foreground">{a.type?.replace(/_/g, " ")}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{a.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">{formatRelative(a.created_at)}</p>
                  </div>
                  {!a.is_read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-xs"
                      onClick={() => markReadMutation.mutate(a.id)}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── WORKSPACE ─── */}
        {tab === "workspace" && (
          <div className="space-y-4">
            {workspace?.exists ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card>
                    <CardContent className="pt-4 pb-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Disk Usage</p>
                      <p className="text-2xl font-bold">{workspace.disk_usage_mb ?? 0} <span className="text-sm text-muted-foreground">MB</span></p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 pb-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Websites</p>
                      <p className="text-2xl font-bold">{workspace.website_workspaces?.length ?? 0}</p>
                    </CardContent>
                  </Card>
                  {Object.entries(workspace.sections ?? {}).map(([section, count]: any) => (
                    <Card key={section}>
                      <CardContent className="pt-4 pb-3 text-center">
                        <p className="text-xs text-muted-foreground mb-1 capitalize">{section}</p>
                        <p className="text-2xl font-bold">{count}</p>
                        <p className="text-xs text-muted-foreground">files</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Folder className="h-4 w-4 text-primary" /> Workspace Path
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <code className="text-xs bg-muted px-3 py-2 rounded block font-mono break-all">
                      {workspace.workspace_root}
                    </code>
                  </CardContent>
                </Card>

                {workspace.config && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Configuration</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><span className="text-muted-foreground">Version:</span> {workspace.config.workspace_version}</div>
                        <div><span className="text-muted-foreground">Autonomous:</span> {workspace.config.autonomous_mode ? "✅ Enabled" : "❌ Disabled"}</div>
                        <div><span className="text-muted-foreground">Industry:</span> {workspace.config.industry || "—"}</div>
                        <div><span className="text-muted-foreground">Created:</span> {formatRelative(workspace.config.created_at)}</div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  <Folder className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Workspace not initialized. It will be created automatically when you add a website.</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
