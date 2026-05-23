"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tasksApi } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, priorityColor } from "@/lib/utils";
import { CheckCircle2, Circle, Plus, RefreshCw, Zap } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";

const STATUSES = ["backlog", "todo", "in_progress", "review", "done"] as const;
const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog", todo: "To Do",
  in_progress: "In Progress", review: "Review", done: "Done",
};

export default function TasksPage() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get("client_id") || undefined;
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const qc = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks", clientId, statusFilter],
    queryFn: () =>
      tasksApi.list({
        client_id: clientId,
        status: statusFilter !== "all" ? statusFilter : undefined,
      }).then((r) => r.data),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => tasksApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
    onError: () => toast.error("Failed to update task"),
  });

  const grouped = STATUSES.reduce((acc, status) => {
    acc[status] = tasks.filter((t: any) => t.status === status);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Tasks"
        description="AI-generated and manual SEO tasks"
        actions={
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" /> New Task
          </Button>
        }
      />

      <div className="flex-1 overflow-hidden flex flex-col p-6">
        {/* Filters */}
        <div className="flex gap-2 mb-4">
          {["all", ...STATUSES].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                statusFilter === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              )}
            >
              {s === "all" ? "All" : STATUS_LABELS[s]}
              {s !== "all" && (
                <span className="ml-1.5 text-xs opacity-70">
                  {grouped[s as keyof typeof grouped]?.length || 0}
                </span>
              )}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-x-auto">
            <div className="flex gap-4 min-w-max pb-4" style={{ minHeight: "400px" }}>
              {STATUSES.filter(s => statusFilter === "all" || statusFilter === s).map((status) => (
                <div key={status} className="w-72 shrink-0">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold">{STATUS_LABELS[status]}</h3>
                    <span className="text-xs bg-muted rounded-full px-2 py-0.5">
                      {grouped[status]?.length || 0}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {(grouped[status] || []).map((task: any) => (
                      <div key={task.id} className="rounded-lg border bg-card p-3 hover:shadow-sm transition-shadow">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="text-sm font-medium leading-tight">{task.title}</p>
                          {task.ai_generated && (
                            <span title="AI Generated">
                              <Zap className="h-3.5 w-3.5 text-purple-500 shrink-0 mt-0.5" />
                            </span>
                          )}
                        </div>
                        {task.description && (
                          <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{task.description}</p>
                        )}
                        <div className="flex items-center justify-between">
                          <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", priorityColor(task.priority))}>
                            {task.priority}
                          </span>
                          <div className="flex gap-1">
                            {status !== "done" && (
                              <button
                                onClick={() => updateMutation.mutate({ id: task.id, data: { status: "done" } })}
                                className="text-xs text-muted-foreground hover:text-green-600 transition-colors"
                                title="Mark done"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                        {task.estimated_impact > 0 && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            Impact: <span className="font-medium text-foreground">{task.estimated_impact}/100</span>
                          </div>
                        )}
                      </div>
                    ))}
                    {(grouped[status] || []).length === 0 && (
                      <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                        No tasks
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
