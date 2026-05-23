"use client";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clientsApi, websitesApi, crawlsApi } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { ScoreCard } from "@/components/dashboard/ScoreCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Globe, Search, Play, RefreshCw,
  ArrowLeft, ExternalLink, Activity,
} from "lucide-react";
import Link from "next/link";
import { cn, scoreColor, severityColor, formatRelative } from "@/lib/utils";
import toast from "react-hot-toast";
import { useState } from "react";

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [addWebsiteUrl, setAddWebsiteUrl] = useState("");
  const [showAddWebsite, setShowAddWebsite] = useState(false);

  const { data: client, isLoading } = useQuery({
    queryKey: ["client", id],
    queryFn: () => clientsApi.get(id).then((r) => r.data),
  });

  const { data: websites = [] } = useQuery({
    queryKey: ["websites", id],
    queryFn: () => websitesApi.list(id).then((r) => r.data),
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", id],
    queryFn: async () => {
      const { tasksApi } = await import("@/lib/api");
      return tasksApi.list({ client_id: id }).then((r) => r.data);
    },
  });

  const addWebsiteMutation = useMutation({
    mutationFn: (url: string) => websitesApi.create({ client_id: id, url }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["websites", id] });
      setAddWebsiteUrl("");
      setShowAddWebsite(false);
      toast.success("Website added!");
    },
    onError: () => toast.error("Failed to add website"),
  });

  const crawlMutation = useMutation({
    mutationFn: (websiteId: string) =>
      crawlsApi.start({ website_id: websiteId, max_pages: 200, include_ai_audit: true }),
    onSuccess: () => toast.success("Crawl started! This may take a few minutes."),
    onError: () => toast.error("Failed to start crawl"),
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!client) return <div className="p-6">Client not found</div>;

  const openTasks = tasks.filter((t: any) => t.status !== "done");
  const criticalTasks = openTasks.filter((t: any) => t.priority === "critical");

  return (
    <div className="flex flex-col h-full">
      <Header
        title={client.name}
        description={client.company || client.email || "SEO Client"}
        actions={
          <div className="flex gap-2">
            <Link href="/clients">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            </Link>
            <Button size="sm" onClick={() => setShowAddWebsite(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Website
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Score Cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <ScoreCard label="SEO Health" score={client.seo_health_score} description="Overall score" />
          <div className="rounded-lg border bg-card p-5">
            <p className="text-sm text-muted-foreground mb-1">Websites</p>
            <p className="text-3xl font-bold">{client.website_count}</p>
          </div>
          <div className="rounded-lg border bg-card p-5">
            <p className="text-sm text-muted-foreground mb-1">Open Tasks</p>
            <p className={cn("text-3xl font-bold", openTasks.length > 0 ? "text-orange-600" : "text-green-600")}>
              {openTasks.length}
            </p>
          </div>
          <div className="rounded-lg border bg-card p-5">
            <p className="text-sm text-muted-foreground mb-1">Critical</p>
            <p className={cn("text-3xl font-bold", criticalTasks.length > 0 ? "text-red-600" : "text-green-600")}>
              {criticalTasks.length}
            </p>
          </div>
        </div>

        {/* Add Website Form */}
        {showAddWebsite && (
          <Card>
            <CardContent className="pt-4">
              <p className="font-medium mb-3">Add Website</p>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={addWebsiteUrl}
                  onChange={(e) => setAddWebsiteUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="flex-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <Button
                  onClick={() => addWebsiteMutation.mutate(addWebsiteUrl)}
                  disabled={!addWebsiteUrl || addWebsiteMutation.isPending}
                >
                  Add
                </Button>
                <Button variant="outline" onClick={() => setShowAddWebsite(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Websites */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Websites</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowAddWebsite(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </CardHeader>
          <CardContent>
            {websites.length === 0 ? (
              <div className="py-6 text-center text-muted-foreground">
                <Globe className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No websites added yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {websites.map((website: any) => (
                  <div key={website.id} className="flex items-center justify-between rounded-lg border p-4 hover:bg-accent/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <Globe className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <Link href={`/websites/${website.id}`} className="font-medium hover:text-primary transition-colors">
                          {website.domain}
                        </Link>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                          <span className={cn("font-medium", scoreColor(website.technical_score))}>
                            Score: {website.technical_score}
                          </span>
                          <span>Last crawled: {formatRelative(website.last_crawled_at)}</span>
                          {website.is_verified && (
                            <span className="text-green-600 font-medium">✓ Verified</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => crawlMutation.mutate(website.id)}
                        disabled={crawlMutation.isPending}
                      >
                        <Play className="h-3.5 w-3.5 mr-1" /> Crawl
                      </Button>
                      <Link href={`/websites/${website.id}`}>
                        <Button size="sm" variant="ghost">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tasks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Tasks ({openTasks.length} open)</CardTitle>
            <Link href={`/tasks?client_id=${id}`}>
              <Button variant="ghost" size="sm">View all</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {openTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No open tasks</p>
            ) : (
              <div className="space-y-2">
                {openTasks.slice(0, 8).map((task: any) => (
                  <div key={task.id} className="flex items-center justify-between rounded-md border p-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", {
                        "bg-red-100 text-red-800": task.priority === "critical",
                        "bg-orange-100 text-orange-800": task.priority === "high",
                        "bg-yellow-100 text-yellow-800": task.priority === "medium",
                        "bg-green-100 text-green-800": task.priority === "low",
                      })}>
                        {task.priority}
                      </span>
                      <span className="text-sm truncate">{task.title}</span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">{task.status}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Client Info */}
        {(client.notes || client.tags?.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {client.tags?.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {client.tags.map((tag: string) => (
                    <Badge key={tag} variant="secondary">{tag}</Badge>
                  ))}
                </div>
              )}
              {client.notes && <p className="text-sm text-muted-foreground">{client.notes}</p>}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
