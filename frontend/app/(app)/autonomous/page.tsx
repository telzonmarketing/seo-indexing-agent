"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useState } from "react";
import toast from "react-hot-toast";
import {
  Bot, Zap, Clock, Calendar, CheckCircle2, Play, RefreshCw,
  TrendingUp, Link2, FileText, Search, BarChart2, Target,
  BookOpen, Shield, OctagonX, CirclePlay, AlertTriangle,
} from "lucide-react";

const TASK_NAMES: Record<string, string> = {
  blog_ideas: "Generate Blog Ideas",
  backlink_scan: "Scan Backlink Opportunities",
  excel_reports: "Generate Excel Reports",
  content_gaps: "Detect Content Gaps",
  competitor_analysis: "Competitor Gap Analysis",
  ai_search_audit: "AI Search Audit",
  semantic_audit: "Semantic SEO Audit",
  monitor_rankings: "Monitor Rankings",
  crawl_check: "Check Due Crawls",
};

const AGENT_ICONS: Record<string, React.ReactNode> = {
  "Technical SEO Agent": <Shield className="w-5 h-5 text-blue-500" />,
  "Content Agent": <FileText className="w-5 h-5 text-purple-500" />,
  "Blog Idea Agent": <BookOpen className="w-5 h-5 text-green-500" />,
  "Backlink Agent": <Link2 className="w-5 h-5 text-orange-500" />,
  "Semantic SEO Agent": <Search className="w-5 h-5 text-indigo-500" />,
  "AI Search Agent": <Bot className="w-5 h-5 text-cyan-500" />,
  "Competitor Agent": <Target className="w-5 h-5 text-red-500" />,
  "Reporting Agent": <BarChart2 className="w-5 h-5 text-yellow-500" />,
};

