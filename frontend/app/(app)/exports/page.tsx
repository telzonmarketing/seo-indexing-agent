"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Download, FileSpreadsheet, RefreshCw, BarChart2, Link2, BookOpen, Search, Target, ListChecks, GitBranch } from "lucide-react";

const EXPORTS = [
  {
    type: "full_report",
    name: "Full SEO Report",
    description: "All data in one Excel file — technical audit, rankings, backlinks, blog ideas, tasks, content gaps",
    icon: <FileSpreadsheet className="w-6 h-6 text-green-600" />,
    sheets: 8,
    color: "border-green-200 bg-green-50",
  },
  {
    type: "technical_audit",
    name: "Technical Audit",
    description: "All SEO issues with severity levels, affected pages, and prioritized recommendations",
    icon: <BarChart2 className="w-6 h-6 text-blue-600" />,
    sheets: 1,
    color: "border-blue-200 bg-blue-50",
  },
  {
    type: "seo_tasks",
    name: "SEO Task List",
    description: "Complete task list with priority scores, impact estimates, AI-generated vs manual tasks",
    icon: <ListChecks className="w-6 h-6 text-purple-600" />,
    sheets: 1,
    color: "border-purple-200 bg-purple-50",
  },
  {
    type: "backlinks",
    name: "Backlink Opportunities",
    description: "Directory listings, guest post prospects, forum opportunities — sortable by DA score",
    icon: <Link2 className="w-6 h-6 text-orange-600" />,
    sheets: 1,
    color: "border-orange-200 bg-orange-50",
  },
  {
    type: "blog_ideas",
    name: "Blog Ideas",
    description: "AI-generated content ideas with target keywords, search intent, priority scores and outlines",
    icon: <BookOpen className="w-6 h-6 text-green-600" />,
    sheets: 1,
    color: "border-green-200 bg-green-50",
  },
  {
    type: "rankings",
    name: "Keyword Rankings",
    description: "Current keyword positions, ranking changes, search volumes and landing pages",
    icon: <Search className="w-6 h-6 text-indigo-600" />,
    sheets: 1,
    color: "border-indigo-200 bg-indigo-50",
  },
  {
    type: "competitor",
    name: "Competitor Analysis",
    description: "Content gaps, keyword gaps and quick wins vs competitors",
    icon: <Target className="w-6 h-6 text-red-600" />,
    sheets: 1,
    color: "border-red-200 bg-red-50",
  },
  {
    type: "content_gaps",
    name: "Content Gap Analysis",
    description: "Missing content opportunities with traffic estimates and competitor coverage",
    icon: <GitBranch className="w-6 h-6 text-cyan-600" />,
    sheets: 1,
    color: "border-cyan-200 bg-cyan-50",
  },
];

export default function ExportsPage() {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState("");
  const [selectedWebsite, setSelectedWebsite] = useState("");

  const { data: clientsData } = useQuery({
    queryKey: ["clients"],
    queryFn: () => api.get("/clients").then((r) => r.data),
  });

  const clients = clientsData?.clients || [];

  const handleDownload = async (exportType: string) => {
    setDownloading(exportType);
    try {
      const params = new URLSearchParams();
      if (selectedClient) params.set("client_id", selectedClient);
      if (selectedWebsite) params.set("website_id", selectedWebsite);

      const response = await api.get(`/exports/download/${exportType}?${params}`, {
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `seo_os_${exportType}_${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`${exportType.replace(/_/g, " ")} downloaded!`);
    } catch {
      toast.error("Download failed");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Download className="w-6 h-6 text-green-500" />
          Excel Exports
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Download professional SEO reports as Excel files. Auto-generated daily at 6:00 AM UTC.
        </p>
      </div>

      {/* Client Filter */}
      <div className="bg-card border rounded-xl p-4">
        <h3 className="font-semibold text-sm mb-3">Filter by Client / Website (optional)</h3>
        <div className="flex gap-3 flex-wrap">
          <select
            value={selectedClient}
            onChange={(e) => { setSelectedClient(e.target.value); setSelectedWebsite(""); }}
            className="border rounded-lg px-3 py-2 text-sm bg-background min-w-[200px]"
          >
            <option value="">All Clients</option>
            {clients.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {selectedClient && clients.find((c: any) => c.id === selectedClient)?.websites?.length > 0 && (
            <select
              value={selectedWebsite}
              onChange={(e) => setSelectedWebsite(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm bg-background min-w-[200px]"
            >
              <option value="">All Websites</option>
              {clients.find((c: any) => c.id === selectedClient)?.websites?.map((w: any) => (
                <option key={w.id} value={w.id}>{w.domain}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Export Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {EXPORTS.map((exp) => (
          <div key={exp.type} className={`border rounded-xl p-5 ${exp.color}`}>
            <div className="flex items-start justify-between mb-3">
              {exp.icon}
              <span className="text-xs text-muted-foreground bg-white/80 px-2 py-0.5 rounded-full">
                {exp.sheets === 1 ? "1 sheet" : `${exp.sheets} sheets`}
              </span>
            </div>
            <h3 className="font-semibold mb-1">{exp.name}</h3>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{exp.description}</p>
            <button
              onClick={() => handleDownload(exp.type)}
              disabled={downloading === exp.type}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-white text-gray-800 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
            >
              {downloading === exp.type ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Generating...</>
              ) : (
                <><Download className="w-4 h-4" /> Download Excel</>
              )}
            </button>
          </div>
        ))}
      </div>

      {/* Info */}
      <div className="bg-muted/50 rounded-xl p-4 text-sm text-muted-foreground">
        <strong className="text-foreground">Auto-generation:</strong> Full SEO reports are automatically generated daily at 6:00 AM UTC and saved to the server at <code>/tmp/seo_os_reports/</code>. Download above generates a fresh report on-demand.
      </div>
    </div>
  );
}
