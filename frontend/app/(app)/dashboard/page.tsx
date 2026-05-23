"use client";
import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { IssuesList } from "@/components/dashboard/IssuesList";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { formatRelative, scoreColor, cn } from "@/lib/utils";

export default function DashboardPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: () => dashboardApi.overview().then((r) => r.data),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stats = data?.stats || { total_clients: 0, total_websites: 0, open_tasks: 0, critical_issues: 0, recent_crawls: 0, avg_seo_score: 0 };

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Dashboard"
        description="Agency SEO overview"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
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
        <StatsCards stats={stats} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Top Issues */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Critical Issues</CardTitle>
            </CardHeader>
            <CardContent>
              <IssuesList issues={data?.top_issues || []} />
            </CardContent>
          </Card>

          {/* Recent Clients */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Clients</CardTitle>
              <Link href="/clients">
                <Button variant="ghost" size="sm">View all</Button>
              </Link>
            </CardHeader>
            <CardContent>
              {(data?.recent_clients || []).length === 0 ? (
                <div className="py-8 text-center">
                  <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No clients yet</p>
                  <Link href="/clients/new">
                    <Button size="sm" className="mt-3">
                      <Plus className="h-4 w-4 mr-1" /> Add First Client
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {(data?.recent_clients || []).map((client: any) => (
                    <Link key={client.id} href={`/clients/${client.id}`}>
                      <div className="flex items-center justify-between rounded-lg p-3 hover:bg-accent/50 transition-colors cursor-pointer">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-xs font-bold text-primary">
                              {client.name[0].toUpperCase()}
                            </span>
                          </div>
                          <span className="text-sm font-medium">{client.name}</span>
                        </div>
                        <div className={cn("text-sm font-bold", scoreColor(client.seo_health_score))}>
                          {client.seo_health_score}/100
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
