"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, websitesApi, clientsApi } from "@/lib/api";
import { useState } from "react";
import toast from "react-hot-toast";
import {
  Network, Plus, RefreshCw, Globe, TrendingUp, Layers, ChevronRight,
  CheckCircle, Clock, XCircle, Zap, BookOpen, Target,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  planned: { color: "bg-blue-100 text-blue-700", label: "Planned" },
  in_progress: { color: "bg-yellow-100 text-yellow-700", label: "In Progress" },
  published: { color: "bg-green-100 text-green-700", label: "Published" },
  archived: { color: "bg-gray-100 text-gray-600", label: "Archived" },
};

export default function ClustersPage() {
  const qc = useQueryClient();
  const [selectedCluster, setSelectedCluster] = useState<any>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [topic, setTopic] = useState("");
  const [domain, setDomain] = useState("");

  const { data: clustersData, isLoading } = useQuery({
    queryKey: ["clusters"],
    queryFn: () => api.get("/content-clusters?limit=50").then((r) => r.data),
  });

  const { data: websitesData } = useQuery({
    queryKey: ["websites-clusters"],
    queryFn: () => websitesApi.list().then(r => r.data),
  });
  const websites: any[] = Array.isArray(websitesData) ? websitesData : [];

  const generateMutation = useMutation({
    mutationFn: (data: { topic: string; domain: string }) =>
      api.post("/content-clusters/generate", { topic: data.topic, domain: data.domain }).then(r => r.data),
    onSuccess: (data) => {
      toast.success(`Cluster generated for "${data.topic}"!`);
      setShowGenerate(false);
      setTopic("");
      setDomain("");
      qc.invalidateQueries({ queryKey: ["clusters"] });
      setSelectedCluster(data);
    },
    onError: () => toast.error("Failed to generate cluster — check Ollama is running"),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/content-clusters/${id}/status`, { status }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clusters"] });
      toast.success("Status updated");
    },
  });

  const clusters: any[] = clustersData?.clusters || [];

  return (
    <div className="flex-1 space-y-6 p-6 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
            <Network className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Topical Authority Map</h1>
            <p className="text-sm text-muted-foreground">AI-generated content clusters to dominate topic spaces</p>
          </div>
        </div>
        <button
          onClick={() => setShowGenerate(true)}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Generate Cluster
        </button>
      </div>

      {/* Stats */}
      {clusters.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: "Total Clusters", value: clusters.length, color: "text-foreground" },
            { label: "Published", value: clusters.filter(c => c.status === "published").length, color: "text-green-600" },
            { label: "In Progress", value: clusters.filter(c => c.status === "in_progress").length, color: "text-yellow-600" },
            { label: "Planned", value: clusters.filter(c => c.status === "planned").length, color: "text-blue-600" },
          ].map(s => (
            <div key={s.label} className="rounded-xl border bg-card p-4">
              <div className="text-xs text-muted-foreground mb-1">{s.label}</div>
              <div className={cn("text-2xl font-bold tabular-nums", s.color)}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Generate Modal */}
      {showGenerate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Zap className="h-5 w-5 text-emerald-500" /> Generate Content Cluster
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Topic / Pillar Keyword</label>
                <input
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="e.g. Technical SEO, AI Marketing, Local SEO..."
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Domain (optional)</label>
                <input
                  value={domain}
                  onChange={e => setDomain(e.target.value)}
                  placeholder="e.g. example.com"
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                AI will generate a full topical cluster with pillar page, supporting pages, keywords, and semantic entities.
                Takes ~30 seconds.
              </p>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowGenerate(false)}
                className="flex-1 px-4 py-2.5 border rounded-lg text-sm font-medium hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={() => generateMutation.mutate({ topic, domain })}
                disabled={generateMutation.isPending || !topic.trim()}
                className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {generateMutation.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" /> Generating...
                  </span>
                ) : "Generate Cluster"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clusters Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : clusters.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground border-2 border-dashed rounded-xl">
          <Network className="h-12 w-12 mb-3 opacity-40" />
          <h3 className="font-semibold mb-1">No content clusters yet</h3>
          <p className="text-sm mb-4">Generate your first topical authority cluster</p>
          <button
            onClick={() => setShowGenerate(true)}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
          >
            <Plus className="h-4 w-4" /> Generate First Cluster
          </button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {clusters.map((cluster: any) => (
            <div
              key={cluster.id}
              className="rounded-xl border bg-card p-5 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedCluster(cluster)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-emerald-500 shrink-0" />
                  <h3 className="font-semibold text-sm">{cluster.topic}</h3>
                </div>
                <span className={cn(
                  "text-xs font-medium px-2 py-0.5 rounded-full",
                  STATUS_CONFIG[cluster.status]?.color || "bg-gray-100 text-gray-600"
                )}>
                  {STATUS_CONFIG[cluster.status]?.label || cluster.status}
                </span>
              </div>

              {cluster.pillar_keyword && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
                  <Target className="h-3.5 w-3.5" />
                  Pillar: <span className="font-medium text-foreground">{cluster.pillar_keyword}</span>
                </div>
              )}

              <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                <span className="flex items-center gap-1">
                  <BookOpen className="h-3.5 w-3.5" />
                  {(cluster.cluster_pages || []).length} supporting pages
                </span>
                {cluster.topical_authority_score > 0 && (
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Authority: {cluster.topical_authority_score}
                  </span>
                )}
                {cluster.estimated_traffic > 0 && (
                  <span className="flex items-center gap-1">
                    ~{cluster.estimated_traffic.toLocaleString()} visits/mo
                  </span>
                )}
              </div>

              {/* Supporting pages preview */}
              {cluster.cluster_pages?.length > 0 && (
                <div className="space-y-1 mb-3">
                  {cluster.cluster_pages.slice(0, 3).map((page: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ChevronRight className="h-3 w-3 shrink-0" />
                      <span className="truncate">{page.title || page.target_keyword || `Page ${i + 1}`}</span>
                    </div>
                  ))}
                  {cluster.cluster_pages.length > 3 && (
                    <div className="text-xs text-muted-foreground pl-5">
                      +{cluster.cluster_pages.length - 3} more pages
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t">
                <select
                  value={cluster.status || "planned"}
                  onClick={e => e.stopPropagation()}
                  onChange={e => updateStatusMutation.mutate({ id: cluster.id, status: e.target.value })}
                  className="text-xs border rounded-lg px-2 py-1 bg-background"
                >
                  {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
                    <option key={val} value={val}>{cfg.label}</option>
                  ))}
                </select>
                <button
                  onClick={e => { e.stopPropagation(); setSelectedCluster(cluster); }}
                  className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  View details →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedCluster && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedCluster(null)}>
          <div className="bg-background rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="font-bold text-lg">{selectedCluster.topic}</h2>
                {selectedCluster.pillar_keyword && (
                  <p className="text-sm text-muted-foreground mt-1">Pillar: {selectedCluster.pillar_keyword}</p>
                )}
              </div>
              <button onClick={() => setSelectedCluster(null)} className="text-muted-foreground hover:text-foreground text-xl">✕</button>
            </div>

            {selectedCluster.cluster_pages?.length > 0 && (
              <div className="mb-5">
                <h3 className="font-semibold text-sm mb-3">📋 Supporting Pages</h3>
                <div className="space-y-2">
                  {selectedCluster.cluster_pages.map((page: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40">
                      <span className="text-xs font-bold text-muted-foreground mt-0.5 w-5">{i + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{page.title || page.target_keyword || `Page ${i + 1}`}</p>
                        {page.target_keyword && page.title && (
                          <p className="text-xs text-muted-foreground">Keyword: {page.target_keyword}</p>
                        )}
                        {page.search_intent && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded mt-1 inline-block">
                            {page.search_intent}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedCluster.supporting_keywords?.length > 0 && (
              <div className="mb-5">
                <h3 className="font-semibold text-sm mb-3">🔑 Supporting Keywords</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedCluster.supporting_keywords.map((kw: string) => (
                    <span key={kw} className="bg-muted text-xs px-2 py-1 rounded-lg">{kw}</span>
                  ))}
                </div>
              </div>
            )}

            {selectedCluster.semantic_entities?.length > 0 && (
              <div className="mb-5">
                <h3 className="font-semibold text-sm mb-3">🧠 Semantic Entities</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedCluster.semantic_entities.slice(0, 20).map((entity: string) => (
                    <span key={entity} className="bg-emerald-50 text-emerald-700 text-xs px-2 py-1 rounded-lg">{entity}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
