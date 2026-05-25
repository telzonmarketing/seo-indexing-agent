"use client";

/**
 * SEO OS — Mission Control
 * missioncontrol.telzonmarketing.in
 *
 * The Live AI War Room. Displays real-time:
 *  - System health (CPU / RAM / Disk)
 *  - AI queue pressure
 *  - Live crawler activity
 *  - Live AI agent activity feed
 *  - All counts in one view
 *  - Ollama status
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";
import {
  Activity, Cpu, HardDrive, Server, Zap, Globe, Users, TrendingUp,
  Brain, Target, RefreshCw, CheckCircle, AlertTriangle, XCircle,
  Wifi, Link2, BookOpen, BarChart3, Clock, Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────
interface LiveData {
  timestamp: string;
  health: {
    score: number;
    status: "healthy" | "degraded" | "critical";
    system: {
      cpu_percent: number;
      memory_percent: number;
      memory_used_gb: number;
      memory_total_gb: number;
      disk_percent: number;
      disk_used_gb: number;
      disk_total_gb: number;
    };
    ollama: { running: boolean; model?: string; models_loaded?: number };
    queue: { depth: number; error?: string };
  };
  counts: {
    clients: number;
    websites: number;
    keywords_tracked: number;
    blog_ideas: number;
    backlink_opportunities: number;
    open_tasks: number;
    ai_tasks_24h: number;
  };
  crawls: {
    running: number;
    completed_24h: number;
    total: number;
    active_list: Array<{
      id: string;
      pages_crawled: number;
      status: string;
      started: string;
    }>;
  };
  activity: {
    count_last_1h: number;
    feed: Array<{
      id: string;
      type: string;
      level: string;
      agent: string;
      message: string;
      website_domain?: string;
      client_name?: string;
      is_milestone: boolean;
      created_at: string;
    }>;
  };
}

// ── Sub-components ─────────────────────────────────────────────────────────

function MetricBar({
  value,
  label,
  unit = "%",
  warn = 70,
  critical = 85,
}: {
  value: number;
  label: string;
  unit?: string;
  warn?: number;
  critical?: number;
}) {
  const color =
    value >= critical ? "bg-red-500" :
    value >= warn ? "bg-yellow-500" : "bg-green-500";

  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-slate-400">{label}</span>
        <span className={cn(
          "font-mono font-bold",
          value >= critical ? "text-red-400" : value >= warn ? "text-yellow-400" : "text-green-400"
        )}>
          {value}{unit}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700", color)}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={cn(
      "inline-block w-2 h-2 rounded-full",
      ok ? "bg-green-400 animate-pulse" : "bg-red-500"
    )} />
  );
}

function HealthBadge({ status }: { status: string }) {
  const config = {
    healthy: { icon: <CheckCircle className="h-4 w-4" />, color: "text-green-400 border-green-500/30 bg-green-500/10", label: "HEALTHY" },
    degraded: { icon: <AlertTriangle className="h-4 w-4" />, color: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10", label: "DEGRADED" },
    critical: { icon: <XCircle className="h-4 w-4" />, color: "text-red-400 border-red-500/30 bg-red-500/10", label: "CRITICAL" },
  }[status] || { icon: <Activity className="h-4 w-4" />, color: "text-slate-400 border-slate-600 bg-slate-800", label: "UNKNOWN" };

  return (
    <span className={cn("flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold tracking-wider", config.color)}>
      {config.icon} {config.label}
    </span>
  );
}

const LEVEL_COLORS: Record<string, string> = {
  info: "text-blue-400",
  success: "text-green-400",
  warning: "text-yellow-400",
  discovery: "text-purple-400",
  learning: "text-indigo-400",
};

const AGENT_ICONS: Record<string, string> = {
  "Brain Agent": "🧠",
  "Alex Brother": "🎯",
  "Blog Idea Agent": "💡",
  "Backlink Agent": "🔗",
  "Technical SEO Agent": "⚙️",
  "AEO Agent": "🤖",
  "Semantic Agent": "🔬",
  "Reporting Agent": "📊",
  "Content Agent": "✍️",
  "Crawler": "🕷️",
};

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function MissionControlPage() {
  const [tick, setTick] = useState(0);

  // Clock tick for time-ago updates
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  const { data, isLoading, isError, dataUpdatedAt } = useQuery<LiveData>({
    queryKey: ["mission-control-live"],
    queryFn: () => api.get("/mission-control/live").then(r => r.data),
    refetchInterval: 8000,   // refresh every 8s
    staleTime: 5000,
  });

  const { data: agentsData } = useQuery({
    queryKey: ["mission-control-agents"],
    queryFn: () => api.get("/mission-control/agents").then(r => r.data),
    staleTime: 60000,
  });

  const lastUpdate = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "—";

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-indigo-400 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Connecting to Mission Control...</p>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <XCircle className="h-8 w-8 text-red-500 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Failed to connect. Is the API running?</p>
        </div>
      </div>
    );
  }

  const { health, counts, crawls, activity } = data;
  const sys = health.system;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-mono p-4 overflow-auto">
      {/* ── Top Bar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-wider text-indigo-400">SEO OS</div>
            <div className="text-xs text-slate-500 tracking-widest uppercase">Mission Control</div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <HealthBadge status={health.status} />
          <div className="text-xs text-slate-500">
            <span className="text-slate-400">Score:</span>{" "}
            <span className={cn(
              "font-bold",
              health.score >= 80 ? "text-green-400" : health.score >= 50 ? "text-yellow-400" : "text-red-400"
            )}>{health.score}/100</span>
          </div>
          <div className="text-xs text-slate-600">
            Last update: <span className="text-slate-400">{lastUpdate}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-green-400">
            <StatusDot ok={true} />
            LIVE
          </div>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-12">

        {/* ── Left Column: System Health ─────────────────────────── */}
        <div className="col-span-12 lg:col-span-3 space-y-4">

          {/* System Resources */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <Cpu className="h-4 w-4 text-indigo-400" />
              <span className="text-xs font-bold tracking-wider text-slate-300 uppercase">System Resources</span>
            </div>
            {sys && !('error' in sys) ? (
              <div className="space-y-3">
                <MetricBar value={sys.cpu_percent} label="CPU" warn={70} critical={85} />
                <MetricBar value={sys.memory_percent} label={`RAM ${sys.memory_used_gb}/${sys.memory_total_gb}GB`} warn={75} critical={90} />
                <MetricBar value={sys.disk_percent} label={`Disk ${sys.disk_used_gb}/${sys.disk_total_gb}GB`} warn={80} critical={95} />
              </div>
            ) : (
              <p className="text-xs text-slate-500">psutil unavailable</p>
            )}
          </div>

          {/* Services */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <Server className="h-4 w-4 text-green-400" />
              <span className="text-xs font-bold tracking-wider text-slate-300 uppercase">Services</span>
            </div>
            <div className="space-y-3">
              {[
                { label: "FastAPI", ok: true, detail: "Port 8000" },
                { label: "PostgreSQL", ok: true, detail: "Port 5432" },
                { label: "Redis", ok: health.queue.error == null, detail: `Queue: ${health.queue.depth} tasks` },
                { label: "Ollama", ok: health.ollama.running, detail: health.ollama.model || "No model" },
                { label: "Celery Worker", ok: health.queue.error == null, detail: "Running" },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <StatusDot ok={s.ok} />
                    <span className={s.ok ? "text-slate-300" : "text-red-400"}>{s.label}</span>
                  </div>
                  <span className="text-slate-500 font-mono">{s.detail}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Queue Pressure */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Layers className="h-4 w-4 text-yellow-400" />
              <span className="text-xs font-bold tracking-wider text-slate-300 uppercase">Queue Pressure</span>
            </div>
            <div className="text-4xl font-black tabular-nums text-center py-2">
              <span className={cn(
                health.queue.depth > 50 ? "text-red-400" :
                health.queue.depth > 20 ? "text-yellow-400" : "text-green-400"
              )}>
                {health.queue.depth}
              </span>
            </div>
            <p className="text-xs text-slate-500 text-center">tasks in queue</p>
          </div>

        </div>

        {/* ── Middle Column: Activity Feed ──────────────────────── */}
        <div className="col-span-12 lg:col-span-5 space-y-4">

          {/* Live Activity */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-indigo-400" />
                <span className="text-xs font-bold tracking-wider text-slate-300 uppercase">Live AI Activity</span>
              </div>
              <span className="text-xs text-slate-500">
                <span className="text-indigo-400 font-bold">{activity.count_last_1h}</span> events/hr
              </span>
            </div>
            <div className="overflow-y-auto max-h-[400px]">
              {activity.feed.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-slate-600">
                  <Activity className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-xs">No activity yet — seed demo data to see events</p>
                </div>
              ) : (
                activity.feed.map((event, i) => (
                  <div
                    key={event.id}
                    className={cn(
                      "flex items-start gap-3 px-4 py-2.5 border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors",
                      event.is_milestone ? "bg-indigo-950/30 border-indigo-800/30" : ""
                    )}
                  >
                    <span className="text-base shrink-0 mt-0.5">
                      {AGENT_ICONS[event.agent] || "🤖"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-xs leading-snug", LEVEL_COLORS[event.level] || "text-slate-300")}>
                        {event.message}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-slate-600">{event.agent}</span>
                        {event.website_domain && (
                          <span className="text-[10px] text-slate-600">· {event.website_domain}</span>
                        )}
                        {event.is_milestone && (
                          <span className="text-[10px] text-indigo-400 font-bold">★ MILESTONE</span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-600 shrink-0 tabular-nums">
                      {timeAgo(event.created_at)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Active Crawls */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-blue-400" />
                <span className="text-xs font-bold tracking-wider text-slate-300 uppercase">Active Crawls</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span>
                  <span className={cn("font-bold tabular-nums", crawls.running > 0 ? "text-blue-400" : "text-slate-500")}>
                    {crawls.running}
                  </span>
                  <span className="text-slate-600"> running</span>
                </span>
                <span>
                  <span className="font-bold tabular-nums text-green-400">{crawls.completed_24h}</span>
                  <span className="text-slate-600"> done/24h</span>
                </span>
              </div>
            </div>
            {crawls.active_list.length > 0 ? (
              <div className="space-y-2">
                {crawls.active_list.map(c => (
                  <div key={c.id} className="flex items-center justify-between text-xs bg-slate-800 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-3 w-3 text-blue-400 animate-spin" />
                      <span className="text-slate-300 font-mono">{c.id.slice(0, 8)}...</span>
                    </div>
                    <span className="text-slate-400">{c.pages_crawled} pages</span>
                    <span className="text-slate-600">{timeAgo(c.started)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-600 text-center py-3">No active crawls</p>
            )}
          </div>

        </div>

        {/* ── Right Column: Counts + Agents ────────────────────── */}
        <div className="col-span-12 lg:col-span-4 space-y-4">

          {/* System Counts */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-4 w-4 text-purple-400" />
              <span className="text-xs font-bold tracking-wider text-slate-300 uppercase">Database</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Clients", value: counts.clients, icon: <Users className="h-3.5 w-3.5" />, color: "text-blue-400" },
                { label: "Websites", value: counts.websites, icon: <Globe className="h-3.5 w-3.5" />, color: "text-indigo-400" },
                { label: "Keywords", value: counts.keywords_tracked, icon: <TrendingUp className="h-3.5 w-3.5" />, color: "text-purple-400" },
                { label: "Blog Ideas", value: counts.blog_ideas, icon: <BookOpen className="h-3.5 w-3.5" />, color: "text-green-400" },
                { label: "Backlinks", value: counts.backlink_opportunities, icon: <Link2 className="h-3.5 w-3.5" />, color: "text-orange-400" },
                { label: "Open Tasks", value: counts.open_tasks, icon: <Layers className="h-3.5 w-3.5" />, color: "text-yellow-400" },
              ].map(s => (
                <div key={s.label} className="bg-slate-800 rounded-lg p-3">
                  <div className={cn("flex items-center gap-1.5 text-xs mb-1.5", s.color)}>
                    {s.icon}
                    <span className="text-slate-400">{s.label}</span>
                  </div>
                  <div className={cn("text-2xl font-black tabular-nums", s.color)}>
                    {s.value.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Agents */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-indigo-400" />
                <span className="text-xs font-bold tracking-wider text-slate-300 uppercase">AI Agents</span>
              </div>
              <span className="text-xs">
                <span className="text-green-400 font-bold">
                  {agentsData?.active || 8}
                </span>
                <span className="text-slate-600">/{agentsData?.total || 8} active</span>
              </span>
            </div>
            <div className="space-y-2">
              {(agentsData?.agents || [
                { name: "Brain Agent", icon: "🧠", status: "active", description: "Self-learning from SEO news" },
                { name: "Technical SEO Agent", icon: "⚙️", status: "active", description: "Crawls + issue detection" },
                { name: "Alex Brother", icon: "🎯", status: "active", description: "SERP + keyword hunter" },
                { name: "AEO Agent", icon: "🤖", status: "active", description: "AI search optimization" },
                { name: "Blog Idea Agent", icon: "💡", status: "active", description: "Daily idea generation" },
                { name: "Backlink Agent", icon: "🔗", status: "active", description: "Opportunity discovery" },
                { name: "Semantic Agent", icon: "🔬", status: "active", description: "Topic clustering" },
                { name: "Reporting Agent", icon: "📊", status: "active", description: "Reports + exports" },
              ]).map((agent: any) => (
                <div key={agent.name} className="flex items-center justify-between text-xs bg-slate-800 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span>{agent.icon}</span>
                    <div>
                      <p className="text-slate-300 font-medium leading-none">{agent.name}</p>
                      <p className="text-slate-600 text-[10px] mt-0.5">{agent.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-green-400 text-[10px]">active</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Ollama Status */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="h-4 w-4 text-violet-400" />
              <span className="text-xs font-bold tracking-wider text-slate-300 uppercase">AI Engine</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <StatusDot ok={health.ollama.running} />
                  <span className="text-sm font-bold text-slate-200">
                    {health.ollama.running ? "Ollama Online" : "Ollama Offline"}
                  </span>
                </div>
                {health.ollama.model && (
                  <p className="text-xs text-slate-500 mt-1 ml-4">
                    Model: <span className="text-violet-400">{health.ollama.model}</span>
                  </p>
                )}
                {health.ollama.models_loaded !== undefined && (
                  <p className="text-xs text-slate-500 ml-4">
                    {health.ollama.models_loaded} model(s) loaded
                  </p>
                )}
              </div>
              <div className="text-3xl">🤖</div>
            </div>
          </div>

        </div>

      </div>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-600">
        <span>SEO OS — Mission Control · {new Date().getFullYear()}</span>
        <span className="flex items-center gap-1.5">
          <Wifi className="h-3 w-3" />
          Auto-refresh every 8s · {new Date(data.timestamp).toLocaleTimeString()}
        </span>
        <span>admin.telzonmarketing.in</span>
      </div>
    </div>
  );
}
