"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useState } from "react";
import {
  Target, TrendingUp, AlertCircle, Search, Zap, Play,
  ExternalLink, BarChart3, Trophy, ArrowRight, RefreshCw,
  Medal, ChevronDown, ChevronUp
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Opportunity {
  type: string;
  keyword: string;
  current_position?: number;
  target_position?: number;
  search_volume?: number;
  action?: string;
  estimated_traffic_gain?: number;
  priority_score?: number;
  label?: string;
  icon?: string;
  color?: string;
  difficulty?: string;
}

interface EasyWin {
  keyword: string;
  position: number;
  gap_to_page1: number;
  search_volume: number;
  estimated_monthly_traffic: number;
  action_steps: string[];
  difficulty: string;
  confidence: string;
}

const WEBSITE_LIST_QUERY = "websites";

const COLOR_MAP: Record<string, string> = {
  green: "bg-green-500/20 text-green-300 border-green-500/30",
  yellow: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  purple: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  red: "bg-red-500/20 text-red-300 border-red-500/30",
  blue: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  orange: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  teal: "bg-teal-500/20 text-teal-300 border-teal-500/30",
  amber: "bg-amber-500/20 text-amber-300 border-amber-500/30",
};

function OppBadge({ type, icon, color }: { type: string; icon: string; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${COLOR_MAP[color] || COLOR_MAP.blue}`}>
      <span>{icon}</span> {type.replace(/_/g, " ")}
    </span>
  );
}

function EasyWinRow({ win, expanded, onToggle }: {
  win: EasyWin; expanded: boolean; onToggle: () => void;
}) {
  const posColor = win.position <= 14 ? "text-green-400" : "text-yellow-400";
  return (
    <div className="bg-slate-800/60 rounded-xl border border-slate-700 overflow-hidden">
      <button onClick={onToggle}
        className="w-full flex items-center gap-4 p-4 hover:bg-slate-700/30 transition text-left">
        <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0">
          <span className={`text-lg font-bold ${posColor}`}>#{win.position}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-white text-sm truncate">{win.keyword}</div>
          <div className="text-xs text-slate-400 mt-0.5">
            {win.search_volume?.toLocaleString()} vol · +{win.estimated_monthly_traffic}/mo traffic potential
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className={`px-2 py-0.5 rounded text-xs ${
            win.confidence === "high" ? "bg-green-500/20 text-green-300" : "bg-yellow-500/20 text-yellow-300"
          }`}>
            {win.confidence} confidence
          </div>
          {expanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-700">
          <div className="mt-3 space-y-2">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Action Steps</div>
            {win.action_steps.map((step, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <span className="text-sm text-slate-300">{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HunterPage() {
  const qc = useQueryClient();
  const [selectedWebsite, setSelectedWebsite] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"easy-wins" | "opportunities" | "serp-gaps" | "competitor">("easy-wins");
  const [expandedWin, setExpandedWin] = useState<string | null>(null);

  const { data: websites } = useQuery({
    queryKey: [WEBSITE_LIST_QUERY],
    queryFn: () => api.get("/api/websites").then(r => r.data.websites),
  });

  const { data: hunterStatus } = useQuery({
    queryKey: ["hunter-status"],
    queryFn: () => api.get("/api/hunter/status").then(r => r.data),
    refetchInterval: 10000,
  });

  const { data: summary } = useQuery({
    queryKey: ["hunter-summary"],
    queryFn: () => api.get("/api/hunter/summary").then(r => r.data),
    refetchInterval: 15000,
  });

  const { data: easyWins, isLoading: loadingWins } = useQuery({
    queryKey: ["easy-wins", selectedWebsite],
    queryFn: () => api.get(`/api/hunter/easy-wins/${selectedWebsite}`).then(r => r.data),
    enabled: !!selectedWebsite && activeTab === "easy-wins",
  });

  const { data: opportunities, isLoading: loadingOpps } = useQuery({
    queryKey: ["opportunities", selectedWebsite],
    queryFn: () => api.get(`/api/hunter/opportunities/${selectedWebsite}`).then(r => r.data),
    enabled: !!selectedWebsite && activeTab === "opportunities",
  });

  const { data: serpGaps } = useQuery({
    queryKey: ["serp-gaps", selectedWebsite],
    queryFn: () => api.get(`/api/hunter/serp-gaps/${selectedWebsite}`).then(r => r.data),
    enabled: !!selectedWebsite && activeTab === "serp-gaps",
  });

  const { data: competitorWeak } = useQuery({
    queryKey: ["competitor-weak", selectedWebsite],
    queryFn: () => api.get(`/api/hunter/competitor-weak/${selectedWebsite}`).then(r => r.data),
    enabled: !!selectedWebsite && activeTab === "competitor",
  });

  const scanMutation = useMutation({
    mutationFn: (websiteId: string) => api.post(`/api/hunter/scan/${websiteId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["easy-wins", selectedWebsite] }),
  });

  const TABS = [
    { id: "easy-wins", label: "🎯 Easy Wins", count: easyWins?.count },
    { id: "opportunities", label: "⭐ All Opportunities", count: opportunities?.total },
    { id: "serp-gaps", label: "🔍 SERP Gaps", count: serpGaps?.total_gaps },
    { id: "competitor", label: "🏹 Competitor Weak", count: competitorWeak?.takeover_opportunities },
  ] as const;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-orange-500/20 rounded-xl">
              <Target size={24} className="text-orange-400" />
            </div>
            Hunter Agent
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            24/7 SERP scanning · Opportunity detection · Competitor intelligence
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-400 font-medium">Scanning Hourly</span>
          </div>
          {selectedWebsite && (
            <button
              onClick={() => scanMutation.mutate(selectedWebsite)}
              disabled={scanMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-lg text-sm text-white transition"
            >
              <RefreshCw size={14} className={scanMutation.isPending ? "animate-spin" : ""} />
              Scan Now
            </button>
          )}
        </div>
      </div>

      {/* Global stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
            <Trophy size={12} /> Easy Wins
          </div>
          <div className="text-2xl font-bold text-green-400">{summary?.easy_wins_total ?? 0}</div>
          <div className="text-xs text-slate-500 mt-1">across all websites</div>
        </div>
        <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
            <Medal size={12} /> Top 3 Positions
          </div>
          <div className="text-2xl font-bold text-yellow-400">{summary?.top_3_positions ?? 0}</div>
          <div className="text-xs text-slate-500 mt-1">keywords</div>
        </div>
        <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
            <BarChart3 size={12} /> Keywords Tracked
          </div>
          <div className="text-2xl font-bold text-blue-400">{summary?.keywords_tracked ?? 0}</div>
          <div className="text-xs text-slate-500 mt-1">total</div>
        </div>
        <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
            <Zap size={12} /> Opportunities Found
          </div>
          <div className="text-2xl font-bold text-purple-400">{summary?.opportunities_discovered ?? 0}</div>
          <div className="text-xs text-slate-500 mt-1">discovered</div>
        </div>
      </div>

      {/* Website selector */}
      <div className="flex flex-wrap gap-2 mb-6">
        {(websites ?? []).map((w: any) => (
          <button
            key={w.id}
            onClick={() => setSelectedWebsite(w.id)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition ${
              selectedWebsite === w.id
                ? "bg-orange-600 border-orange-500 text-white"
                : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500"
            }`}
          >
            {w.domain}
          </button>
        ))}
      </div>

      {!selectedWebsite ? (
        <div className="text-center py-20 text-slate-500">
          <Target size={48} className="mx-auto mb-4 opacity-30" />
          <p>Select a website above to view opportunities</p>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-slate-800/40 p-1 rounded-xl w-fit">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? "bg-slate-700 text-white"
                    : "text-slate-400 hover:text-slate-300"
                }`}
              >
                {tab.label}
                {tab.count != null && (
                  <span className="px-1.5 py-0.5 bg-slate-600 text-slate-300 rounded text-xs">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Easy Wins */}
          {activeTab === "easy-wins" && (
            <div className="space-y-3">
              {easyWins?.total_traffic_potential != null && (
                <div className="flex items-center gap-2 text-sm text-green-400 mb-4">
                  <TrendingUp size={14} />
                  {easyWins?.count} keywords · {easyWins?.total_traffic_potential?.toLocaleString()} total monthly traffic potential
                </div>
              )}
              {loadingWins ? (
                <div className="text-slate-500 text-sm">Loading...</div>
              ) : (
                (easyWins?.easy_wins ?? []).map((win: EasyWin) => (
                  <EasyWinRow
                    key={win.keyword}
                    win={win}
                    expanded={expandedWin === win.keyword}
                    onToggle={() => setExpandedWin(expandedWin === win.keyword ? null : win.keyword)}
                  />
                ))
              )}
            </div>
          )}

          {/* All Opportunities */}
          {activeTab === "opportunities" && (
            <div className="space-y-3">
              {loadingOpps ? (
                <div className="text-slate-500 text-sm">Analyzing opportunities...</div>
              ) : (
                (opportunities?.opportunities ?? []).map((opp: Opportunity, i: number) => (
                  <div key={i} className="bg-slate-800/60 rounded-xl border border-slate-700 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <OppBadge type={opp.label ?? opp.type} icon={opp.icon ?? "📌"} color={opp.color ?? "blue"} />
                        <div className="font-semibold text-white mt-2">{opp.keyword}</div>
                        <div className="text-sm text-slate-400 mt-1">{opp.action}</div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        <div className="text-xs text-slate-400">Position</div>
                        <div className="text-lg font-bold text-white">#{opp.current_position}</div>
                        {opp.target_position && (
                          <div className="text-xs text-green-400">→ #{opp.target_position}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-700 text-xs text-slate-400">
                      <span>{opp.search_volume?.toLocaleString() ?? 0} searches/mo</span>
                      {opp.estimated_traffic_gain && (
                        <span className="text-green-400">
                          +{Math.round(opp.estimated_traffic_gain)} traffic/mo
                        </span>
                      )}
                      {opp.difficulty && (
                        <span className={`px-2 py-0.5 rounded ${
                          opp.difficulty === "low" ? "bg-green-500/20 text-green-300" :
                            "bg-yellow-500/20 text-yellow-300"
                        }`}>
                          {opp.difficulty} effort
                        </span>
                      )}
                      {opp.priority_score && (
                        <span className="ml-auto font-semibold text-white">
                          Score: {opp.priority_score}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* SERP Gaps */}
          {activeTab === "serp-gaps" && (
            <div className="space-y-3">
              {(serpGaps?.semantic_gaps ?? []).length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <Search size={40} className="mx-auto mb-3 opacity-30" />
                  <p>No semantic gaps detected — great topical coverage!</p>
                </div>
              ) : (
                (serpGaps?.semantic_gaps ?? []).map((gap: any, i: number) => (
                  <div key={i} className="bg-slate-800/60 rounded-xl border border-slate-700 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-white">{gap.topic_category}</div>
                        <div className="text-sm text-slate-400 mt-1">{gap.opportunity}</div>
                      </div>
                      <span className="px-2 py-0.5 bg-red-500/20 text-red-300 rounded text-xs border border-red-500/20 flex-shrink-0 ml-3">
                        {gap.coverage_status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-700 text-xs text-slate-400">
                      <span>Traffic potential: {gap.estimated_traffic_potential?.toLocaleString()}/mo</span>
                      <span className="text-orange-400">Competitor: {gap.competitor_coverage}</span>
                    </div>
                  </div>
                ))
              )}
              {serpGaps && (
                <div className="mt-4 p-4 bg-slate-800/40 rounded-xl border border-slate-700 text-sm text-slate-400">
                  Topic coverage score: {" "}
                  <span className={`font-bold ${serpGaps.topic_coverage_score >= 70 ? "text-green-400" : "text-yellow-400"}`}>
                    {serpGaps.topic_coverage_score}%
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Competitor Weaknesses */}
          {activeTab === "competitor" && (
            <div className="space-y-3">
              {(competitorWeak?.competitor_weaknesses ?? []).map((item: any, i: number) => (
                <div key={i} className="bg-slate-800/60 rounded-xl border border-slate-700 p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-semibold text-white">{item.keyword}</div>
                      <div className="text-sm text-slate-400 mt-1">{item.takeover_strategy}</div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {(item.weakness_signals ?? []).map((sig: string, j: number) => (
                          <span key={j} className="px-2 py-0.5 bg-red-500/10 text-red-300 border border-red-500/20 rounded text-xs">
                            {sig}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right ml-4 flex-shrink-0">
                      <div className="text-xs text-slate-400">You</div>
                      <div className="text-xl font-bold text-white">#{item.your_position}</div>
                      <div className={`text-xs mt-1 ${item.confidence === "high" ? "text-green-400" : "text-yellow-400"}`}>
                        {item.confidence} chance
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
