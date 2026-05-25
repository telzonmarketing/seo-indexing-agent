"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useState } from "react";
import toast from "react-hot-toast";
import { BookOpen, Zap, TrendingUp, Search, Filter, RefreshCw, ExternalLink, FileText, Play } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  idea: "bg-blue-100 text-blue-700",
  brief: "bg-purple-100 text-purple-700",
  writing: "bg-yellow-100 text-yellow-700",
  review: "bg-orange-100 text-orange-700",
  published: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

const INTENT_COLORS: Record<string, string> = {
  informational: "bg-blue-50 text-blue-600",
  transactional: "bg-green-50 text-green-600",
  comparison: "bg-purple-50 text-purple-600",
  local: "bg-orange-50 text-orange-600",
  faq: "bg-cyan-50 text-cyan-600",
  ai_friendly: "bg-indigo-50 text-indigo-600",
};

export default function BlogIdeasPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [intentFilter, setIntentFilter] = useState("");
  const [selectedIdea, setSelectedIdea] = useState<any>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["blog-ideas", statusFilter, intentFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (intentFilter) params.set("search_intent", intentFilter);
      params.set("limit", "100");
      return api.get(`/blog-ideas?${params}`).then((r) => r.data);
    },
  });

  const generate = useMutation({
    mutationFn: () => api.post("/blog-ideas/generate", {}).then((r) => r.data),
    onSuccess: () => {
      toast.success("Blog idea generation started! Check back in ~1 minute.");
    },
    onError: () => toast.error("Failed to start generation"),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/blog-ideas/${id}/status`, { status }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blog-ideas"] });
      toast.success("Status updated");
    },
  });

  const generateBrief = useMutation({
    mutationFn: (id: string) =>
      api.post(`/blog-ideas/${id}/generate-brief`).then((r) => r.data),
    onSuccess: (data) => {
      setSelectedIdea(data.idea);
      toast.success("Content brief generated!");
      qc.invalidateQueries({ queryKey: ["blog-ideas"] });
    },
    onError: () => toast.error("Brief generation failed"),
  });

  const ideas = data?.ideas || [];

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-green-500" />
            Blog Ideas
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            AI-generated daily content ideas from PAA, autosuggest, competitor analysis & trends
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm hover:bg-accent"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            <Zap className="w-4 h-4" />
            {generate.isPending ? "Generating..." : "Generate Now"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Ideas", value: ideas.length, color: "text-blue-600" },
          { label: "AI Friendly", value: ideas.filter((i: any) => i.is_ai_friendly).length, color: "text-indigo-600" },
          { label: "Content Gaps", value: ideas.filter((i: any) => i.content_gap).length, color: "text-orange-600" },
          { label: "High Priority (75+)", value: ideas.filter((i: any) => i.priority_score >= 75).length, color: "text-green-600" },
        ].map((s) => (
          <div key={s.label} className="bg-card border rounded-xl p-4 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm bg-background"
        >
          <option value="">All Statuses</option>
          {["idea", "brief", "writing", "review", "published", "rejected"].map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <select
          value={intentFilter}
          onChange={(e) => setIntentFilter(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm bg-background"
        >
          <option value="">All Intents</option>
          {["informational", "transactional", "comparison", "local", "faq", "ai_friendly"].map((i) => (
            <option key={i} value={i}>{i.replace("_", " ").charAt(0).toUpperCase() + i.replace("_", " ").slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Ideas Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : ideas.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No blog ideas yet</p>
          <p className="text-sm">Click "Generate Now" to create AI-powered blog ideas for your clients.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {ideas.map((idea: any) => (
            <div
              key={idea.id}
              className="bg-card border rounded-xl p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedIdea(idea)}
            >
              {/* Priority badge */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex gap-1.5 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[idea.status] || "bg-gray-100 text-gray-600"}`}>
                    {idea.status}
                  </span>
                  {idea.is_ai_friendly && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">🤖 AI-friendly</span>
                  )}
                  {idea.content_gap && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">📊 Gap</span>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-2 shrink-0">
                  <TrendingUp className={`w-3.5 h-3.5 ${idea.priority_score >= 75 ? "text-green-500" : idea.priority_score >= 50 ? "text-yellow-500" : "text-red-400"}`} />
                  <span className="text-xs font-bold">{idea.priority_score}</span>
                </div>
              </div>

              {/* Title */}
              <h3 className="font-semibold text-sm leading-snug mb-2">{idea.title}</h3>

              {/* Keyword */}
              {idea.target_keyword && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                  <Search className="w-3 h-3" />
                  <span className="truncate">{idea.target_keyword}</span>
                </div>
              )}

              {/* Intent + Source */}
              <div className="flex gap-2 mb-3">
                {idea.search_intent && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${INTENT_COLORS[idea.search_intent] || "bg-gray-100 text-gray-600"}`}>
                    {idea.search_intent.replace("_", " ")}
                  </span>
                )}
                {idea.source && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {idea.source.replace("_", " ")}
                  </span>
                )}
              </div>

              {/* AI Reasoning */}
              {idea.ai_reasoning && (
                <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{idea.ai_reasoning}</p>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t">
                <button
                  onClick={(e) => { e.stopPropagation(); generateBrief.mutate(idea.id); }}
                  disabled={generateBrief.isPending}
                  className="flex-1 text-xs py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 font-medium transition-colors"
                >
                  {generateBrief.isPending ? "..." : "Generate Brief"}
                </button>
                <select
                  value={idea.status}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => updateStatus.mutate({ id: idea.id, status: e.target.value })}
                  className="flex-1 text-xs border rounded-lg px-2 bg-background"
                >
                  {["idea", "brief", "writing", "review", "published", "rejected"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedIdea && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedIdea(null)}>
          <div className="bg-background rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h2 className="font-bold text-lg leading-snug pr-4">{selectedIdea.title}</h2>
              <button onClick={() => setSelectedIdea(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>

            {selectedIdea.target_keyword && (
              <div className="text-sm text-muted-foreground mb-4">
                🎯 <strong>Target keyword:</strong> {selectedIdea.target_keyword}
              </div>
            )}

            {selectedIdea.suggested_outline?.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold text-sm mb-2">📋 Suggested Outline</h3>
                <ol className="space-y-1 pl-4">
                  {selectedIdea.suggested_outline.map((h: string, i: number) => (
                    <li key={i} className="text-sm text-muted-foreground list-decimal">{h}</li>
                  ))}
                </ol>
              </div>
            )}

            {selectedIdea.suggested_faqs?.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold text-sm mb-2">❓ Suggested FAQs</h3>
                <ul className="space-y-1">
                  {selectedIdea.suggested_faqs.map((q: string, i: number) => (
                    <li key={i} className="text-sm text-muted-foreground">• {q}</li>
                  ))}
                </ul>
              </div>
            )}

            {selectedIdea.content_brief && Object.keys(selectedIdea.content_brief).length > 0 && (
              <div className="mb-4 bg-muted/50 rounded-xl p-4">
                <h3 className="font-semibold text-sm mb-3">📄 Content Brief</h3>
                <div className="space-y-2 text-sm">
                  {selectedIdea.content_brief.word_count_target && (
                    <p><strong>Word Count:</strong> {selectedIdea.content_brief.word_count_target}+</p>
                  )}
                  {selectedIdea.content_brief.meta_title && (
                    <p><strong>Meta Title:</strong> {selectedIdea.content_brief.meta_title}</p>
                  )}
                  {selectedIdea.content_brief.meta_description && (
                    <p><strong>Meta Description:</strong> {selectedIdea.content_brief.meta_description}</p>
                  )}
                  {selectedIdea.content_brief.schema_markup && (
                    <p><strong>Schema:</strong> {selectedIdea.content_brief.schema_markup}</p>
                  )}
                  {selectedIdea.content_brief.ai_search_optimization && (
                    <p><strong>AI Search:</strong> {selectedIdea.content_brief.ai_search_optimization}</p>
                  )}
                </div>
              </div>
            )}

            <button
              onClick={() => generateBrief.mutate(selectedIdea.id)}
              disabled={generateBrief.isPending}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90"
            >
              {generateBrief.isPending ? "Generating..." : "Generate Full Content Brief"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
