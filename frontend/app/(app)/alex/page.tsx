"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { alexApi, brainApi } from "@/lib/api";
import { api } from "@/lib/api";
import { useState } from "react";
import toast from "react-hot-toast";
import {
  Target, Search, TrendingUp, Zap, RefreshCw, ChevronRight,
  Globe, AlertTriangle, CheckCircle2, Brain, Sparkles,
  BarChart3, Link2, ArrowUpRight, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-yellow-50 text-yellow-700 border-yellow-200",
  low: "bg-green-50 text-green-700 border-green-200",
};

const COMPETITION_COLORS: Record<string, string> = {
  high: "text-red-600",
  medium: "text-yellow-600",
  low: "text-green-600",
  unknown: "text-muted-foreground",
};

const AI_PLATFORM_COLORS: Record<string, string> = {
  "ChatGPT": "bg-green-100 text-green-700",
  "Perplexity": "bg-purple-100 text-purple-700",
  "Gemini": "bg-blue-100 text-blue-700",
  "Google AI Overview": "bg-orange-100 text-orange-700",
  "Bing AI": "bg-sky-100 text-sky-700",
};

export default function AlexPage() {
  const [keyword, setKeyword] = useState("");
  const [competitor, setCompetitor] = useState("");
  const [serpKeyword, setSerpKeyword] = useState("");
  const [serpResult, setSerpResult] = useState<any>(null);
  const [serpLoading, setSerpLoading] = useState(false);
  const [compResult, setCompResult] = useState<any>(null);
  const [compLoading, setCompLoading] = useState(false);
  const [kwResult, setKwResult] = useState<any>(null);
  const [kwLoading, setKwLoading] = useState(false);

  const { data: trending, isLoading: trendingLoading } = useQuery({
    queryKey: ["alex-trending"],
    queryFn: () => alexApi.trending("SEO").then(r => r.data),
    refetchInterval: 60000,
  });

  const { data: websitesData } = useQuery({
    queryKey: ["websites-alex"],
    queryFn: () => api.get("/websites").then(r => r.data),
  });
  const websites = websitesData ?? [];

  const handleSerpScan = async () => {
    if (!serpKeyword.trim()) return;
    setSerpLoading(true);
    try {
      const res = await alexApi.serp(serpKeyword);
      setSerpResult(res.data);
    } catch {
      toast.error("SERP scan failed");
    } finally {
      setSerpLoading(false);
    }
  };

  const handleCompetitorScan = async () => {
    if (!competitor.trim()) return;
    setCompLoading(true);
    try {
      const res = await alexApi.competitor(competitor);
      setCompResult(res.data);
    } catch {
      toast.error("Competitor scan failed");
    } finally {
      setCompLoading(false);
    }
  };

  const handleKeywordScan = async (websiteId: string) => {
    if (!keyword.trim()) return;
    setKwLoading(true);
    try {
      const res = await alexApi.keywords(websiteId, keyword);
      setKwResult(res.data);
    } catch {
      toast.error("Keyword scan failed");
    } finally {
      setKwLoading(false);
    }
  };

  return (
    <div className="flex-1 space-y-6 p-6 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-orange-600">
            <Target className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Alex Brother</h1>
            <p className="text-sm text-muted-foreground">Ranking Hunter — 24/7 SERP scanner & opportunity detector</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-full border border-green-200">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          Hunting 24/7
        </div>
      </div>

      {/* Trending Topics from Brain */}
      <div className="rounded-xl border bg-gradient-to-br from-indigo-50 to-purple-50 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="h-4 w-4 text-indigo-600" />
          <span className="font-semibold text-sm text-indigo-800">Trending from Brain Knowledge</span>
          {trendingLoading && <RefreshCw className="h-3 w-3 animate-spin text-indigo-500" />}
        </div>
        {!trending?.trending?.length ? (
          <p className="text-sm text-indigo-600">No trending data yet — run brain learning sessions to build knowledge</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {trending.trending.slice(0, 8).map((t: any, i: number) => (
              <div
                key={i}
                className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs cursor-pointer hover:bg-indigo-50 transition-colors"
                onClick={() => setSerpKeyword(t.topic?.split(" ").slice(0, 4).join(" ") || "")}
              >
                <span className="text-indigo-700 font-medium">{t.topic?.slice(0, 60)}</span>
                <span className="ml-1.5 text-indigo-400">{Math.round(t.relevance * 100)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* SERP Scanner */}
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            SERP Scanner
          </h3>
          <div className="flex gap-2 mb-4">
            <input
              value={serpKeyword}
              onChange={e => setSerpKeyword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSerpScan()}
              placeholder="e.g. best SEO tools 2025"
              className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <button
              onClick={handleSerpScan}
              disabled={serpLoading || !serpKeyword.trim()}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {serpLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Scan
            </button>
          </div>

          {serpResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <span className="font-medium">{serpResult.keyword}</span>
                <span className={cn("font-medium", COMPETITION_COLORS[serpResult.competition_level])}>
                  {serpResult.competition_level} competition
                </span>
                {serpResult.easy_win && (
                  <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-bold">Easy Win!</span>
                )}
              </div>
              <div className="space-y-1.5">
                {(serpResult.top_results || []).slice(0, 5).map((r: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs p-2 rounded-lg bg-muted/30">
                    <span className="font-bold text-muted-foreground shrink-0 w-4">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{r.title}</div>
                      <div className="text-muted-foreground truncate">{r.domain}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Competitor Scanner */}
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <Target className="h-4 w-4 text-muted-foreground" />
            Competitor Weakness Scanner
          </h3>
          <div className="flex gap-2 mb-4">
            <input
              value={competitor}
              onChange={e => setCompetitor(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCompetitorScan()}
              placeholder="competitor.com"
              className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <button
              onClick={handleCompetitorScan}
              disabled={compLoading || !competitor.trim()}
              className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50 transition-colors"
            >
              {compLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
              Scan
            </button>
          </div>

          {compResult && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Found {compResult.weaknesses?.length ?? 0} weaknesses in {compResult.competitor}
              </div>
              {(compResult.weaknesses || []).map((w: any, i: number) => (
                <div key={i} className={cn("rounded-lg border px-3 py-2", PRIORITY_COLORS[w.priority] ?? PRIORITY_COLORS.medium)}>
                  <div className="text-xs font-semibold">{w.issue}</div>
                  <div className="text-xs mt-0.5 opacity-80">{w.opportunity}</div>
                </div>
              ))}
              {!compResult.weaknesses?.length && (
                <p className="text-sm text-muted-foreground text-center py-4">No major weaknesses detected — strong competitor</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Keyword Opportunity Finder */}
      <div className="rounded-xl border bg-card p-5">
        <h3 className="font-semibold flex items-center gap-2 mb-4">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          Keyword Opportunity Finder
        </h3>
        <div className="flex gap-2 mb-4">
          <input
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            placeholder="Seed keyword (e.g. 'SEO audit')"
            className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          {websites.length > 0 ? (
            <select
              className="rounded-lg border px-3 py-2 text-sm"
              onChange={e => e.target.value && handleKeywordScan(e.target.value)}
              defaultValue=""
            >
              <option value="" disabled>Select website</option>
              {websites.slice(0, 10).map((w: any) => (
                <option key={w.id} value={w.id}>{w.domain}</option>
              ))}
            </select>
          ) : (
            <button
              onClick={() => setKwResult({ seed_keyword: keyword, opportunities: [], count: 0, error: "No websites" })}
              disabled={kwLoading || !keyword.trim()}
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {kwLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Find
            </button>
          )}
          {kwLoading && <RefreshCw className="h-4 w-4 animate-spin text-purple-500 mt-2" />}
        </div>

        {kwResult && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Found {kwResult.count} opportunities for "{kwResult.seed_keyword}"
            </div>
            {kwResult.opportunities?.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {kwResult.opportunities.map((opp: any, i: number) => (
                  <div key={i} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="font-medium text-sm">{opp.keyword}</span>
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full border font-medium shrink-0",
                        PRIORITY_COLORS[opp.priority] ?? PRIORITY_COLORS.medium
                      )}>
                        {opp.priority}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{opp.action}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Competition: <span className={COMPETITION_COLORS[opp.competition]}>{opp.competition}</span></span>
                      {opp.our_position && <span>· Position #{opp.our_position}</span>}
                    </div>
                    {opp.top_competitors?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {opp.top_competitors.map((d: string) => (
                          <span key={d} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{d}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-sm text-muted-foreground">
                {kwResult.error || "No opportunities found — try a different keyword"}
              </div>
            )}
          </div>
        )}
      </div>

      {/* AI Search Opportunities (static education section) */}
      <div className="rounded-xl border bg-card p-5">
        <h3 className="font-semibold flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-yellow-500" />
          AI Search Opportunity Types
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              type: "AI Overview Candidates",
              icon: "🤖",
              desc: "Question-format keywords — How to, What is, Why does",
              platforms: ["Google AI Overview", "ChatGPT", "Perplexity"],
              action: "Create direct-answer pages with FAQ schema",
              color: "border-blue-200 bg-blue-50",
            },
            {
              type: "Comparison Content",
              icon: "⚖️",
              desc: "VS, compare, best, top keywords",
              platforms: ["Perplexity", "Gemini", "Bing AI"],
              action: "Create comparison tables with structured data",
              color: "border-purple-200 bg-purple-50",
            },
            {
              type: "Definition Content",
              icon: "📖",
              desc: "Definition, guide, tutorial, explained keywords",
              platforms: ["ChatGPT", "Gemini", "Google AI Overview"],
              action: "Create authoritative, encyclopedia-style content",
              color: "border-green-200 bg-green-50",
            },
          ].map((t) => (
            <div key={t.type} className={cn("rounded-xl border p-4", t.color)}>
              <div className="text-2xl mb-2">{t.icon}</div>
              <div className="font-semibold text-sm mb-1">{t.type}</div>
              <p className="text-xs text-muted-foreground mb-3">{t.desc}</p>
              <div className="flex flex-wrap gap-1 mb-3">
                {t.platforms.map(p => (
                  <span key={p} className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", AI_PLATFORM_COLORS[p] ?? "bg-gray-100 text-gray-600")}>
                    {p}
                  </span>
                ))}
              </div>
              <p className="text-xs font-medium">{t.action}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
