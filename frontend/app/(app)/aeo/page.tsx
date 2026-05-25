"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { aeoApi, websitesApi } from "@/lib/api";
import { useState } from "react";
import toast from "react-hot-toast";
import {
  Bot, Globe, Zap, RefreshCw, Copy, CheckCircle, XCircle,
  AlertTriangle, TrendingUp, FileText, Search, ChevronRight,
  Sparkles, Eye, Code2, BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? "bg-green-100 text-green-700 border-green-200" :
    score >= 60 ? "bg-blue-100 text-blue-700 border-blue-200" :
    score >= 40 ? "bg-yellow-100 text-yellow-700 border-yellow-200" :
    "bg-red-100 text-red-700 border-red-200";
  const grade = score >= 80 ? "A" : score >= 60 ? "B" : score >= 40 ? "C" : "D";
  return (
    <div className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-sm font-bold", color)}>
      <span className="text-base">{grade}</span>
      <span>{score}/100</span>
    </div>
  );
}

function CheckRow({ label, ok, note }: { label: string; ok: boolean; note?: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b last:border-0">
      {ok ? (
        <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
      )}
      <div>
        <p className="text-sm font-medium">{label}</p>
        {note && <p className="text-xs text-muted-foreground mt-0.5">{note}</p>}
      </div>
    </div>
  );
}

