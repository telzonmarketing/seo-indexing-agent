"use client";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { websitesApi, crawlsApi } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { ScoreCard } from "@/components/dashboard/ScoreCard";
import { IssuesList } from "@/components/dashboard/IssuesList";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, RefreshCw, ArrowLeft, Globe, CheckCircle, XCircle, ExternalLink } from "lucide-react";
import Link from "next/link";
import { cn, scoreColor, formatRelative } from "@/lib/utils";
import toast from "react-hot-toast";

export default function WebsiteDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: website, isLoading } = useQuery({
    queryKey: ["website", id],
    queryFn: () => websitesApi.get(id).then((r) => r.data),
  });

  const { data: crawls = [] } = useQuery({
    queryKey: ["crawls", "website", id],
    queryFn: () => crawlsApi.byWebsite(id).then((r) => r.data),
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
        {/* Score Cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <ScoreCard label="Technical SEO" score={website.technical_score} />
          <ScoreCard label="Content" score={website.content_score} />
          <ScoreCard label="AI Visibility" score={website.ai_visibility_score} />
          <div className="rounded-lg border bg-card p-5">
            <p className="text-sm text-muted-foreground mb-1">Last Crawl</p>
            <p className="text-base font-semibold">{formatRelative(website.last_crawled_at)}</p>
          </div>
        </div>

        {/* Integrations */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Integrations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {["gsc", "ga4", "wordpress", "shopify"].map((type) => {
                const integration = website.integrations?.find((i: any) => i.type === type);
                const connected = integration?.is_connected;
                return (
                  <div key={type} className={cn("flex items-center gap-2 rounded-lg border p-3", connected ? "border-green-200 bg-green-50" : "")}>
                    {connected ? (
                      <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-sm font-medium uppercase">{type}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {latestCrawl && (
          <>
            {/* Crawl Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Latest Crawl Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 md:grid-cols-6 text-center">
                  {[
                    { label: "Pages", value: latestCrawl.pages_crawled },
                    { label: "Issues", value: latestCrawl.issues_found },
                    { label: "Score", value: latestCrawl.seo_score },
                    { label: "Critical", value: latestCrawl.summary?.critical_issues || 0 },
                    { label: "Thin", value: latestCrawl.summary?.thin_content_pages || 0 },
                    { label: "No Schema", value: latestCrawl.summary?.pages_with_schema ? latestCrawl.pages_crawled - latestCrawl.summary.pages_with_schema : 0 },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg bg-muted/50 p-3">
                      <div className="text-2xl font-bold">{value}</div>
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
                  <CardTitle className="text-base">AI Analysis</CardTitle>
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
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Issues ({issues.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <IssuesList issues={issues.slice(0, 20)} />
              </CardContent>
            </Card>
          </>
        )}

        {!latestCrawl && (
          <div className="py-16 text-center">
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
