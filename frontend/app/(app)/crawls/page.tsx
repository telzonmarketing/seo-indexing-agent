"use client";
import { useQuery } from "@tanstack/react-query";
import { crawlsApi, websitesApi } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, RefreshCw, ExternalLink, CheckCircle, XCircle, Clock } from "lucide-react";
import Link from "next/link";
import { cn, scoreColor, formatRelative } from "@/lib/utils";

const StatusIcon = ({ status }: { status: string }) => {
  if (status === "completed") return <CheckCircle className="h-4 w-4 text-green-500" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-red-500" />;
  if (status === "running") return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
  return <Clock className="h-4 w-4 text-muted-foreground" />;
};

export default function CrawlsPage() {
  const { data: websites = [] } = useQuery({
    queryKey: ["websites"],
    queryFn: () => websitesApi.list().then((r) => r.data),
  });

  return (
    <div className="flex flex-col h-full">
      <Header title="Crawls" description="SEO crawl history and results" />
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {websites.map((website: any) => (
          <WebsiteCrawls key={website.id} website={website} />
        ))}
        {websites.length === 0 && (
          <div className="py-16 text-center text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>No websites yet. Add a client and website to start crawling.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function WebsiteCrawls({ website }: { website: any }) {
  const { data: crawls = [] } = useQuery({
    queryKey: ["crawls", "website", website.id],
    queryFn: () => crawlsApi.byWebsite(website.id).then((r) => r.data),
    refetchInterval: 10000,
  });

  if (crawls.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Link href={`/websites/${website.id}`} className="font-semibold hover:text-primary">
            {website.domain}
          </Link>
          <Link href={`/websites/${website.id}`}>
            <Button variant="ghost" size="sm"><ExternalLink className="h-4 w-4" /></Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {crawls.map((crawl: any) => (
            <div key={crawl.id} className="flex items-center gap-4 rounded-md border p-3 text-sm">
              <StatusIcon status={crawl.status} />
              <span className="capitalize text-muted-foreground w-20">{crawl.status}</span>
              <span className="font-medium">{crawl.pages_crawled} pages</span>
              <span className="text-muted-foreground">{crawl.issues_found} issues</span>
              <span className={cn("font-medium", scoreColor(crawl.seo_score))}>
                Score: {crawl.seo_score}
              </span>
              <span className="text-muted-foreground ml-auto">{formatRelative(crawl.created_at)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
