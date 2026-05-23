"use client";
import { useQuery } from "@tanstack/react-query";
import { websitesApi } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Globe, ExternalLink, RefreshCw, CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { cn, scoreColor, formatRelative } from "@/lib/utils";

export default function WebsitesPage() {
  const { data: websites = [], isLoading } = useQuery({
    queryKey: ["websites"],
    queryFn: () => websitesApi.list().then((r) => r.data),
  });

  return (
    <div className="flex flex-col h-full">
      <Header title="Websites" description={`${websites.length} websites under monitoring`} />
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : websites.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <Globe className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>No websites yet. Add websites from client profiles.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {websites.map((website: any) => (
              <Card key={website.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Globe className="h-5 w-5 text-muted-foreground" />
                    <Link href={`/websites/${website.id}`} className="font-semibold hover:text-primary truncate">
                      {website.domain}
                    </Link>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                    <div className="rounded bg-muted/50 p-2">
                      <div className={cn("text-lg font-bold", scoreColor(website.technical_score))}>
                        {website.technical_score}
                      </div>
                      <div className="text-xs text-muted-foreground">Technical</div>
                    </div>
                    <div className="rounded bg-muted/50 p-2">
                      <div className={cn("text-lg font-bold", scoreColor(website.content_score))}>
                        {website.content_score}
                      </div>
                      <div className="text-xs text-muted-foreground">Content</div>
                    </div>
                    <div className="rounded bg-muted/50 p-2">
                      <div className={cn("text-lg font-bold", scoreColor(website.ai_visibility_score))}>
                        {website.ai_visibility_score}
                      </div>
                      <div className="text-xs text-muted-foreground">AI</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                    <span>Last crawled: {formatRelative(website.last_crawled_at)}</span>
                    {website.is_verified ? (
                      <span className="flex items-center gap-1 text-green-600"><CheckCircle className="h-3 w-3" /> Verified</span>
                    ) : (
                      <span className="flex items-center gap-1 text-muted-foreground"><XCircle className="h-3 w-3" /> Unverified</span>
                    )}
                  </div>

                  <Link href={`/websites/${website.id}`}>
                    <Button variant="outline" size="sm" className="w-full">
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> View Details
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
