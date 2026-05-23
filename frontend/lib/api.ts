import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
  create: (data: any) => api.post("/clients", data),
  update: (id: string, data: any) => api.patch(`/clients/${id}`, data),
  delete: (id: string) => api.delete(`/clients/${id}`),
};

// Websites
export const websitesApi = {
  list: (clientId?: string) => api.get("/websites", { params: { client_id: clientId } }),
  get: (id: string) => api.get(`/websites/${id}`),
  create: (data: any) => api.post("/websites", data),
  update: (id: string, data: any) => api.patch(`/websites/${id}`, data),
  connect: (websiteId: string, type: string, credentials: any) =>
    api.post(`/websites/${websiteId}/connect/${type}`, credentials),
};

// Crawls
export const crawlsApi = {
  start: (data: { website_id: string; max_pages?: number; deep?: boolean; include_ai_audit?: boolean }) =>
    api.post("/crawls", data),
  get: (id: string) => api.get(`/crawls/${id}`),
  getPages: (crawlId: string) => api.get(`/crawls/${crawlId}/pages`),
  getIssues: (crawlId: string, severity?: string) =>
    api.get(`/crawls/${crawlId}/issues`, { params: { severity } }),
  byWebsite: (websiteId: string) => api.get(`/crawls/website/${websiteId}`),
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
