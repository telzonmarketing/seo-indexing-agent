"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useState } from "react";
import {
  Zap, Plus, Play, Pause, Trash2, ChevronRight, Clock,
  CheckCircle, AlertTriangle, Settings, Copy, ToggleLeft, ToggleRight,
  FlipHorizontal
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AutomationRule {
  id: string;
  name: string;
  description: string;
  trigger: string;
  trigger_config: Record<string, any>;
  actions: Array<{ action: string; params: Record<string, any> }>;
  status: string;
  is_active: boolean;
  last_fired_at: string | null;
  fire_count: number;
  cooldown_minutes: number;
  cron_expression: string | null;
}

interface RuleTemplate {
  id: string;
  name: string;
  description: string;
  trigger: string;
  trigger_config: Record<string, any>;
  actions: Array<{ action: string; params: Record<string, any> }>;
  cron_expression?: string;
  cooldown_minutes: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(ts: string | null): string {
  if (!ts) return "Never";
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

const TRIGGER_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  ranking_drop: { label: "Ranking Drop", icon: "📉", color: "red" },
  ranking_gain: { label: "Ranking Gain", icon: "📈", color: "green" },
  crawl_complete: { label: "Crawl Complete", icon: "✅", color: "blue" },
  crawl_error: { label: "Crawl Error", icon: "❌", color: "red" },
  new_content: { label: "New Content", icon: "📄", color: "purple" },
  content_decay: { label: "Content Decay", icon: "📉", color: "orange" },
  seo_issue_detected: { label: "SEO Issue", icon: "⚠️", color: "yellow" },
  backlink_lost: { label: "Backlink Lost", icon: "🔗", color: "red" },
  ai_visibility_drop: { label: "AI Visibility Drop", icon: "🤖", color: "purple" },
  scheduled: { label: "Scheduled", icon: "⏰", color: "blue" },
  manual: { label: "Manual", icon: "👆", color: "gray" },
};

const TRIGGER_COLORS: Record<string, string> = {
  red: "bg-red-500/20 text-red-300 border-red-500/20",
  green: "bg-green-500/20 text-green-300 border-green-500/20",
  blue: "bg-blue-500/20 text-blue-300 border-blue-500/20",
  purple: "bg-purple-500/20 text-purple-300 border-purple-500/20",
  yellow: "bg-yellow-500/20 text-yellow-300 border-yellow-500/20",
  orange: "bg-orange-500/20 text-orange-300 border-orange-500/20",
  gray: "bg-slate-600/50 text-slate-300 border-slate-600",
};

// ── Rule Card ─────────────────────────────────────────────────────────────────

function RuleCard({ rule, onToggle, onFire, onDelete }: {
  rule: AutomationRule;
  onToggle: () => void;
  onFire: () => void;
  onDelete: () => void;
}) {
  const trigger = TRIGGER_LABELS[rule.trigger] ?? { label: rule.trigger, icon: "⚡", color: "gray" };
  const colorClass = TRIGGER_COLORS[trigger.color] ?? TRIGGER_COLORS.gray;

  return (
    <div className={`bg-slate-800/60 rounded-xl border transition ${
      rule.is_active ? "border-slate-700 hover:border-slate-500" : "border-slate-700/50 opacity-60"
    }`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={`mt-0.5 flex-shrink-0 px-2 py-0.5 rounded-full text-xs border ${colorClass}`}>
              {trigger.icon} {trigger.label}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-white text-sm">{rule.name}</div>
              {rule.description && (
                <div className="text-xs text-slate-400 mt-0.5">{rule.description}</div>
              )}
            </div>
          </div>

          {/* Toggle */}
          <button onClick={onToggle} className="flex-shrink-0">
            {rule.is_active
              ? <ToggleRight size={22} className="text-green-400 hover:text-green-300" />
              : <ToggleLeft size={22} className="text-slate-500 hover:text-slate-400" />
            }
          </button>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {rule.actions.map((a, i) => (
            <span key={i}
              className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded flex items-center gap-1">
              <ChevronRight size={10} />
              {a.action.replace(/_/g, " ")}
            </span>
          ))}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-700 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <Zap size={11} /> {rule.fire_count} fires
          </span>
          <span className="flex items-center gap-1">
            <Clock size={11} /> Last: {timeAgo(rule.last_fired_at)}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={11} /> Cooldown: {rule.cooldown_minutes}m
          </span>
          {rule.cron_expression && (
            <span className="flex items-center gap-1 text-blue-400">
              ⏰ {rule.cron_expression}
            </span>
          )}

          {/* Actions */}
          <div className="ml-auto flex gap-2">
            <button onClick={onFire}
              className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
              <Play size={11} /> Fire
            </button>
            <button onClick={onDelete}
              className="text-red-400 hover:text-red-300 flex items-center gap-1">
              <Trash2 size={11} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Template Card ─────────────────────────────────────────────────────────────

function TemplateCard({ template, onInstall }: { template: RuleTemplate; onInstall: () => void }) {
  const trigger = TRIGGER_LABELS[template.trigger] ?? { label: template.trigger, icon: "⚡", color: "gray" };
  return (
    <div className="bg-slate-800/40 rounded-xl border border-slate-700 p-4 hover:border-slate-500 transition">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold text-white text-sm">{template.name}</div>
          <div className="text-xs text-slate-400 mt-1">{template.description}</div>
        </div>
        <button onClick={onInstall}
          className="flex-shrink-0 ml-3 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs text-white flex items-center gap-1 transition">
          <Plus size={12} /> Install
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        <span className={`px-2 py-0.5 rounded-full text-xs border ${TRIGGER_COLORS[trigger.color] ?? TRIGGER_COLORS.gray}`}>
          {trigger.icon} {trigger.label}
        </span>
        {template.actions.map((a, i) => (
          <span key={i} className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded">
            → {a.action.replace(/_/g, " ")}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AutomationRulesPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"active" | "templates">("active");
  const [showCreate, setShowCreate] = useState(false);
  const [newRuleName, setNewRuleName] = useState("");
  const [newTrigger, setNewTrigger] = useState("ranking_drop");

  const { data: rulesData } = useQuery({
    queryKey: ["automation-rules"],
    queryFn: () => api.get("/api/automation-rules").then(r => r.data),
    refetchInterval: 10000,
  });

  const { data: templatesData } = useQuery({
    queryKey: ["rule-templates"],
    queryFn: () => api.get("/api/automation-rules/templates").then(r => r.data),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/automation-rules/${id}/toggle`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automation-rules"] }),
  });

  const fireMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/automation-rules/${id}/fire`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/automation-rules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automation-rules"] }),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post("/api/automation-rules", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automation-rules"] });
      setShowCreate(false);
      setNewRuleName("");
    },
  });

  const installTemplate = (template: RuleTemplate) => {
    createMutation.mutate({
      name: template.name,
      description: template.description,
      trigger: template.trigger,
      trigger_config: template.trigger_config,
      actions: template.actions,
      cooldown_minutes: template.cooldown_minutes,
      cron_expression: template.cron_expression,
    });
  };

  const rules: AutomationRule[] = rulesData?.rules ?? [];
  const templates: RuleTemplate[] = templatesData?.templates ?? [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-yellow-500/20 rounded-xl">
              <Zap size={24} className="text-yellow-400" />
            </div>
            Automation Rules
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            IF/THEN autonomous execution · {rulesData?.active ?? 0} active rules · {rulesData?.total_fires ?? 0} total fires
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-sm text-white transition"
        >
          <Plus size={14} /> New Rule
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Active Rules</div>
          <div className="text-2xl font-bold text-green-400">{rulesData?.active ?? 0}</div>
        </div>
        <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Total Fires</div>
          <div className="text-2xl font-bold text-yellow-400">{rulesData?.total_fires ?? 0}</div>
        </div>
        <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Total Rules</div>
          <div className="text-2xl font-bold text-blue-400">{rulesData?.total ?? 0}</div>
        </div>
      </div>

      {/* Create rule inline form */}
      {showCreate && (
        <div className="bg-slate-800 border border-yellow-500/30 rounded-xl p-5 mb-6">
          <h3 className="font-semibold text-white mb-4">Create New Rule</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Rule Name</label>
              <input
                value={newRuleName}
                onChange={e => setNewRuleName(e.target.value)}
                placeholder="e.g. Post-Crawl Schema Generation"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Trigger</label>
              <select
                value={newTrigger}
                onChange={e => setNewTrigger(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
              >
                {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Tip: Use templates tab for pre-built rules with sensible defaults.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate({
                name: newRuleName || "New Rule",
                trigger: newTrigger,
                actions: [{ action: "create_task", params: { title: `Auto: ${newRuleName}` } }],
              })}
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-sm text-white"
            >
              Create Rule
            </button>
            <button onClick={() => setShowCreate(false)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-300">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-800/40 p-1 rounded-xl w-fit">
        <button onClick={() => setActiveTab("active")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === "active" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-300"
          }`}>
          Active Rules ({rules.length})
        </button>
        <button onClick={() => setActiveTab("templates")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === "templates" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-300"
          }`}>
          Templates ({templates.length})
        </button>
      </div>

      {/* Active Rules */}
      {activeTab === "active" && (
        <div className="space-y-3">
          {rules.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <Zap size={48} className="mx-auto mb-4 opacity-30" />
              <p className="mb-2">No automation rules yet</p>
              <p className="text-xs">Install from templates or create a custom rule</p>
              <button onClick={() => setActiveTab("templates")}
                className="mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white flex items-center gap-2 mx-auto">
                <FlipHorizontal size={14} /> Browse Templates
              </button>
            </div>
          ) : (
            rules.map(rule => (
              <RuleCard
                key={rule.id}
                rule={rule}
                onToggle={() => toggleMutation.mutate(rule.id)}
                onFire={() => fireMutation.mutate(rule.id)}
                onDelete={() => {
                  if (confirm(`Delete rule "${rule.name}"?`)) deleteMutation.mutate(rule.id);
                }}
              />
            ))
          )}
        </div>
      )}

      {/* Templates */}
      {activeTab === "templates" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500 mb-4">
            Pre-built rules for common automation scenarios. Click Install to add to your active rules.
          </p>
          {templates.map(template => (
            <TemplateCard
              key={template.id}
              template={template}
              onInstall={() => installTemplate(template)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
