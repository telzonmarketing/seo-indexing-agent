import axios from "axios";

// In production with Nginx, NEXT_PUBLIC_API_URL is empty → uses relative /api path
// In development, falls back to localhost:8000
const API_BASE = process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined" ? "" : "http://localhost:8000");

export const api = axios.create({
  baseURL: `${API_BASE}/api`,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("seo_os_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("seo_os_token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post("/auth/login", new URLSearchParams({ username: email, password }), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }),
  register: (data: { email: string; name: string; password: string }) =>
    api.post("/auth/register", data),
  me: () => api.get("/auth/me"),
};

// Dashboard
export const dashboardApi = {
  overview: () => api.get("/dashboard/overview"),
  clientDashboard: (id: string) => api.get(`/dashboard/client/${id}`),
};

// Clients
export const clientsApi = {
  list: (q?: string) => api.get("/clients", { params: { q } }),
  get: (id: string) => api.get(`/clients/${id}`),
  dashboard: (id: string) => api.get(`/clients/${id}/dashboard`),
  workspace: (id: string) => api.get(`/clients/${id}/workspace`),
  create: (data: any) => api.post("/clients", data),
  update: (id: string, data: any) => api.patch(`/clients/${id}`, data),
  delete: (id: string, permanent?: boolean) => api.delete(`/clients/${id}`, { params: { permanent } }),
};

// Website Setup (Onboarding Wizard)
export const websiteSetupApi = {
  detect: (url: string) => api.get("/website-setup/detect", { params: { url } }),
  step1: (data: { client_id: string; url: string }) => api.post("/website-setup/step1", data),
  step2Verify: (data: { website_id: string; verification_method?: string }) => api.post("/website-setup/step2-verify", data),
  step2Confirm: (websiteId: string) => api.post(`/website-setup/step2-confirm/${websiteId}`),
  step3: (data: any) => api.post("/website-setup/step3-integrations", data),
  step4: (data: { website_id: string; max_pages?: number }) => api.post("/website-setup/step4-crawl", data),
  step5: (websiteId: string) => api.post("/website-setup/step5-initialize", null, { params: { website_id: websiteId } }),
  step6: (data: { website_id: string }) => api.post("/website-setup/step6-complete", data),
  status: (websiteId: string) => api.get(`/website-setup/status/${websiteId}`),
};

// Alerts
export const alertsApi = {
  list: (params?: { client_id?: string; website_id?: string; severity?: string; is_read?: boolean; limit?: number }) =>
    api.get("/alerts", { params }),
  unreadCount: (clientId?: string) => api.get("/alerts/unread-count", { params: { client_id: clientId } }),
  markRead: (id: string) => api.patch(`/alerts/${id}/read`),
  markAllRead: (clientId?: string) => api.patch("/alerts/mark-all-read", null, { params: { client_id: clientId } }),
  seedDemo: (clientId: string, websiteId?: string) =>
    api.post("/alerts/seed-demo", null, { params: { client_id: clientId, website_id: websiteId } }),
};

// Websites
export const websitesApi = {
  list: (clientId?: string) => api.get("/websites", { params: { client_id: clientId } }),
  get: (id: string) => api.get(`/websites/${id}`),
  create: (data: any) => api.post("/websites", data),
  update: (id: string, data: any) => api.patch(`/websites/${id}`, data),
  connect: (websiteId: string, type: string, credentials: any) =>
    api.post(`/websites/${websiteId}/connect/${type}`, credentials),
  seoScore: (websiteId: string) => api.get(`/websites/${websiteId}/seo-score`),
  delete: (websiteId: string, permanent?: boolean) =>
    api.delete(`/websites/${websiteId}`, { params: { permanent } }),
  restore: (websiteId: string) => api.post(`/websites/${websiteId}/restore`),
};

// Crawls
export const crawlsApi = {
  list: (params?: { website_id?: string; status?: string; limit?: number; offset?: number }) =>
    api.get("/crawls", { params }),
  start: (data: { website_id: string; max_pages?: number; deep?: boolean; include_ai_audit?: boolean }) =>
    api.post("/crawls", data),
  get: (id: string) => api.get(`/crawls/${id}`),
  getPages: (crawlId: string) => api.get(`/crawls/${crawlId}/pages`),
  getIssues: (crawlId: string, severity?: string) =>
    api.get(`/crawls/${crawlId}/issues`, { params: { severity } }),
  byWebsite: (websiteId: string, limit?: number) =>
    api.get(`/crawls/website/${websiteId}`, { params: { limit } }),
  cancel: (crawlId: string) => api.post(`/crawls/${crawlId}/cancel`),
  stats: () => api.get("/crawls/stats/overview"),
};

// Tasks
export const tasksApi = {
  list: (params?: any) => api.get("/tasks", { params }),
  create: (data: any) => api.post("/tasks", data),
  update: (id: string, data: any) => api.patch(`/tasks/${id}`, data),
  delete: (id: string) => api.delete(`/tasks/${id}`),
};

// Reports
export const reportsApi = {
  list: (clientId?: string) => api.get("/reports", { params: { client_id: clientId } }),
  get: (id: string) => api.get(`/reports/${id}`),
  generate: (data: any) => api.post("/reports/generate", data),
};

// Blog Ideas
export const blogIdeasApi = {
  list: (params?: { client_id?: string; website_id?: string; status?: string; limit?: number }) =>
    api.get("/blog-ideas", { params }),
  get: (id: string) => api.get(`/blog-ideas/${id}`),
  generate: (data: { website_id?: string; client_id?: string; count?: number; industry?: string }) =>
    api.post("/blog-ideas/generate", data),
  updateStatus: (id: string, status: string) =>
    api.patch(`/blog-ideas/${id}/status`, { status }),
  generateBrief: (id: string) => api.post(`/blog-ideas/${id}/generate-brief`),
  delete: (id: string) => api.delete(`/blog-ideas/${id}`),
};

// Backlinks
export const backlinksApi = {
  list: (params?: { client_id?: string; website_id?: string; status?: string; type?: string; limit?: number }) =>
    api.get("/backlinks", { params }),
  stats: (params?: { client_id?: string; website_id?: string }) =>
    api.get("/backlinks/stats", { params }),
  scan: (data: { website_id: string; competitor_domains?: string[] }) =>
    api.post("/backlinks/scan", data),
  get: (id: string) => api.get(`/backlinks/${id}`),
  updateStatus: (id: string, status: string) =>
    api.patch(`/backlinks/${id}/status`, { status }),
  delete: (id: string) => api.delete(`/backlinks/${id}`),
};

// Exports
export const exportsApi = {
  list: (params?: { client_id?: string; export_type?: string }) =>
    api.get("/exports", { params }),
  download: (exportType: string, params?: { client_id?: string; website_id?: string }) =>
    api.get(`/exports/download/${exportType}`, { params, responseType: "blob" }),
};

// Autonomous Mode
export const autonomousApi = {
  status: () => api.get("/autonomous/status"),
  agents: () => api.get("/autonomous/agents"),
  run: (taskName: string, params?: Record<string, any>) =>
    api.post(`/autonomous/run/${taskName}`, params ?? {}),
  emergencyStop: () => api.post("/autonomous/emergency-stop"),
  resume: () => api.post("/autonomous/resume"),
  emergencyStatus: () => api.get("/autonomous/emergency-status"),
};

// Mission Control
export const missionControlApi = {
  live: () => api.get("/mission-control/live"),
  agents: () => api.get("/mission-control/agents"),
};

// System Health (AI Energy Core)
export const healthApi = {
  system: () => api.get("/health/system"),
  metrics: () => api.get("/health/metrics"),
  queue: () => api.get("/health/queue"),
  aiEngine: () => api.get("/health/ai-engine"),
};

// Live Activity Feed
export const activityApi = {
  feed: (params?: { limit?: number; level?: string; agent?: string; milestones_only?: boolean }) =>
    api.get("/activity/feed", { params }),
  stats: () => api.get("/activity/stats"),
  milestones: (limit?: number) => api.get("/activity/milestones", { params: { limit } }),
  clear: () => api.delete("/activity/clear"),
  seed: () => api.post("/activity/seed"),
};

// AEO Engine
export const aeoApi = {
  audit: (websiteId: string) => api.get(`/aeo/audit/${websiteId}`),
  visibility: (websiteId: string) => api.get(`/aeo/visibility/${websiteId}`),
  llmsTxt: (websiteId: string) => api.get(`/aeo/llms-txt/${websiteId}`),
  opportunities: (websiteId: string) => api.get(`/aeo/opportunities/${websiteId}`),
  score: (websiteId: string) => api.get(`/aeo/score/${websiteId}`),
};

// Rankings
export const rankingsApi = {
  list: (params?: { website_id?: string; keyword?: string; tracked_only?: boolean; limit?: number }) =>
    api.get("/rankings", { params }),
  track: (data: { website_id: string; keywords: string[]; source?: string }) =>
    api.post("/rankings/track", data),
  update: (id: string, data: { position: number; clicks?: number; impressions?: number }) =>
    api.patch(`/rankings/${id}`, data),
  delete: (id: string) => api.delete(`/rankings/${id}`),
  summary: (websiteId: string) => api.get(`/rankings/summary/${websiteId}`),
  seedDemo: (websiteId: string) => api.post(`/rankings/seed/${websiteId}`),
  cannibalization: (websiteId: string) => api.get(`/rankings/cannibalization/${websiteId}`),
  wins: (websiteId: string, limit?: number) => api.get(`/rankings/wins/${websiteId}`, { params: { limit } }),
};

// Content Clusters
export const clustersApi = {
  list: (params?: { client_id?: string; website_id?: string; status?: string }) =>
    api.get("/content-clusters", { params }),
  get: (id: string) => api.get(`/content-clusters/${id}`),
  generate: (data: { topic: string; domain?: string; client_id?: string; website_id?: string }) =>
    api.post("/content-clusters/generate", data),
  updateStatus: (id: string, status: string) =>
    api.patch(`/content-clusters/${id}/status`, { status }),
  delete: (id: string) => api.delete(`/content-clusters/${id}`),
};

// Alex Brother — Ranking Hunter
export const alexApi = {
  scan: (websiteId: string, keywords?: string) =>
    api.get(`/alex/scan/${websiteId}`, { params: { keywords } }),
  serp: (keyword: string, domain?: string) =>
    api.get("/alex/serp", { params: { keyword, domain } }),
  keywords: (websiteId: string, seed: string) =>
    api.get(`/alex/keywords/${websiteId}`, { params: { seed } }),
  competitor: (domain: string, ourDomain?: string) =>
    api.get("/alex/competitor", { params: { domain, our_domain: ourDomain } }),
  aiOpportunities: (websiteId: string) => api.get(`/alex/ai-opportunities/${websiteId}`),
  trending: (industry?: string) => api.get("/alex/trending", { params: { industry } }),
};

// AI Brain
export const brainApi = {
  status: () => api.get("/brain/status"),
  learnNow: () => api.post("/brain/learn/now"),
  learnQueue: () => api.post("/brain/learn"),
  learnDeep: () => api.post("/brain/learn/deep"),
  retrain: () => api.post("/brain/learn/retrain"),
  articles: (params?: { status?: string; source?: string; limit?: number; offset?: number }) =>
    api.get("/brain/articles", { params }),
  article: (id: string) => api.get(`/brain/articles/${id}`),
  reprocessArticle: (id: string) => api.post(`/brain/articles/${id}/process`),
  knowledge: (params?: { category?: string; limit?: number; offset?: number }) =>
    api.get("/brain/knowledge", { params }),
  searchKnowledge: (q: string, category?: string, limit?: number) =>
    api.get("/brain/knowledge/search", { params: { q, category, limit } }),
  knowledgeByCategory: () => api.get("/brain/knowledge/by-category"),
  sessions: (limit?: number) => api.get("/brain/sessions", { params: { limit } }),
  sources: () => api.get("/brain/sources"),
  recommend: (context: string, websiteId?: string) =>
    api.get("/brain/recommend", { params: { context, website_id: websiteId } }),
  embedCheck: () => api.get("/brain/embed-check"),
};

// Orchestrator Engine
export const orchestratorApi = {
  status: () => api.get("/orchestrator/status"),
  agents: () => api.get("/orchestrator/agents"),
  queue: () => api.get("/orchestrator/queue"),
  dispatch: (task: string, args?: any[], kwargs?: Record<string, any>, priority?: string) =>
    api.post("/orchestrator/dispatch", { task, args: args ?? [], kwargs: kwargs ?? {}, priority: priority ?? "normal" }),
  balance: () => api.post("/orchestrator/balance"),
  fireEvent: (type: string, websiteId?: string, clientId?: string, data?: Record<string, any>) =>
    api.post("/orchestrator/event", { type, website_id: websiteId, client_id: clientId, data: data ?? {} }),
  timeline: (limit?: number) => api.get("/orchestrator/timeline", { params: { limit } }),
};

// Automation Rules
export const automationRulesApi = {
  list: (params?: { trigger?: string; active_only?: boolean }) =>
    api.get("/automation-rules", { params }),
  get: (id: string) => api.get(`/automation-rules/${id}`),
  create: (data: {
    name: string;
    trigger: string;
    actions: any[];
    description?: string;
    trigger_config?: Record<string, any>;
    conditions?: any[];
    client_id?: string;
    website_id?: string;
    cooldown_minutes?: number;
    cron_expression?: string;
  }) => api.post("/automation-rules", data),
  update: (id: string, data: Partial<any>) => api.put(`/automation-rules/${id}`, data),
  delete: (id: string) => api.delete(`/automation-rules/${id}`),
  toggle: (id: string) => api.post(`/automation-rules/${id}/toggle`),
  fire: (id: string, triggerData?: Record<string, any>) =>
    api.post(`/automation-rules/${id}/fire`, triggerData ?? {}),
  executions: (id: string, limit?: number) =>
    api.get(`/automation-rules/${id}/executions`, { params: { limit } }),
  evaluate: (type: string, dryRun?: boolean) =>
    api.post("/automation-rules/evaluate", { type, dry_run: dryRun ?? true }),
  templates: () => api.get("/automation-rules/templates"),
};

// Google OAuth Integrations
export const integrationsApi = {
  /** Returns { auth_url } — frontend redirects user's browser to auth_url */
  googleConnect: (websiteId: string, scope: "gsc" | "ga4" | "gsc+ga4" = "gsc") =>
    api.get("/integrations/google/connect", { params: { website_id: websiteId, scope } }),
  /** Refresh an expired Google access token */
  googleRefresh: (websiteId: string, integrationType: "gsc" | "ga4" = "gsc") =>
    api.post(`/integrations/google/${websiteId}/refresh`, null, {
      params: { integration_type: integrationType },
    }),
  /** List integrations for a website (credentials redacted) */
  list: (websiteId: string) => api.get(`/integrations/${websiteId}`),
  /** Disconnect an integration */
  disconnect: (websiteId: string, integrationType: string) =>
    api.delete(`/integrations/${websiteId}/${integrationType}`),
};

// Hunter Agent
export const hunterApi = {
  status: () => api.get("/hunter/status"),
  summary: () => api.get("/hunter/summary"),
  opportunities: (websiteId: string, oppType?: string) =>
    api.get(`/hunter/opportunities/${websiteId}`, { params: { opp_type: oppType } }),
  easyWins: (websiteId: string) => api.get(`/hunter/easy-wins/${websiteId}`),
  serpGaps: (websiteId: string) => api.get(`/hunter/serp-gaps/${websiteId}`),
  competitorWeak: (websiteId: string) => api.get(`/hunter/competitor-weak/${websiteId}`),
  scan: (websiteId: string) => api.post(`/hunter/scan/${websiteId}`),
  feed: (limit?: number) => api.get("/hunter/feed", { params: { limit } }),
};
