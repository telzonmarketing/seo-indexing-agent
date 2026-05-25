"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { brainApi } from "@/lib/api";
import { useState } from "react";
import toast from "react-hot-toast";
import {
  Brain, Zap, BookOpen, Database, Search, TrendingUp,
  Clock, CheckCircle2, RefreshCw, Play, ChevronRight,
  AlertCircle, Cpu, Globe, BarChart3, Sparkles, FileText,
  ArrowUpRight, Activity, Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORY_COLORS: Record<string, string> = {
  technical_seo: "bg-blue-100 text-blue-700",
  semantic_seo: "bg-purple-100 text-purple-700",
  aeo: "bg-cyan-100 text-cyan-700",
  ranking: "bg-green-100 text-green-700",
  backlink: "bg-orange-100 text-orange-700",
  content: "bg-yellow-100 text-yellow-700",
  algorithm: "bg-red-100 text-red-700",
  ai_search: "bg-indigo-100 text-indigo-700",
  schema: "bg-pink-100 text-pink-700",
  core_web_vitals: "bg-teal-100 text-teal-700",
  local_seo: "bg-lime-100 text-lime-700",
  entity_seo: "bg-violet-100 text-violet-700",
};

const CATEGORY_LABELS: Record<string, string> = {
  technical_seo: "Technical SEO",
  semantic_seo: "Semantic SEO",
  aeo: "AEO / Answer Engine",
  ranking: "Ranking Factors",
  backlink: "Backlinks",
  content: "Content",
  algorithm: "Algorithm Updates",
  ai_search: "AI Search",
  schema: "Schema / Structured Data",
  core_web_vitals: "Core Web Vitals",
  local_seo: "Local SEO",
  entity_seo: "Entity SEO",
};

function IntelligenceGauge({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score / 10));
  const color = score < 30 ? "text-yellow-500" : score < 70 ? "text-blue-500" : "text-green-500";
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={cn("text-4xl font-bold tabular-nums", color)}>{score}</div>
      <div className="text-xs text-muted-foreground">Intelligence Score</div>
      <div className="w-full h-2 rounded-full bg-muted overflow-hidden mt-1">
        <div
          className={cn("h-full rounded-full transition-all", score < 30 ? "bg-yellow-500" : score < 70 ? "bg-blue-500" : "bg-green-500")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function BrainPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"overview" | "articles" | "knowledge" | "sources">("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const { data: status, isLoading, refetch: refetchStatus } = useQuery({
    queryKey: ["brain-status"],
    queryFn: () => brainApi.status().then(r => r.data),
    refetchInterval: 15000,
  });

  const { data: articlesData } = useQuery({
    queryKey: ["brain-articles"],
    queryFn: () => brainApi.articles({ limit: 20 }).then(r => r.data),
    enabled: activeTab === "articles",
  });

  const { data: knowledgeData } = useQuery({
    queryKey: ["brain-knowledge"],
    queryFn: () => brainApi.knowledge({ limit: 20 }).then(r => r.data),
    enabled: activeTab === "knowledge",
  });

  const { data: sourcesData } = useQuery({
    queryKey: ["brain-sources"],
    queryFn: () => brainApi.sources().then(r => r.data),
  });

  const learnNow = useMutation({
    mutationFn: () => brainApi.learnNow(),
    onSuccess: (res) => {
      const d = res.data;
      toast.success(`Learned from ${d.articles_processed} articles, extracted ${d.knowledge_extracted} insights`);
      qc.invalidateQueries({ queryKey: ["brain-status"] });
      qc.invalidateQueries({ queryKey: ["brain-articles"] });
      qc.invalidateQueries({ queryKey: ["brain-knowledge"] });
    },
    onError: () => toast.error("Learning session failed"),
  });

  const queueLearn = useMutation({
    mutationFn: () => brainApi.learnQueue(),
    onSuccess: (res) => toast.success(`Queued: task ${res.data.task_id?.slice(0, 8)}...`),
    onError: () => toast.error("Failed to queue learning"),
  });

  const deepLearn = useMutation({
    mutationFn: () => brainApi.learnDeep(),
    onSuccess: () => toast.success("Deep learning session queued"),
    onError: () => toast.error("Failed to queue deep learning"),
  });

  const handleSearch = async () => {
    if (searchQuery.length < 3) return;
    setSearching(true);
    try {
      const res = await brainApi.searchKnowledge(searchQuery, undefined, 8);
      setSearchResults(res.data.results || []);
    } catch {
      toast.error("Search failed");
    } finally {
      setSearching(false);
    }
  };

  const stats = status?.stats ?? {};
  const vectorMem = status?.vector_memory ?? {};
  const embedding = status?.embedding_model ?? {};

  const tabs = [
    { id: "overview", label: "Overview", icon: Brain },
    { id: "articles", label: "Articles", icon: FileText },
    { id: "knowledge", label: "Knowledge Base", icon: Database },
    { id: "sources", label: "Sources", icon: Globe },
  ] as const;

  return (
    <div className="flex-1 space-y-6 p-6 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">AI Brain</h1>
            <p className="text-sm text-muted-foreground">Self-learning SEO intelligence — continuously improving</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => queueLearn.mutate()}
            disabled={queueLearn.isPending}
            className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            <Zap className="h-4 w-4" />
            Queue Learn
          </button>
          <button
            onClick={() => learnNow.mutate()}
            disabled={learnNow.isPending}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-60"
          >
            {learnNow.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {learnNow.isPending ? "Learning..." : "Learn Now"}
          </button>
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex items-center gap-4 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2">
          <div className={cn("h-2.5 w-2.5 rounded-full", status?.enabled ? "bg-green-500 animate-pulse" : "bg-gray-400")} />
          <span className="text-sm font-medium">{status?.enabled ? "Active" : "Inactive"}</span>
        </div>
        <div className="text-muted-foreground">|</div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Cpu className="h-4 w-4" />
          <span>Gen {status?.brain_generation ?? 1}</span>
        </div>
        <div className="text-muted-foreground">|</div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>
            {status?.last_learning_at
              ? `Last learned ${new Date(status.last_learning_at).toLocaleTimeString()}`
              : "No sessions yet"}
          </span>
        </div>
        <div className="text-muted-foreground">|</div>
        <div className="flex items-center gap-1.5 text-sm">
          <div className={cn("h-2 w-2 rounded-full", embedding?.available ? "bg-green-500" : "bg-red-500")} />
          <span className={embedding?.available ? "text-green-700" : "text-red-600"}>
            {embedding?.model ?? "nomic-embed-text"} {embedding?.available ? "ready" : "unavailable"}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === id
                ? "border-indigo-500 text-indigo-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ─────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Stats Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: "Articles Scraped",
                value: stats.total_articles_scraped ?? 0,
                sub: `${stats.articles_processed ?? 0} processed`,
                icon: FileText,
                color: "text-blue-500",
                bg: "bg-blue-50",
              },
              {
                label: "Knowledge Entries",
                value: stats.total_knowledge_entries ?? 0,
                sub: `${vectorMem.total_vectors ?? 0} vectors stored`,
                icon: Database,
                color: "text-purple-500",
                bg: "bg-purple-50",
              },
              {
                label: "Learning Sessions",
                value: stats.total_learning_sessions ?? 0,
                sub: `${sourcesData?.total ?? 15} sources monitored`,
                icon: Activity,
                color: "text-green-500",
                bg: "bg-green-50",
              },
              {
                label: "Vector Memory",
                value: vectorMem.total_vectors ?? 0,
                sub: `${vectorMem.dim ?? 768}-dim · ${vectorMem.distance ?? "cosine"}`,
                icon: Layers,
                color: "text-indigo-500",
                bg: "bg-indigo-50",
              },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border bg-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-muted-foreground">{stat.label}</span>
                  <div className={cn("rounded-lg p-2", stat.bg)}>
                    <stat.icon className={cn("h-4 w-4", stat.color)} />
                  </div>
                </div>
                <div className="text-3xl font-bold tabular-nums">{stat.value.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-1">{stat.sub}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Intelligence Score + By Category */}
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-yellow-500" />
                Brain Intelligence
              </h3>
              <IntelligenceGauge score={status?.intelligence_score ?? 10} />
              <div className="space-y-2 pt-2 border-t">
                <div className="text-xs font-medium text-muted-foreground mb-2">Knowledge by Category</div>
                {Object.entries(status?.knowledge_by_category ?? {}).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No knowledge yet — run a learning session</p>
                ) : (
                  Object.entries(status?.knowledge_by_category ?? {})
                    .sort(([, a], [, b]) => (b as number) - (a as number))
                    .slice(0, 6)
                    .map(([cat, count]) => (
                      <div key={cat} className="flex items-center justify-between gap-2">
                        <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium", CATEGORY_COLORS[cat] ?? "bg-gray-100 text-gray-700")}>
                          {CATEGORY_LABELS[cat] ?? cat}
                        </span>
                        <span className="text-xs font-bold tabular-nums">{count as number}</span>
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* Recent Sessions */}
            <div className="rounded-xl border bg-card p-5 lg:col-span-2">
              <h3 className="font-semibold flex items-center gap-2 mb-4">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Recent Learning Sessions
              </h3>
              {!status?.recent_sessions?.length ? (
                <div className="flex flex-col items-center py-8 text-muted-foreground">
                  <Brain className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">No sessions yet. Click "Learn Now" to start.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {status.recent_sessions.map((s: any) => (
                    <div key={s.id} className="flex items-center gap-4 rounded-lg border p-3">
                      <div className={cn(
                        "h-2 w-2 rounded-full shrink-0",
                        s.status === "completed" ? "bg-green-500" : s.status === "running" ? "bg-blue-500 animate-pulse" : "bg-red-400"
                      )} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium capitalize">{s.type?.replace(/_/g, " ")}</span>
                          {s.status === "completed" && (
                            <span className="text-xs text-muted-foreground">
                              · {s.articles_processed} articles · {s.knowledge_extracted} insights
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {s.started_at ? new Date(s.started_at).toLocaleString() : "—"}
                          {s.duration_seconds ? ` · ${s.duration_seconds}s` : ""}
                        </div>
                      </div>
                      <div className={cn(
                        "text-xs px-2 py-0.5 rounded-full font-medium",
                        s.status === "completed" ? "bg-green-50 text-green-700" :
                        s.status === "running" ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-700"
                      )}>
                        {s.status}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Semantic Search */}
          <div className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold flex items-center gap-2 mb-4">
              <Search className="h-4 w-4 text-muted-foreground" />
              Search Brain Knowledge
            </h3>
            <div className="flex gap-2 mb-4">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search: 'Core Web Vitals ranking impact', 'AI search optimization'..."
                className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleSearch}
                disabled={searching || searchQuery.length < 3}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {searching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Search
              </button>
            </div>
            {searchResults.length > 0 ? (
              <div className="space-y-3">
                {searchResults.map((r, i) => (
                  <div key={i} className="rounded-lg bg-muted/30 border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm leading-relaxed">{r.text}</p>
                      <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                        {Math.round((r.score ?? 0) * 100)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      {r.category && (
                        <span className={cn("text-xs px-1.5 py-0.5 rounded", CATEGORY_COLORS[r.category] ?? "bg-gray-100 text-gray-600")}>
                          {CATEGORY_LABELS[r.category] ?? r.category}
                        </span>
                      )}
                      {r.source && <span className="text-xs text-muted-foreground">{r.source}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : searchQuery.length >= 3 && !searching ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No results found — run more learning sessions to build the knowledge base
              </p>
            ) : null}
          </div>

          {/* Deep Learn */}
          <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/30 p-5 flex items-center justify-between">
            <div>
              <div className="font-medium text-sm">Run Deep Learning Session</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Processes ALL pending articles through Ollama AI — extracts rich insights, builds vector memory
              </div>
            </div>
            <button
              onClick={() => deepLearn.mutate()}
              disabled={deepLearn.isPending}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              <Brain className="h-4 w-4" />
              Deep Learn
            </button>
          </div>
        </div>
      )}

      {/* ── ARTICLES TAB ─────────────────────────────────────────── */}
      {activeTab === "articles" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {articlesData?.total ?? 0} articles scraped from {sourcesData?.total ?? 15} sources
            </div>
          </div>
          {!articlesData?.articles?.length ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground border rounded-xl">
              <FileText className="h-10 w-10 mb-3 opacity-40" />
              <p>No articles yet. Run a learning session first.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {articlesData.articles.map((a: any) => (
                <div key={a.id} className="flex items-center gap-4 rounded-xl border bg-card p-4 hover:shadow-sm transition-shadow">
                  <div className={cn(
                    "h-2 w-2 rounded-full shrink-0",
                    a.status === "processed" ? "bg-green-500" :
                    a.status === "processing" ? "bg-blue-500 animate-pulse" :
                    a.status === "failed" ? "bg-red-400" :
                    a.status === "skipped" ? "bg-yellow-400" : "bg-gray-300"
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.title || a.url}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{a.source}</span>
                      {a.published_at && (
                        <span className="text-xs text-muted-foreground">
                          · {new Date(a.published_at).toLocaleDateString()}
                        </span>
                      )}
                      {a.content_length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          · {(a.content_length / 1000).toFixed(1)}k chars
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.categories?.slice(0, 2).map((cat: string) => (
                      <span key={cat} className={cn("text-xs px-1.5 py-0.5 rounded", CATEGORY_COLORS[cat] ?? "bg-gray-100 text-gray-600")}>
                        {cat.replace(/_/g, " ")}
                      </span>
                    ))}
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      a.status === "processed" ? "bg-green-50 text-green-700" :
                      a.status === "failed" ? "bg-red-50 text-red-700" :
                      a.status === "skipped" ? "bg-yellow-50 text-yellow-700" : "bg-gray-100 text-gray-600"
                    )}>
                      {a.status}
                    </span>
                    {a.has_vector && (
                      <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">vectorized</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── KNOWLEDGE TAB ─────────────────────────────────────────── */}
      {activeTab === "knowledge" && (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            {knowledgeData?.total ?? 0} knowledge entries · {vectorMem.total_vectors ?? 0} vectorized
          </div>
          {!knowledgeData?.knowledge?.length ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground border rounded-xl">
              <Database className="h-10 w-10 mb-3 opacity-40" />
              <p>No knowledge extracted yet. Run a learning session first.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {knowledgeData.knowledge.map((e: any) => (
                <div key={e.id} className="rounded-xl border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      <BookOpen className="h-4 w-4 text-indigo-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-relaxed">{e.content}</p>
                      <div className="flex items-center gap-2 flex-wrap mt-2">
                        {e.category && (
                          <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium", CATEGORY_COLORS[e.category] ?? "bg-gray-100 text-gray-600")}>
                            {CATEGORY_LABELS[e.category] ?? e.category}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">{e.source_name}</span>
                        <span className="text-xs text-muted-foreground">conf: {e.confidence}%</span>
                        {e.has_vector && (
                          <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">vectorized</span>
                        )}
                      </div>
                      {e.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {e.tags.slice(0, 4).map((tag: string) => (
                            <span key={tag} className="text-xs bg-muted px-1.5 py-0.5 rounded">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SOURCES TAB ─────────────────────────────────────────── */}
      {activeTab === "sources" && (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            {sourcesData?.total ?? 0} SEO knowledge sources monitored continuously
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(sourcesData?.sources ?? []).map((src: any) => (
              <div key={src.name} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{src.name}</div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">{src.site}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {src.has_rss ? (
                      <span className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-medium">RSS</span>
                    ) : (
                      <span className="text-xs bg-yellow-50 text-yellow-700 px-1.5 py-0.5 rounded font-medium">Scrape</span>
                    )}
                    <span className="text-xs text-muted-foreground">P{src.priority}</span>
                  </div>
                </div>
                <div className="mt-2">
                  <span className={cn("text-xs px-1.5 py-0.5 rounded", CATEGORY_COLORS[src.category] ?? "bg-gray-100 text-gray-600")}>
                    {CATEGORY_LABELS[src.category] ?? src.category}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
