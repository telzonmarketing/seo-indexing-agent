"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rankingsApi, websitesApi } from "@/lib/api";
import { useState } from "react";
import toast from "react-hot-toast";
import {
  TrendingUp, TrendingDown, Minus, Search, Plus, RefreshCw,
  BarChart3, ArrowUp, ArrowDown, Globe, Target, Zap, Trophy,
  AlertTriangle, CheckCircle, Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

function PositionBadge({ position }: { position: number | null }) {
  if (!position) return <span className="text-xs text-muted-foreground">—</span>;
  const color = position <= 3 ? "bg-green-100 text-green-700" :
    position <= 10 ? "bg-blue-100 text-blue-700" :
    position <= 20 ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-600";
  return (
    <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full tabular-nums", color)}>
      #{Math.round(position)}
    </span>
  );
}

function TrendIcon({ change }: { change: number | null }) {
  if (!change || Math.abs(change) < 0.5) return <Minus className="h-3.5 w-3.5 text-gray-400" />;
  if (change > 0) return (
    <div className="flex items-center gap-0.5 text-green-600">
      <ArrowUp className="h-3.5 w-3.5" />
      <span className="text-xs font-bold">+{Math.round(change)}</span>
    </div>
  );
  return (
    <div className="flex items-center gap-0.5 text-red-500">
      <ArrowDown className="h-3.5 w-3.5" />
      <span className="text-xs font-bold">{Math.round(change)}</span>
    </div>
  );
}

export default function RankingsPage() {
  const qc = useQueryClient();
  const [selectedWebsite, setSelectedWebsite] = useState<string>("");
  const [newKeywords, setNewKeywords] = useState("");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"rankings" | "wins" | "cannibalization">("rankings");

  const { data: websitesData } = useQuery({
    queryKey: ["websites-rankings"],
    queryFn: () => websitesApi.list().then(r => r.data),
  });
  const websites: any[] = Array.isArray(websitesData) ? websitesData : [];

  const activeWebsite = websites.find(w => w.id === selectedWebsite) || websites[0];
  const websiteId = activeWebsite?.id;

  const { data: rankingsData, isLoading } = useQuery({
    queryKey: ["rankings", websiteId],
    queryFn: () => rankingsApi.list({ website_id: websiteId, limit: 100 }).then(r => r.data),
    enabled: !!websiteId,
  });

  const { data: summaryData } = useQuery({
    queryKey: ["rankings-summary", websiteId],
    queryFn: () => rankingsApi.summary(websiteId!).then(r => r.data),
    enabled: !!websiteId,
  });

  const { data: winsData, isLoading: winsLoading } = useQuery({
    queryKey: ["rankings-wins", websiteId],
    queryFn: () => rankingsApi.wins(websiteId!, 20).then(r => r.data),
    enabled: !!websiteId && activeTab === "wins",
  });

  const { data: cannibData, isLoading: cannibLoading } = useQuery({
    queryKey: ["rankings-cannibalization", websiteId],
    queryFn: () => rankingsApi.cannibalization(websiteId!).then(r => r.data),
    enabled: !!websiteId && activeTab === "cannibalization",
  });

  const trackMutation = useMutation({
    mutationFn: (keywords: string[]) =>
      rankingsApi.track({ website_id: websiteId!, keywords, source: "manual" }),
    onSuccess: (res) => {
      toast.success(`Tracking ${res.data.added} new keywords`);
      setNewKeywords("");
      qc.invalidateQueries({ queryKey: ["rankings", websiteId] });
      qc.invalidateQueries({ queryKey: ["rankings-summary", websiteId] });
    },
    onError: () => toast.error("Failed to add keywords"),
  });

  const seedMutation = useMutation({
    mutationFn: () => rankingsApi.seedDemo(websiteId!),
    onSuccess: (res) => {
      toast.success(`Seeded ${res.data.seeded} demo keywords`);
      qc.invalidateQueries({ queryKey: ["rankings", websiteId] });
      qc.invalidateQueries({ queryKey: ["rankings-summary", websiteId] });
    },
  });

  const handleAddKeywords = () => {
    const kws = newKeywords.split("\n").map(k => k.trim()).filter(Boolean);
    if (!kws.length) { toast.error("Enter at least one keyword"); return; }
    trackMutation.mutate(kws);
  };

  const rankings: any[] = rankingsData?.rankings || [];
  const filtered = search ? rankings.filter(r => r.keyword.toLowerCase().includes(search.toLowerCase())) : rankings;

  const tabs = [
    { id: "rankings", label: "All Rankings", icon: BarChart3 },
    { id: "wins", label: "Daily Wins", icon: Trophy },
    { id: "cannibalization", label: "Cannibalization", icon: Layers },
  ] as const;

  return (
    <div className="flex-1 space-y-6 p-6 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-blue-600">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Rankings</h1>
            <p className="text-sm text-muted-foreground">Keyword position tracking & SERP monitoring</p>
          </div>
        </div>
        {websiteId && (
          <button
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
            className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
          >
            <Zap className="h-4 w-4" />
            Seed Demo Data
          </button>
        )}
      </div>

      {/* Website Selector */}
      {websites.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {websites.map(w => (
            <button
              key={w.id}
              onClick={() => setSelectedWebsite(w.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                (selectedWebsite === w.id || (!selectedWebsite && w === activeWebsite))
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-accent"
              )}
            >
              <Globe className="h-3.5 w-3.5" />
              {w.domain}
            </button>
          ))}
        </div>
      )}

      {!websiteId ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground border-2 border-dashed rounded-xl">
          <TrendingUp className="h-12 w-12 mb-3 opacity-40" />
          <h3 className="font-semibold mb-1">No websites yet</h3>
          <p className="text-sm">Add a website to start tracking keyword rankings</p>
        </div>
      ) : (
        <>
          {/* Summary Stats */}
          {summaryData && (
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: "Total Keywords", value: summaryData.total_keywords, color: "text-foreground" },
                { label: "Top 3", value: summaryData.top_3, color: "text-green-600" },
                { label: "Top 10", value: summaryData.top_10, color: "text-blue-600" },
                { label: "Improved", value: summaryData.improved, color: "text-green-600" },
                { label: "Declined", value: summaryData.declined, color: "text-red-500" },
                { label: "Avg Position", value: summaryData.avg_position ? `#${summaryData.avg_position}` : "—", color: "text-purple-600" },
              ].map(s => (
                <div key={s.label} className="rounded-xl border bg-card p-4">
                  <div className="text-xs text-muted-foreground mb-1">{s.label}</div>
                  <div className={cn("text-2xl font-bold tabular-nums", s.color)}>{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 border-b">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                  activeTab === t.id
                    ? "border-purple-500 text-purple-600"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </div>

          {/* Rankings Tab */}
          {activeTab === "rankings" && (
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Add Keywords */}
              <div className="rounded-xl border bg-card p-5">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Plus className="h-4 w-4" /> Track Keywords
                </h3>
                <textarea
                  value={newKeywords}
                  onChange={e => setNewKeywords(e.target.value)}
                  placeholder={"seo audit tool\ntechnical seo checklist\nbest seo software 2025"}
                  rows={6}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none font-mono"
                />
                <button
                  onClick={handleAddKeywords}
                  disabled={trackMutation.isPending || !newKeywords.trim()}
                  className="mt-2 w-full flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  {trackMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add Keywords
                </button>
              </div>

              {/* Rankings Table */}
              <div className="lg:col-span-2 rounded-xl border bg-card overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b">
                  <h3 className="font-semibold text-sm">
                    {filtered.length} keywords tracked
                  </h3>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Filter..."
                      className="pl-8 pr-3 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 w-36"
                    />
                  </div>
                </div>

                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center py-12 text-muted-foreground">
                    <BarChart3 className="h-8 w-8 mb-2 opacity-40" />
                    <p className="text-sm">No keywords tracked yet</p>
                    <p className="text-xs mt-1">Add keywords or click "Seed Demo Data"</p>
                  </div>
                ) : (
                  <div className="overflow-auto max-h-[480px]">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted/50 border-b">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Keyword</th>
                          <th className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground">Position</th>
                          <th className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground">Change</th>
                          <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">Clicks</th>
                          <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">CTR</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filtered.map((r: any) => (
                          <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-2.5">
                              <div className="font-medium text-sm">{r.keyword}</div>
                              {r.page_url && (
                                <div className="text-xs text-muted-foreground truncate max-w-[200px]">{r.page_url}</div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <PositionBadge position={r.position} />
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <TrendIcon change={r.position_change} />
                            </td>
                            <td className="px-3 py-2.5 text-right text-xs tabular-nums">
                              {r.clicks?.toLocaleString() || "—"}
                            </td>
                            <td className="px-3 py-2.5 text-right text-xs tabular-nums">
                              {r.ctr ? `${r.ctr}%` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Daily Wins Tab */}
          {activeTab === "wins" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Keywords that improved in ranking position — your biggest SEO victories
              </p>
              {winsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : winsData?.wins?.length ? (
                <div className="space-y-3">
                  {winsData.wins.map((win: any, i: number) => (
                    <div
                      key={i}
                      className={cn(
                        "flex items-center justify-between rounded-xl border p-4 transition-shadow hover:shadow-sm",
                        win.milestone ? "border-green-200 bg-green-50/50" : "bg-card"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold",
                          i === 0 ? "bg-yellow-100 text-yellow-700" :
                          i === 1 ? "bg-gray-100 text-gray-600" :
                          i === 2 ? "bg-orange-100 text-orange-700" :
                          "bg-green-100 text-green-700"
                        )}>
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : <TrendingUp className="h-4 w-4" />}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{win.keyword}</p>
                          {win.page_url && (
                            <p className="text-xs text-muted-foreground truncate max-w-[300px]">{win.page_url}</p>
                          )}
                          {win.milestone && (
                            <span className="inline-block mt-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                              {win.milestone}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-2 justify-end">
                          <PositionBadge position={win.previous_position} />
                          <ArrowUp className="h-4 w-4 text-green-500" />
                          <PositionBadge position={win.position} />
                        </div>
                        <div className="flex items-center justify-end gap-0.5 text-green-600 mt-1">
                          <ArrowUp className="h-3 w-3" />
                          <span className="text-xs font-bold">+{win.improvement} positions</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center py-16 text-muted-foreground border-2 border-dashed rounded-xl">
                  <Trophy className="h-10 w-10 mb-3 opacity-40" />
                  <p className="font-medium">No wins yet</p>
                  <p className="text-sm mt-1">Rankings improve as you track keywords over time</p>
                  <p className="text-xs mt-1">Seed demo data to see sample wins</p>
                </div>
              )}
            </div>
          )}

          {/* Cannibalization Tab */}
          {activeTab === "cannibalization" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Detect pages competing for the same keywords — fix to improve rankings
                </p>
                {cannibData && (
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-red-600 font-medium">{cannibData.total_high} high</span>
                    <span className="text-yellow-600 font-medium">{cannibData.total_medium} medium</span>
                  </div>
                )}
              </div>

              {cannibLoading ? (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : cannibData?.cannibalization_groups?.length ? (
                <div className="space-y-3">
                  {cannibData.cannibalization_groups.map((group: any, i: number) => (
                    <div
                      key={i}
                      className={cn(
                        "rounded-xl border p-4",
                        group.severity === "high" ? "border-red-200 bg-red-50/30" :
                        group.severity === "medium" ? "border-yellow-200 bg-yellow-50/30" :
                        "bg-card"
                      )}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className={cn(
                            "h-4 w-4 shrink-0",
                            group.severity === "high" ? "text-red-500" :
                            group.severity === "medium" ? "text-yellow-500" : "text-gray-400"
                          )} />
                          <span className="font-semibold text-sm">"{group.trigger_word}" conflict</span>
                          <span className={cn(
                            "text-xs font-bold px-2 py-0.5 rounded-full",
                            group.severity === "high" ? "bg-red-100 text-red-700" :
                            group.severity === "medium" ? "bg-yellow-100 text-yellow-700" :
                            "bg-gray-100 text-gray-600"
                          )}>
                            {group.severity}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {group.page_count} pages · {group.keyword_count} keywords
                        </span>
                      </div>

                      <div className="mb-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">Conflicting Pages:</p>
                        <div className="space-y-1">
                          {group.conflicting_pages.map((url: string) => (
                            <div key={url} className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
                              <span className="font-mono truncate">{url}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mb-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">Affected Keywords:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {group.affected_keywords.slice(0, 6).map((kw: string) => (
                            <span key={kw} className="text-xs bg-muted px-2 py-0.5 rounded-md">{kw}</span>
                          ))}
                          {group.affected_keywords.length > 6 && (
                            <span className="text-xs text-muted-foreground">+{group.affected_keywords.length - 6} more</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded-lg">
                        <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                        <span><strong>Fix:</strong> {group.fix}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : cannibData?.message ? (
                <div className="flex flex-col items-center py-16 text-muted-foreground border-2 border-dashed rounded-xl">
                  <Layers className="h-10 w-10 mb-3 opacity-40" />
                  <p className="font-medium">No cannibalization detected</p>
                  <p className="text-sm mt-1">{cannibData.message}</p>
                </div>
              ) : cannibData?.total_conflicts === 0 ? (
                <div className="flex flex-col items-center py-16 text-muted-foreground border-2 border-dashed rounded-xl">
                  <CheckCircle className="h-10 w-10 mb-3 text-green-400 opacity-70" />
                  <p className="font-medium text-foreground">No cannibalization detected! 🎉</p>
                  <p className="text-sm mt-1">Your pages have unique keyword focus</p>
                </div>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}
