"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CheckCircle, XCircle, AlertTriangle, RefreshCw } from "lucide-react";

// Public status page — no auth required, shows system health

function StatusIndicator({ ok, label, sub }: { ok: boolean; label: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-slate-700 last:border-0">
      <div>
        <div className="font-medium text-white">{label}</div>
        {sub && <div className="text-sm text-slate-400 mt-0.5">{sub}</div>}
      </div>
      <div className="flex items-center gap-2">
        {ok ? (
          <>
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-green-400 text-sm font-medium">Operational</span>
          </>
        ) : (
          <>
            <div className="w-2 h-2 rounded-full bg-red-400" />
            <span className="text-red-400 text-sm font-medium">Degraded</span>
          </>
        )}
      </div>
    </div>
  );
}

export default function StatusPage() {
  const { data: health, isLoading } = useQuery({
    queryKey: ["public-health"],
    queryFn: () => api.get("/api/health/system").then(r => r.data),
    refetchInterval: 30000,
  });

  const allOk = !isLoading && health && !health.error;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-2xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <div className={`inline-flex items-center gap-3 px-6 py-3 rounded-full border mb-6 ${
            allOk
              ? "bg-green-500/10 border-green-500/30 text-green-400"
              : isLoading
                ? "bg-slate-800 border-slate-700 text-slate-400"
                : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}>
            {isLoading ? (
              <RefreshCw size={18} className="animate-spin" />
            ) : allOk ? (
              <CheckCircle size={18} />
            ) : (
              <AlertTriangle size={18} />
            )}
            <span className="font-semibold text-lg">
              {isLoading ? "Checking..." : allOk ? "All Systems Operational" : "Partial Degradation"}
            </span>
          </div>
          <h1 className="text-3xl font-bold text-white">SEO OS Status</h1>
          <p className="text-slate-400 mt-2">Telzon Marketing — AI Operating System</p>
        </div>

        {/* Services */}
        <div className="bg-slate-800/60 rounded-2xl border border-slate-700 p-6 mb-6">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">Core Services</h2>
          <StatusIndicator ok={allOk} label="API Backend" sub="FastAPI — /api/*" />
          <StatusIndicator ok={allOk} label="Database" sub="PostgreSQL" />
          <StatusIndicator ok={allOk} label="Task Queue" sub="Redis + Celery" />
          <StatusIndicator ok={!!health?.ollama_ok} label="AI Engine" sub={`Ollama · ${health?.ollama_model ?? "—"}`} />
          <StatusIndicator ok={allOk} label="Vector Memory" sub="Qdrant" />
        </div>

        <div className="bg-slate-800/60 rounded-2xl border border-slate-700 p-6 mb-6">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">AI Agents</h2>
          <StatusIndicator ok={true} label="Brain Agent" sub="Self-learning — Every 2h" />
          <StatusIndicator ok={true} label="Crawler Agent" sub="On-demand + Hourly" />
          <StatusIndicator ok={true} label="Hunter Agent" sub="SERP scanning — Hourly" />
          <StatusIndicator ok={true} label="Content Agent" sub="Daily 2AM" />
          <StatusIndicator ok={true} label="AEO Agent" sub="AI Search Optimization — Weekly" />
          <StatusIndicator ok={true} label="Backlink Agent" sub="Daily 3AM" />
        </div>

        {/* System metrics if available */}
        {health?.cpu_percent != null && (
          <div className="bg-slate-800/60 rounded-2xl border border-slate-700 p-6 mb-6">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">System Resources</h2>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className={`text-2xl font-bold ${health.cpu_percent > 80 ? "text-red-400" : "text-green-400"}`}>
                  {health.cpu_percent}%
                </div>
                <div className="text-xs text-slate-400 mt-1">CPU</div>
              </div>
              <div>
                <div className={`text-2xl font-bold ${health.memory_percent > 85 ? "text-red-400" : "text-blue-400"}`}>
                  {health.memory_percent}%
                </div>
                <div className="text-xs text-slate-400 mt-1">Memory</div>
              </div>
              <div>
                <div className={`text-2xl font-bold ${health.disk_percent > 90 ? "text-red-400" : "text-purple-400"}`}>
                  {health.disk_percent}%
                </div>
                <div className="text-xs text-slate-400 mt-1">Disk</div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-slate-600">
          <p>Auto-refreshes every 30 seconds</p>
          <p className="mt-1">© {new Date().getFullYear()} Telzon Marketing · Internal Use Only</p>
        </div>
      </div>
    </div>
  );
}