export default function AEOPage() {
  const qc = useQueryClient();
  const [selectedWebsite, setSelectedWebsite] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"audit" | "llms" | "opportunities">("audit");
  const [copied, setCopied] = useState(false);

  const { data: websitesData } = useQuery({
    queryKey: ["websites-aeo"],
    queryFn: () => websitesApi.list().then(r => r.data),
  });
  const websites: any[] = Array.isArray(websitesData) ? websitesData : [];
  const activeWebsite = websites.find(w => w.id === selectedWebsite) || websites[0];
  const websiteId = activeWebsite?.id;

  const { data: scoreData } = useQuery({
    queryKey: ["aeo-score", websiteId],
    queryFn: () => aeoApi.score(websiteId!).then(r => r.data),
    enabled: !!websiteId,
  });

  const { data: auditData, isLoading: auditLoading, refetch: refetchAudit } = useQuery({
    queryKey: ["aeo-audit", websiteId],
    queryFn: () => aeoApi.audit(websiteId!).then(r => r.data),
    enabled: !!websiteId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: llmsData, isLoading: llmsLoading, refetch: refetchLlms } = useQuery({
    queryKey: ["aeo-llms", websiteId],
    queryFn: () => aeoApi.llmsTxt(websiteId!).then(r => r.data),
    enabled: !!websiteId && activeTab === "llms",
    staleTime: 10 * 60 * 1000,
  });

  const { data: oppsData, isLoading: oppsLoading } = useQuery({
    queryKey: ["aeo-opportunities", websiteId],
    queryFn: () => aeoApi.opportunities(websiteId!).then(r => r.data),
    enabled: !!websiteId && activeTab === "opportunities",
    staleTime: 5 * 60 * 1000,
  });

  const handleCopyLlms = async () => {
    if (!llmsData?.llms_txt) return;
    await navigator.clipboard.writeText(llmsData.llms_txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied to clipboard!");
  };

  const tabs = [
    { id: "audit", label: "AEO Audit", icon: Search },
    { id: "llms", label: "llms.txt Generator", icon: FileText },
    { id: "opportunities", label: "AI Opportunities", icon: Sparkles },
  ] as const;

  return (
    <div className="flex-1 space-y-6 p-6 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">AEO Engine</h1>
            <p className="text-sm text-muted-foreground">Answer Engine Optimization — Get cited by ChatGPT, Perplexity & Gemini</p>
          </div>
        </div>
        {scoreData && <ScoreBadge score={scoreData.aeo_score || 0} />}
      </div>

      {/* Website selector */}
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
          <Bot className="h-12 w-12 mb-3 opacity-40" />
          <h3 className="font-semibold mb-1">No websites yet</h3>
          <p className="text-sm">Add a website to start AEO optimization</p>
        </div>
      ) : (
        <>
          {/* AI Visibility Score Card */}
          {auditData && (
            <div className="grid gap-4 sm:grid-cols-4">
              {[
                {
                  label: "AEO Score",
                  value: auditData.aeo_score || scoreData?.aeo_score || 0,
                  suffix: "/100",
                  color: "text-violet-600",
                  icon: <Bot className="h-4 w-4" />,
                },
                {
                  label: "AI Visibility",
                  value: auditData.visibility?.score || 0,
                  suffix: "/100",
                  color: "text-blue-600",
                  icon: <Eye className="h-4 w-4" />,
                },
                {
                  label: "FAQ Schemas",
                  value: auditData.faq_count || 0,
                  suffix: " found",
                  color: "text-green-600",
                  icon: <BookOpen className="h-4 w-4" />,
                },
                {
                  label: "Recommendations",
                  value: auditData.recommendations?.length || 0,
                  suffix: " actions",
                  color: "text-orange-600",
                  icon: <TrendingUp className="h-4 w-4" />,
                },
              ].map(s => (
                <div key={s.label} className="rounded-xl border bg-card p-4">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                    {s.icon} {s.label}
                  </div>
                  <div className={cn("text-2xl font-bold tabular-nums", s.color)}>
                    {s.value}<span className="text-sm font-normal text-muted-foreground">{s.suffix}</span>
                  </div>
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
                    ? "border-violet-500 text-violet-600"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === "audit" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Live AEO signals scan — checks AI discoverability for {activeWebsite?.domain}
                </p>
                <button
                  onClick={() => refetchAudit()}
                  disabled={auditLoading}
                  className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-accent transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", auditLoading && "animate-spin")} />
                  {auditLoading ? "Scanning..." : "Re-scan"}
                </button>
              </div>

              {auditLoading ? (
                <div className="flex flex-col items-center py-16 text-muted-foreground">
                  <RefreshCw className="h-8 w-8 animate-spin mb-3 text-violet-400" />
                  <p className="font-medium">Running AEO Audit...</p>
                  <p className="text-sm mt-1">Checking AI visibility signals, schema, structured data</p>
                </div>
              ) : auditData ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  {/* AI Signals */}
                  <div className="rounded-xl border bg-card p-5">
                    <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <Eye className="h-4 w-4 text-violet-500" /> AI Visibility Signals
                    </h3>
                    {auditData.visibility?.signals ? (
                      Object.entries(auditData.visibility.signals).map(([key, val]) => (
                        <CheckRow
                          key={key}
                          label={key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                          ok={!!val}
                        />
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No signal data — crawl the website first</p>
                    )}
                  </div>

                  {/* Recommendations */}
                  <div className="rounded-xl border bg-card p-5">
                    <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <Zap className="h-4 w-4 text-orange-500" /> Priority Actions
                    </h3>
                    {auditData.recommendations?.length ? (
                      <div className="space-y-2">
                        {auditData.recommendations.slice(0, 8).map((rec: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 py-1">
                            <ChevronRight className="h-3.5 w-3.5 text-violet-500 mt-0.5 shrink-0" />
                            <p className="text-sm">{rec}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center py-6 text-muted-foreground">
                        <CheckCircle className="h-6 w-6 text-green-400 mb-2" />
                        <p className="text-sm">No critical issues found</p>
                      </div>
                    )}
                  </div>

                  {/* Schema Check */}
                  {auditData.schema_types && (
                    <div className="rounded-xl border bg-card p-5">
                      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                        <Code2 className="h-4 w-4 text-blue-500" /> Schema Types Detected
                      </h3>
                      {auditData.schema_types.length ? (
                        <div className="flex flex-wrap gap-2">
                          {auditData.schema_types.map((s: string) => (
                            <span key={s} className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-md font-medium">
                              {s}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-orange-600 text-sm">
                          <AlertTriangle className="h-4 w-4" />
                          No schema markup detected — add FAQ, HowTo, Article schema
                        </div>
                      )}
                    </div>
                  )}

                  {/* AI Competitor Advantage */}
                  {auditData.ai_content_tips && (
                    <div className="rounded-xl border bg-card p-5">
                      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-fuchsia-500" /> AI Content Tips
                      </h3>
                      <div className="space-y-2">
                        {auditData.ai_content_tips.slice(0, 5).map((tip: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 py-1">
                            <span className="text-fuchsia-500 font-bold text-xs mt-1">{i + 1}.</span>
                            <p className="text-sm">{tip}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center py-16 text-muted-foreground border-2 border-dashed rounded-xl">
                  <Bot className="h-10 w-10 mb-3 opacity-40" />
                  <p className="font-medium">Click Re-scan to run an AEO audit</p>
                  <p className="text-sm mt-1">Analyzes AI visibility signals, structured data, and content quality</p>
                </div>
              )}
            </div>
          )}

          {activeTab === "llms" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Generate an <code className="bg-muted px-1 py-0.5 rounded text-xs">llms.txt</code> file to help AI models understand your website.
                    Place it at the root of your domain.
                  </p>
                </div>
                <button
                  onClick={() => refetchLlms()}
                  disabled={llmsLoading}
                  className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-accent transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", llmsLoading && "animate-spin")} />
                  Regenerate
                </button>
              </div>

              {llmsLoading ? (
                <div className="flex flex-col items-center py-16 text-muted-foreground">
                  <RefreshCw className="h-8 w-8 animate-spin mb-3 text-violet-400" />
                  <p className="font-medium">Generating llms.txt...</p>
                  <p className="text-sm mt-1">Analyzing crawl data and structuring for AI consumption</p>
                </div>
              ) : llmsData?.llms_txt ? (
                <div className="rounded-xl border bg-card overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <FileText className="h-4 w-4 text-violet-500" />
                      /llms.txt — {activeWebsite?.domain}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {llmsData.llms_txt.length.toLocaleString()} chars
                      </span>
                      <button
                        onClick={handleCopyLlms}
                        className="flex items-center gap-1.5 text-xs bg-violet-600 text-white px-3 py-1.5 rounded-md hover:bg-violet-700 transition-colors"
                      >
                        {copied ? <CheckCircle className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </div>
                  <pre className="p-4 text-xs font-mono whitespace-pre-wrap overflow-auto max-h-[480px] leading-relaxed">
                    {llmsData.llms_txt}
                  </pre>
                </div>
              ) : (
                <div className="flex flex-col items-center py-16 text-muted-foreground border-2 border-dashed rounded-xl">
                  <FileText className="h-10 w-10 mb-3 opacity-40" />
                  <p className="font-medium">No crawl data available</p>
                  <p className="text-sm mt-1">Crawl the website first, then generate llms.txt</p>
                </div>
              )}

              {/* Instructions */}
              <div className="rounded-xl border bg-card p-5">
                <h3 className="font-semibold text-sm mb-3">How to use llms.txt</h3>
                <ol className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2"><span className="font-bold text-foreground">1.</span> Copy the generated content above</li>
                  <li className="flex gap-2"><span className="font-bold text-foreground">2.</span> Create a file at the root of your website: <code className="bg-muted px-1 rounded">/llms.txt</code></li>
                  <li className="flex gap-2"><span className="font-bold text-foreground">3.</span> Verify it's accessible at <code className="bg-muted px-1 rounded">https://{activeWebsite?.domain}/llms.txt</code></li>
                  <li className="flex gap-2"><span className="font-bold text-foreground">4.</span> AI crawlers like ChatGPT, Perplexity, and Claude will use this to understand your site</li>
                </ol>
              </div>
            </div>
          )}

          {activeTab === "opportunities" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                AI search opportunity types — content formats that get cited by ChatGPT, Perplexity, and Gemini
              </p>

              {oppsLoading ? (
                <div className="flex flex-col items-center py-16 text-muted-foreground">
                  <RefreshCw className="h-8 w-8 animate-spin mb-3 text-violet-400" />
                  <p className="font-medium">Analyzing opportunities...</p>
                </div>
              ) : oppsData?.opportunities?.length ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {oppsData.opportunities.map((opp: any, i: number) => (
                    <div key={i} className="rounded-xl border bg-card p-4 hover:shadow-sm transition-shadow">
                      <div className="flex items-center justify-between mb-2">
                        <span className={cn(
                          "text-xs font-semibold px-2 py-0.5 rounded-full",
                          opp.priority === "high" ? "bg-red-100 text-red-700" :
                          opp.priority === "medium" ? "bg-yellow-100 text-yellow-700" :
                          "bg-gray-100 text-gray-600"
                        )}>
                          {opp.priority || "medium"} priority
                        </span>
                      </div>
                      <h4 className="font-semibold text-sm mb-1">{opp.type || opp.opportunity_type}</h4>
                      <p className="text-xs text-muted-foreground mb-3">{opp.description}</p>
                      {opp.example && (
                        <div className="bg-muted/50 rounded-lg p-2.5">
                          <p className="text-xs text-muted-foreground font-medium mb-1">Example:</p>
                          <p className="text-xs italic">"{opp.example}"</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center py-16 text-muted-foreground border-2 border-dashed rounded-xl">
                  <Sparkles className="h-10 w-10 mb-3 opacity-40" />
                  <p className="font-medium">No opportunities analyzed yet</p>
                  <p className="text-sm mt-1">Track keywords first to generate AI search opportunities</p>
                </div>
              )}

              {/* Static AI opportunity types */}
              <div className="rounded-xl border bg-card p-5">
                <h3 className="font-semibold text-sm mb-4">What AI Engines Love</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { type: "FAQ Content", desc: "Questions with clear, direct answers", icon: "❓" },
                    { type: "How-To Guides", desc: "Step-by-step instructional content", icon: "📋" },
                    { type: "Statistics", desc: "Data points and research citations", icon: "📊" },
                    { type: "Definitions", desc: "Clear explanations of terms", icon: "📖" },
                    { type: "Comparisons", desc: "Side-by-side tool/product comparisons", icon: "⚖️" },
                    { type: "Expert Quotes", desc: "Authority citations and expert opinions", icon: "💬" },
                  ].map(t => (
                    <div key={t.type} className="flex gap-3 p-3 rounded-lg bg-muted/40">
                      <span className="text-xl">{t.icon}</span>
                      <div>
                        <p className="text-sm font-medium">{t.type}</p>
                        <p className="text-xs text-muted-foreground">{t.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