export default function AutonomousPage() {
  const [runningTask, setRunningTask] = useState<string | null>(null);
  const [showStopConfirm, setShowStopConfirm] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ["autonomous-status"],
    queryFn: () => api.get("/autonomous/status").then((r) => r.data),
    refetchInterval: 30000,
  });

  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.get("/autonomous/agents").then((r) => r.data),
  });

  const runTask = useMutation({
    mutationFn: (taskName: string) =>
      api.post(`/autonomous/run/${taskName}`).then((r) => r.data),
    onSuccess: (_, taskName) => {
      toast.success(`${TASK_NAMES[taskName] || taskName} started!`);
      setRunningTask(null);
    },
    onError: () => {
      toast.error("Failed to start task");
      setRunningTask(null);
    },
  });

  const handleRun = (taskName: string) => {
    setRunningTask(taskName);
    runTask.mutate(taskName);
  };

  const { data: emergencyStatus } = useQuery({
    queryKey: ["emergency-status"],
    queryFn: () => api.get("/autonomous/emergency-status").then(r => r.data),
    refetchInterval: 10000,
  });

  const emergencyStop = useMutation({
    mutationFn: () => api.post("/autonomous/emergency-stop").then(r => r.data),
    onSuccess: () => {
      toast.success("🛑 Emergency stop activated — all operations halted");
      setShowStopConfirm(false);
    },
    onError: () => toast.error("Failed to trigger emergency stop"),
  });

  const resume = useMutation({
    mutationFn: () => api.post("/autonomous/resume").then(r => r.data),
    onSuccess: () => toast.success("✅ Autonomous mode resumed"),
    onError: () => toast.error("Failed to resume"),
  });

  const isStopped = emergencyStatus?.stopped;

  const stats = data?.stats?.total || {};
  const last24h = data?.stats?.last_24h || {};
  const agents = agentsData?.agents || [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="w-7 h-7 text-indigo-500" />
            Autonomous SEO Engine
          </h1>
          <p className="text-muted-foreground mt-1">
            24/7 AI-powered SEO execution — running continuously in the background
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isStopped ? (
            <>
              <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-full">
                <OctagonX className="w-4 h-4 text-red-600" />
                <span className="text-sm font-semibold text-red-700">EMERGENCY STOPPED</span>
              </div>
              <button
                onClick={() => resume.mutate()}
                disabled={resume.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                <CirclePlay className="w-4 h-4" />
                Resume
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-full">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm font-semibold text-green-700">AUTONOMOUS MODE ACTIVE</span>
              </div>
              <button
                onClick={() => setShowStopConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors"
              >
                <OctagonX className="w-4 h-4" />
                Emergency Stop
              </button>
            </>
          )}
        </div>
      </div>

      {/* Emergency Stop Confirmation Modal */}
      {showStopConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Emergency Stop</h3>
                <p className="text-sm text-muted-foreground">This will halt all autonomous operations</p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-5">
              <p className="text-sm text-red-700">
                This will immediately <strong>cancel all running tasks</strong>, empty the Celery queue, and prevent new jobs from starting.
                Use this only in emergencies.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowStopConfirm(false)}
                className="flex-1 px-4 py-2.5 border rounded-lg text-sm font-medium hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={() => emergencyStop.mutate()}
                disabled={emergencyStop.isPending}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {emergencyStop.isPending ? "Stopping..." : "🛑 Stop Everything"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: "AI Tasks Created", value: stats.ai_tasks || 0, icon: <Zap className="w-5 h-5 text-yellow-500" />, color: "yellow" },
          { label: "Blog Ideas", value: stats.blog_ideas || 0, icon: <BookOpen className="w-5 h-5 text-green-500" />, color: "green" },
          { label: "Backlink Opps", value: stats.backlink_opportunities || 0, icon: <Link2 className="w-5 h-5 text-orange-500" />, color: "orange" },
          { label: "Content Clusters", value: stats.content_clusters || 0, icon: <Search className="w-5 h-5 text-indigo-500" />, color: "indigo" },
          { label: "Crawls Done", value: stats.crawls_completed || 0, icon: <CheckCircle2 className="w-5 h-5 text-blue-500" />, color: "blue" },
        ].map((stat) => (
          <div key={stat.label} className="bg-card border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              {stat.icon}
              <span className="text-xs text-muted-foreground">total</span>
            </div>
            <div className="text-2xl font-bold">{stat.value.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Last 24h */}
      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl p-4">
        <h3 className="font-semibold text-indigo-900 mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4" /> Last 24 Hours Activity
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-2xl font-bold text-indigo-700">{last24h.blog_ideas_generated || 0}</div>
            <div className="text-sm text-indigo-600">Blog ideas generated</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-indigo-700">{last24h.backlinks_found || 0}</div>
            <div className="text-sm text-indigo-600">Backlink opps found</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-indigo-700">{last24h.tasks_created || 0}</div>
            <div className="text-sm text-indigo-600">AI tasks created</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Manual Triggers */}
        <div className="bg-card border rounded-xl p-5">
          <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <Play className="w-5 h-5 text-green-500" />
            Manual Task Triggers
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            All tasks also run automatically on schedule. Use these to trigger them immediately.
          </p>
          <div className="space-y-2">
            {Object.entries(TASK_NAMES).map(([key, name]) => (
              <div key={key} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-accent transition-colors">
                <span className="text-sm font-medium">{name}</span>
                <button
                  onClick={() => handleRun(key)}
                  disabled={runningTask === key}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {runningTask === key ? (
                    <><RefreshCw className="w-3 h-3 animate-spin" /> Running...</>
                  ) : (
                    <><Play className="w-3 h-3" /> Run Now</>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Schedule */}
        <div className="bg-card border rounded-xl p-5">
          <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-500" />
            Autonomous Schedule
          </h2>
          <div className="space-y-4">
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">⏱ Every Hour</div>
              <div className="space-y-1">
                {data?.config?.schedule?.hourly?.map((t: string) => (
                  <div key={t} className="flex items-center gap-2 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    {t.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">📅 Every Day</div>
              <div className="space-y-1">
                {data?.config?.schedule?.daily?.map((t: string) => (
                  <div key={t} className="flex items-center gap-2 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    {t.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">📊 Every Week</div>
              <div className="space-y-1">
                {data?.config?.schedule?.weekly?.map((t: string) => (
                  <div key={t} className="flex items-center gap-2 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                    {t.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Agents */}
      <div>
        <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
          <Bot className="w-5 h-5" /> AI Agents ({agents.length})
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map((agent: any) => (
            <div key={agent.name} className="bg-card border rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                {AGENT_ICONS[agent.name] || <Bot className="w-5 h-5 text-gray-400" />}
                <div>
                  <div className="font-semibold text-sm">{agent.name}</div>
                  <div className="text-xs text-muted-foreground">{agent.schedule}</div>
                </div>
                <div className="ml-auto">
                  <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">active</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-2">{agent.description}</p>
              <div className="flex flex-wrap gap-1">
                {(agent.capabilities || []).slice(0, 4).map((cap: string) => (
                  <span key={cap} className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground">
                    {cap.replace(/_/g, " ")}
                  </span>
                ))}
                {(agent.capabilities || []).length > 4 && (
                  <span className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground">
                    +{agent.capabilities.length - 4} more
                  </span>
                )}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                🤖 {agent.model}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
