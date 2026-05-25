"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Globe, Search, CheckSquare,
  FileText, Settings, Zap, TrendingUp, LogOut, Bot,
  BookOpen, Link2, GitBranch, Download, Brain, Target, Activity, Layers, Network,
  Crosshair, FlipHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/store";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "main" },
  { href: "/clients", label: "Clients", icon: Users, group: "main" },
  { href: "/websites", label: "Websites", icon: Globe, group: "main" },
  { href: "/crawls", label: "Crawls", icon: Search, group: "main" },
  { href: "/tasks", label: "Tasks", icon: CheckSquare, group: "main" },
  { href: "/rankings", label: "Rankings", icon: TrendingUp, group: "main" },

  { href: "/orchestrator", label: "Orchestrator", icon: GitBranch, group: "ai", badge: "NEW" },
  { href: "/hunter", label: "Hunter Agent", icon: Crosshair, group: "ai", badge: "NEW" },
  { href: "/automation-rules", label: "Automation Rules", icon: FlipHorizontal, group: "ai", badge: "NEW" },
  { href: "/autonomous", label: "Autonomous Mode", icon: Bot, group: "ai", badge: "AI" },
  { href: "/brain", label: "AI Brain", icon: Brain, group: "ai" },
  { href: "/alex", label: "Alex SEO", icon: Target, group: "ai" },
  { href: "/aeo", label: "AEO Engine", icon: Layers, group: "ai" },
  { href: "/clusters", label: "Topic Clusters", icon: Network, group: "ai" },
  { href: "/blog-ideas", label: "Blog Ideas", icon: BookOpen, group: "ai" },
  { href: "/backlinks", label: "Backlinks", icon: Link2, group: "ai" },

  { href: "/reports", label: "Reports", icon: FileText, group: "reports" },
  { href: "/exports", label: "Excel Exports", icon: Download, group: "reports" },

  { href: "/settings", label: "Settings", icon: Settings, group: "other" },
];

const groups = [
  { key: "main", label: "Core" },
  { key: "ai", label: "Autonomous AI" },
  { key: "reports", label: "Reports" },
  { key: "other", label: "" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
          <Zap className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <div className="font-bold text-lg leading-none">SEO OS</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block animate-pulse" />
            Autonomous Mode
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {groups.map(({ key, label }) => {
          const items = nav.filter((n) => n.group === key);
          if (!items.length) return null;
          return (
            <div key={key} className="mb-4">
              {label && (
                <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {label}
                </div>
              )}
              <ul className="space-y-0.5">
                {items.map(({ href, label: itemLabel, icon: Icon, badge }) => {
                  const active = pathname === href || pathname.startsWith(href + "/");
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1">{itemLabel}</span>
                        {badge && (
                          <span className={cn(
                            "text-[9px] font-bold px-1.5 py-0.5 rounded-full",
                            active ? "bg-white/20 text-white" : "bg-indigo-100 text-indigo-600"
                          )}>{badge}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* User */}
      <div className="border-t p-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user?.name || "Team Member"}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.role}</p>
          </div>
          <button
            onClick={logout}
            className="ml-2 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
