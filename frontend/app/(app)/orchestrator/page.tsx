"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useState } from "react";
import {
  Activity, Cpu, GitBranch, Play, RefreshCw, Zap,
  CheckCircle, AlertTriangle, Clock, BarChart3, Bot,
  ArrowRight, Layers, Settings
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrchestratorStatus {
  timestamp: string;
  health_score: number;
  status: string;
  queue: { depth: number; crawl_queue: number; brain_queue: number };
  active_crawls: number;
  active_rules: number;
  active_websites: number;
  activity_last_1h: number;
  agents_online: number;
  recent_decisions: Decision[];
}

interface Decision {
  timestamp: string;
  decision: string;
  agent: string;
  task: string;
  priority: string;
}

interface Agent {
  id: string;
  name: string;
  icon: string;
  description: string;
  capabilities: string[];
  queue: string;
  schedule: string;
  priority: number;
  status: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(ts: string): string {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  return `${Math.round(diff / 3600)}h ago`;
}

function statusColor(status: string): string {
  if (status === "healthy") return "text-green-400";
  if (status === "degraded") return "text-yellow-400";
  return "text-red-400";
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-green-400";
  if (score >= 50) return "text-yellow-400";
  return "text-red-400";
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-300",
  high: "bg-orange-500/20 text-orange-300",
  normal: "bg-blue-500/20 text-blue-300",
  low: "bg-slate-500/20 text-slate-400",
};

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({ icon: Icon, label, value, sub, color = "blue" }: {
  icon: any; label: string; value: string | number; sub?: string; color?: string;
}) {
  const colorMap: Record<string, string> = {
    blue: "text-blue-400 bg-blue-500/10",
    green: "text-green-400 bg-green-500/10",
    yellow: "text-yellow-400 bg-yellow-500/10",
    purple: "text-purple-400 bg-purple-500/10",
    red: "text-red-400 bg-red-500/10",
  };
  return (
    <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${colorMap[color]}`}>
          <Icon size={14} className={colorMap[color].split(" ")[0]} />
        </div>
        <span className="text-xs text-slate-400 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OrchestratorPage() {
  const qc = useQueryClient();
  const [dispatchTask, setDispatchTask] = useState("");

  const { data: status } = useQuery<OrchestratorStatus>({
    queryKey: ["orchestrator-status"],
    queryFn: () => api.get("/api/orchestrator/status").then(r => r.data),
    refetchInterval: 8000,
  });

  const { data: agentsData } = useQuery<{ agents: Agent[] }>({
    queryKey: ["orchestrator-agents"],
    queryFn: () => api.get("/api/orchestrator/agents").then(r => r.data),
    refetchInterval: 15000,
  });

  const { data: queueData } = useQuery({
    queryKey: ["orchestrator-queue"],
    queryFn: () => api.get("/api/orchestrator/queue").then(r => r.data),
    refetchInterval: 5000,
  });

  const rebalanceMutation = useMutation({
    mutationFn: () => api.post("/api/orchestrator/balance"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orchestrator-status"] }),
  });

  const dispatchMutation = useMutation({
    mutationFn: (task: string) =>
      api.post("/api/orchestrator/dispatch", { task, priority: "normal" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orchestrator-queue"] }),
  });

  const healthScore = status?.health_score ?? 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-xl">
              <GitBranch size={24} className="text-indigo-400" />
            </div>
            Orchestrator Engine
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Central AI coordination — routing, balancing, event dispatching
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => rebalanceMutation.mutate()}
            disabled={rebalanceMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white transition"
          >
            <RefreshCw size={14} className={rebalanceMutation.isPending ? "animate-spin" : ""} />
            Rebalance Queue
          </button>
        </div>
      </div>

      {/* Health Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
        <div className="col-span-2 bg-slate-800/60 rounded-xl border border-slate-700 p-4 flex items-center gap-4">
          <div className="relative w-16 h-16">
            <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
              <circle cx="32" cy="32" r="26" fill="none" stroke="#1e293b" strokeWidth="8" />
              <circle
                cx="32" cy="32" r="26" fill="none"
                stroke={healthScore >= 80 ? "#22c55e" : healthScore >= 50 ? "#eab308" : "#ef4444"}
                strokeWidth="8"
                strokeDasharray={`${(healthScore / 100) * 163.4} 163.4`}
                strokeLinecap="round"
              />
            </svg>
            <span className={`absolute inset-0 flex items-center justify-center text-lg font-bold ${scoreColor(healthScore)}`}>
              {healthScore}
            </span>
          </div>
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-wide">System Health</div>
            <div className={`text-lg font-bold capitalize ${statusColor(status?.status ?? "healthy")}`}>
              {status?.status ?? "healthy"}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {status?.agents_online ?? 9} agents online
            </div>
          </div>
        </div>

        <MetricCard icon={Zap} label="Queue Depth" value={status?.queue.depth ?? 0}
          sub="tasks waiting" color={status?.queue.depth ?? 0 > 20 ? "yellow" : "green"} />
        <MetricCard icon={Activity} label="Active Crawls" value={status?.active_crawls ?? 0}
          sub="running" color="blue" />
        <MetricCard icon={Settings} label="Active Rules" value={status?.active_rules ?? 0}
          sub="IF/THEN rules" color="purple" />
        <MetricCard icon={BarChart3} label="Activity / 1h" value={status?.activity_last_1h ?? 0}
          sub="events" color="green" />
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Left: Agent Grid */}
        <div className="col-span-12 lg:col-span-8">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-4 flex items-center gap-2">
            <Bot size={14} />
            AI Agents
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(agentsData?.agents ?? []).map(agent => (
              <div key={agent.id}
                className="bg-slate-800/60 rounded-xl border border-slate-700 p-4 hover:border-slate-500 transition">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{agent.icon}</span>
                    <div>
                      <div className="font-semibold text-white text-sm">{agent.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{agent.schedule}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-xs text-green-400">active</span>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-3">{agent.description}</p>
                <div className="flex flex-wrap gap-1 mt-3">
                  {agent.capabilities.slice(0, 3).map(cap => (
                    <span key={cap}
                      className="px-1.5 py-0.5 bg-slate-700 text-slate-300 text-xs rounded">
                      {cap.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700">
                  <span className="text-xs text-slate-500">Queue: {agent.queue}</span>
                  <button
                    onClick={() => dispatchMutation.mutate(agent.capabilities[0])}
                    className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    <Play size={11} /> Run now
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Queue + Timeline */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          {/* Queue state */}
          <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-4">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-4 flex items-center gap-2">
              <Layers size={14} /> Queue State
            </h3>
            <div className="space-y-3">
              {Object.entries(queueData?.queues ?? {}).map(([name, info]: [string, any]) => (
                <div key={name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300 font-mono">{name}</span>
                    <span className={
                      info.pressure === "high" ? "text-red-400" :
                        info.pressure === "medium" ? "text-yellow-400" : "text-green-400"
                    }>
                      {info.depth} tasks
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        info.pressure === "high" ? "bg-red-500" :
                          info.pressure === "medium" ? "bg-yellow-500" : "bg-green-500"
                      }`}
                      style={{ width: `${Math.min(100, (info.depth / 20) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dispatch Task */}
          <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-4">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Zap size={14} /> Dispatch Task
            </h3>
            <select
              value={dispatchTask}
              onChange={e => setDispatchTask(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white mb-3 focus:outline-none focus:border-indigo-500"
            >
              <option value="">Select a task...</option>
              {Object.entries(queueData?.task_routes ?? {}).map(([task, agent]: [string, any]) => (
                <option key={task} value={task}>{task.replace(/_/g, " ")} → {agent}</option>
              ))}
            </select>
            <button
              onClick={() => dispatchTask && dispatchMutation.mutate(dispatchTask)}
              disabled={!dispatchTask || dispatchMutation.isPending}
              className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-sm text-white transition"
            >
              <Play size={14} />
              {dispatchMutation.isPending ? "Dispatching..." : "Dispatch"}
            </button>
          </div>

          {/* Decision timeline */}
          <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-4">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-4 flex items-center gap-2">
              <Clock size={14} /> Recent Decisions
            </h3>
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {(status?.recent_decisions ?? []).length === 0 ? (
                <p className="text-xs text-slate-500">No decisions recorded yet</p>
              ) : (
                (status?.recent_decisions ?? []).map((d, i) => (
                  <div key={i} className="flex gap-2">
                    <ArrowRight size={12} className="text-indigo-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-slate-300">{d.decision}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                        <span>{d.agent}</span>
                        <span>·</span>
                        <span className={`px-1 rounded text-xs ${PRIORITY_COLORS[d.priority] || PRIORITY_COLORS.normal}`}>
                          {d.priority}
                        </span>
                        <span>·</span>
                        <span>{timeAgo(d.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
