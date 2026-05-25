"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useState } from "react";
import toast from "react-hot-toast";
import { Link2, ExternalLink, RefreshCw, Zap, Shield, TrendingUp, CheckCircle2 } from "lucide-react";

const TYPE_COLORS: Record<string, string> = {
  directory: "bg-blue-100 text-blue-700",
  guest_post: "bg-purple-100 text-purple-700",
  forum: "bg-orange-100 text-orange-700",
  citation: "bg-green-100 text-green-700",
  profile: "bg-cyan-100 text-cyan-700",
  resource: "bg-yellow-100 text-yellow-700",
};

const STATUS_COLORS: Record<string, string> = {
  opportunity: "bg-blue-50 text-blue-600 border-blue-200",
  submitted: "bg-yellow-50 text-yellow-600 border-yellow-200",
  pending: "bg-orange-50 text-orange-600 border-orange-200",
  acquired: "bg-green-50 text-green-600 border-green-200",
  rejected: "bg-red-50 text-red-600 border-red-200",
};

const DA_COLOR = (da: number) => {
  if (da >= 70) return "text-green-600 bg-green-50";
  if (da >= 40) return "text-yellow-600 bg-yellow-50";
  return "text-red-600 bg-red-50";
};

export default function BacklinksPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [minDA, setMinDA] = useState(0);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["backlinks", statusFilter, typeFilter, minDA],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("type", typeFilter);
      if (minDA) params.set("min_da", String(minDA));
      params.set("limit", "100");
      return api.get(`/backlinks?${params}`).then((r) => r.data);
    },
  });

  const { data: statsData } = useQuery({
    queryKey: ["backlinks-stats"],
    queryFn: () => api.get("/backlinks/stats").then((r) => r.data),
  });

  const scan = useMutation({
    mutationFn: () => api.post("/backlinks/scan", {}).then((r) => r.data),
    onSuccess: () => {
      toast.success("Backlink scan started! Results in ~1 minute.");
      qc.invalidateQueries({ queryKey: ["backlinks"] });
    },
    onError: () => toast.error("Scan failed"),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/backlinks/${id}/status`, { status }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backlinks"] });
      qc.invalidateQueries({ queryKey: ["backlinks-stats"] });
      toast.success("Status updated");
    },
  });

  const opps = data?.opportunities || [];
  const stats = statsData || {};

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Link2 className="w-6 h-6 text-orange-500" />
            Backlink Opportunities
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            AI-discovered link building prospects from 30+ directories, forums, and guest post sites
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm hover:bg-accent">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button
            onClick={() => scan.mutate()}
            disabled={scan.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            <Zap className="w-4 h-4" />
            {scan.isPending ? "Scanning..." : "Scan Now"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border rounded-xl p-4">
          <div className="text-2xl font-bold text-blue-600">{stats.total || 0}</div>
          <div className="text-xs text-muted-foreground mt-1">Total Opportunities</div>
        </div>
        <div className="bg-card border rounded-xl p-4">
          <div className="text-2xl font-bold text-green-600">{stats.by_status?.acquired || 0}</div>
          <div className="text-xs text-muted-foreground mt-1">Links Acquired</div>
        </div>
        <div className="bg-card border rounded-xl p-4">
          <div className="text-2xl font-bold text-purple-600">{stats.high_da_count || 0}</div>
          <div className="text-xs text-muted-foreground mt-1">High DA (70+)</div>
        </div>
        <div className="bg-card border rounded-xl p-4">
          <div className="text-2xl font-bold text-orange-600">{stats.avg_da || 0}</div>
          <div className="text-xs text-muted-foreground mt-1">Avg Domain Authority</div>
        </div>
      </div>

      {/* Type breakdown */}
      {stats.by_type && (
        <div className="flex gap-2 flex-wrap">
          {Object.entries(stats.by_type).map(([type, count]) => (
            <button
              key={type}
              onClick={() => setTypeFilter(typeFilter === type ? "" : type)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${typeFilter === type ? "bg-primary text-primary-foreground border-primary" : "bg-card border hover:bg-accent"}`}
            >
              <span className={`text-xs px-1.5 py-0.5 rounded ${TYPE_COLORS[type] || "bg-gray-100 text-gray-600"}`}>{type}</span>
              <span>{String(count)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm bg-background"
        >
          <option value="">All Statuses</option>
          {["opportunity", "submitted", "pending", "acquired", "rejected"].map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <select
          value={minDA}
          onChange={(e) => setMinDA(Number(e.target.value))}
          className="border rounded-lg px-3 py-1.5 text-sm bg-background"
        >
          <option value={0}>Any DA</option>
          <option value={40}>DA 40+</option>
          <option value={60}>DA 60+</option>
          <option value={70}>DA 70+</option>
          <option value={80}>DA 80+</option>
        </select>
        <span className="text-sm text-muted-foreground ml-auto">{opps.length} opportunities</span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : opps.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Link2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No backlink opportunities yet</p>
          <p className="text-sm">Click "Scan Now" to discover link building opportunities.</p>
        </div>
      ) : (
        <div className="bg-card border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Platform</th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Type</th>
                <th className="text-center px-4 py-3 font-semibold text-xs uppercase tracking-wide">DA</th>
                <th className="text-center px-4 py-3 font-semibold text-xs uppercase tracking-wide">Relevance</th>
                <th className="text-center px-4 py-3 font-semibold text-xs uppercase tracking-wide">Dofollow</th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Notes</th>
                <th className="text-center px-4 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
                <th className="text-center px-4 py-3 font-semibold text-xs uppercase tracking-wide">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {opps.map((opp: any, idx: number) => (
                <tr key={opp.id} className={idx % 2 === 0 ? "" : "bg-muted/20"}>
                  <td className="px-4 py-3 font-medium">{opp.platform || opp.source_domain}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[opp.type] || "bg-gray-100 text-gray-600"}`}>
                      {opp.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${DA_COLOR(opp.domain_authority || 0)}`}>
                      {opp.domain_authority || 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${opp.relevance_score || 0}%` }} />
                      </div>
                      <span className="text-xs">{opp.relevance_score || 0}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {opp.is_dofollow ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                    ) : (
                      <span className="text-xs text-muted-foreground">no</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">{opp.notes || opp.ai_reasoning || "—"}</td>
                  <td className="px-4 py-3">
                    <select
                      value={opp.status}
                      onChange={(e) => updateStatus.mutate({ id: opp.id, status: e.target.value })}
                      className={`text-xs px-2 py-1 rounded-full border font-medium ${STATUS_COLORS[opp.status] || ""}`}
                    >
                      {["opportunity", "submitted", "pending", "acquired", "rejected"].map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {opp.source_url && (
                      <a href={opp.source_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                        <ExternalLink className="w-4 h-4 text-muted-foreground hover:text-primary mx-auto" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
