"use client";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { websitesApi, crawlsApi, rankingsApi, integrationsApi } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { ScoreCard } from "@/components/dashboard/ScoreCard";
import { IssuesList } from "@/components/dashboard/IssuesList";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Play, RefreshCw, ArrowLeft, Globe, CheckCircle, XCircle,
  TrendingUp, Bot, Zap, Shield, ExternalLink, Trophy,
} from "lucide-react";
import Link from "next/link";
import { cn, scoreColor, formatRelative } from "@/lib/utils";
import toast from "react-hot-toast";

function ScoreRing({ score, label, color }: { score: number; label: string; color: string }) {
  const pct = Math.min(100, Math.max(0, score));
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-16 w-16">
        <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-muted/20" />
          <circle
            cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="2.5"
            className={color}
            strokeDasharray={`${pct} ${100 - pct}`}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{score}</span>
      </div>
      <span className="text-xs text-muted-foreground mt-1.5 text-center">{label}</span>
    </div>
  );
}

export default function WebsiteDetailPage() {
  const { id } = useParams<{ id: string }>();

  // Show success/error toast once when redirected back from Google OAuth
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const connected = sp.get("integration_connected");
    const error = sp.get("integration_error");
    if (connected) {
      toast.success(`✅ ${connected.toUpperCase()} connected successfully!`);
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (error) {
      toast.error(`Google OAuth error: ${error}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []); // run once on mount

  const { data: website, isLoading } = useQuery({
    queryKey: ["website", id],
    queryFn: () => websitesApi.get(id).then((r) => r.data),
  });

  const { data: seoScore } = useQuery({
    queryKey: ["website-seo-score", id],
    queryFn: () => websitesApi.seoScore(id).then((r) => r.data),
    enabled: !!id,
  });

  const { data: crawls = [] } = useQuery({
    queryKey: ["crawls", "website", id],
    queryFn: () => crawlsApi.byWebsite(id).then((r) => r.data),
  });

  const { data: rankingSummary } = useQuery({
    queryKey: ["rankings-summary", id],
    queryFn: () => rankingsApi.summary(id).then((r) => r.data),
    enabled: !!id,
  });

  const latestCrawl = crawls[0];

  const { data: issues = [] } = useQuery({
    queryKey: ["issues", latestCrawl?.id],
    queryFn: () => crawlsApi.getIssues(latestCrawl.id).then((r) => r.data),
    enabled: !!latestCrawl?.id,
  });

  const crawlMutation = useMutation({
    mutationFn: () => crawlsApi.start({ website_id: id, max_pages: 200, include_ai_audit: true }),
    onSuccess: () => toast.success("Crawl started! Results will appear shortly."),
    onError: () => toast.error("Failed to start crawl"),
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!website) return <div className="p-6">Website not found</div>;

  const aiAudit = latestCrawl?.ai_audit || {};

  return (
    <div className="flex flex-col h-full">
      <Header
        title={website.domain}
        description={website.url}
        actions={
          <div className="flex gap-2">
            <Link href={`/clients/${website.client_id}`}>
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" /> Client
              </Button>
            </Link>
            <Link href={`/rankings`}>
              <Button variant="outline" size="sm">
                <TrendingUp className="h-4 w-4 mr-1" /> Rankings
              </Button>
            </Link>
            <Link href={`/aeo`}>
              <Button variant="outline" size="sm">
                <Bot className="h-4 w-4 mr-1" /> AEO
              </Button>
            </Link>
            <Button
              size="sm"
              onClick={() => crawlMutation.mutate()}
              disabled={crawlMutation.isPending}
            >
              <Play className="h-4 w-4 mr-1" />
              {crawlMutation.isPending ? "Starting..." : "Run Crawl"}
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* AI SEO Score + Component Scores */}
        <div className="grid gap-4 lg:grid-cols-5">
          {/* Big Score */}
          <div className="lg:col-span-2 rounded-xl border bg-card p-6 flex flex-col items-center justify-center">
            {seoScore ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="h-5 w-5 text-yellow-500" />
                  <span className="text-sm font-semibold text-muted-foreground">AI SEO Score</span>
                </div>
                <div className={cn(
                  "text-6xl font-black tabular-nums mb-1",
                  seoScore.seo_score >= 70 ? "text-green-600" :
                  seoScore.seo_score >= 50 ? "text-yellow-600" : "text-red-500"
                )}>
                  {seoScore.seo_score}
                </div>
                <div className="text-sm text-muted-foreground mb-3">Grade: <strong className="text-foreground">{seoScore.grade}</strong></div>
                <p className="text-xs text-muted-foreground text-center">{seoScore.tip}</p>
              </>
            ) : (
              <>
                <div className="text-4xl font-black text-muted-foreground/30">—</div>
                <p className="text-xs text-muted-foreground mt-2">Run a crawl for score</p>
              </>
            )}
          </div>

          {/* Component scores */}
          <div className="lg:col-span-3 rounded-xl border bg-card p-6">
            <h3 className="text-sm font-semibold mb-4">Score Breakdown</h3>
            <div className="flex items-center justify-around">
              <ScoreRing score={website.technical_score || 0} label="Technical" color="text-blue-500" />
              <ScoreRing score={website.content_score || 0} label="Content" color="text-green-500" />
              <ScoreRing score={seoScore?.components?.rankings || 0} label="Rankings" color="text-purple-500" />
              <ScoreRing score={website.aeo_score || 0} label="AEO" color="text-violet-500" />
              <ScoreRing score={website.ai_visibility_score || 0} label="AI Vis" color="text-fuchsia-500" />
            </div>
          </div>
        </div>

        {/* Rankings + Signals Row */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Rankings mini */}
          {rankingSummary && (
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-purple-500" />
                <h3 className="text-sm font-semibold">Keyword Rankings</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Total", value: rankingSummary.total_keywords, color: "text-foreground" },
                  { label: "Top 10", value: rankingSummary.top_10, color: "text-blue-600" },
                  { label: "Improved", value: rankingSummary.improved, color: "text-green-600" },
                  { label: "Avg Pos", value: rankingSummary.avg_position ? `#${rankingSummary.avg_position}` : "—", color: "text-purple-600" },
                ].map(s => (
                  <div key={s.label} className="text-center p-2 rounded-lg bg-muted/40">
                    <div className={cn("text-xl font-bold", s.color)}>{s.value}</div>
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Technical Signals */}
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="h-4 w-4 text-blue-500" />
              <h3 className="text-sm font-semibold">Technical Signals</h3>
            </div>
            <div className="space-y-2">
              {[
                { label: "SSL / HTTPS", ok: website.has_ssl },
                { label: "XML Sitemap", ok: website.has_sitemap },
                { label: "robots.txt", ok: website.has_robots_txt },
                { label: "Schema Markup", ok: website.has_schema },
                { label: "Verified", ok: website.is_verified },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-2 text-sm">
                  {s.ok ? (
                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                  )}
                  <span className={s.ok ? "" : "text-muted-foreground"}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Integrations */}
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="h-4 w-4 text-orange-500" />
              <h3 className="text-sm font-semibold">Integrations</h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {["gsc", "ga4", "wordpress", "shopify"].map((type) => {
                const integration = website.integrations?.find((i: any) => i.type === type);
                const connected = integration?.is_connected;
                const isGoogle = type === "gsc" || type === "ga4";
                return (
                  <div key={type} className={cn(
                    "flex flex-col gap-1.5 rounded-lg border p-2.5 text-xs",
                    connected ? "border-green-200 bg-green-50" : "border-dashed"
                  )}>
                    <div className={cn("flex items-center gap-2", connected ? "text-green-700" : "text-muted-foreground")}>
                      {connected ? (
                        <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span className="font-medium uppercase flex-1">{type}</span>
                      {connected && <span className="text-[10px] text-green-600">Connected</span>}
                    </div>
                    {!connected && isGoogle && (
                      <button
                        onClick={async () => {
                          try {
                            const scope = type === "gsc" ? "gsc" : "ga4";
                            const res = await integrationsApi.googleConnect(website.id, scope as "gsc" | "ga4");
                            const { auth_url } = res.data;
                            window.location.href = auth_url;
                          } catch (e: any) {
                            toast.error(e?.response?.data?.detail || "OAuth not configured");
                          }
                        }}
                        className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium text-left"
                      >
                        Connect →
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {latestCrawl && (
          <>
            {/* Crawl Summary */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Latest Crawl</CardTitle>
                  <span className="text-xs text-muted-foreground">{formatRelative(latestCrawl.created_at)}</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 md:grid-cols-6 text-center">
                  {[
                    { label: "Pages", value: latestCrawl.pages_crawled },
                    { label: "Issues", value: latestCrawl.issues_found },
                    { label: "Score", value: latestCrawl.seo_score },
                    { label: "Critical", value: latestCrawl.summary?.critical_issues || 0 },
                    { label: "Thin Content", value: latestCrawl.summary?.thin_content_pages || 0 },
                    { label: "No Schema", value: latestCrawl.summary?.pages_with_schema ? latestCrawl.pages_crawled - latestCrawl.summary.pages_with_schema : 0 },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg bg-muted/50 p-3">
                      <div className="text-2xl font-bold">{value ?? "—"}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* AI Recommendations */}
            {aiAudit.report && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bot className="h-4 w-4 text-purple-500" /> AI Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">{aiAudit.report.executive_summary}</p>
                  {aiAudit.report.priority_actions?.slice(0, 5).map((action: any, i: number) => (
                    <div key={i} className="flex gap-3 rounded-lg border p-3">
                      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-primary">{action.rank}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium">{action.action}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{action.impact}</p>
                        <Badge variant="secondary" className="mt-1 text-xs">{action.timeline}</Badge>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Issues */}
            {issues.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Issues ({issues.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <IssuesList issues={issues.slice(0, 20)} />
                </CardContent>
              </Card>
            )}
          </>
        )}

        {!latestCrawl && (
          <div className="py-16 text-center border-2 border-dashed rounded-xl">
            <Globe className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <h3 className="font-semibold mb-2">No crawl data yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Run your first crawl to see SEO analysis</p>
            <Button onClick={() => crawlMutation.mutate()}>
              <Play className="h-4 w-4 mr-1" /> Start Crawl
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
