"use client";
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { websitesApi } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Globe, ExternalLink, RefreshCw, CheckCircle, XCircle,
  Trash2, AlertTriangle, Loader2,
} from "lucide-react";
import Link from "next/link";
import { cn, scoreColor, formatRelative } from "@/lib/utils";
import toast from "react-hot-toast";

// ── Delete confirmation modal ───────────────────────────────────────────────

interface DeleteModalProps {
  website: { id: string; domain: string } | null;
  onClose: () => void;
  onConfirm: (id: string) => void;
  isDeleting: boolean;
}

function DeleteModal({ website, onClose, onConfirm, isDeleting }: DeleteModalProps) {
  const [typed, setTyped] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  if (!website) return null;

  const canDelete = typed === "DELETE";

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !isDeleting) onClose(); }}
    >
      <div className="w-full max-w-md mx-4 rounded-xl border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100">
            <Trash2 className="h-4 w-4 text-red-600" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">Delete Website</h2>
            <p className="text-xs text-muted-foreground">{website.domain}</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Warning box */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="flex gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs font-medium text-amber-800">
                Are you sure you want to delete <strong>{website.domain}</strong>?
              </p>
            </div>
            <p className="text-xs text-amber-700 ml-6 mb-2">This action will:</p>
            <ul className="text-xs text-amber-700 ml-6 space-y-0.5 list-disc list-inside">
              <li>Stop all active crawlers</li>
              <li>Disable all automation rules</li>
              <li>Remove pending queue jobs</li>
              <li>Disconnect integrations (GSC, GA4)</li>
              <li>Archive all reports</li>
            </ul>
            <p className="text-xs text-amber-600 mt-2 ml-6 font-medium">
              ✓ You can restore within 30 days.
            </p>
          </div>

          {/* Type to confirm */}
          <div>
            <label className="block text-xs font-medium mb-1.5 text-muted-foreground">
              Type <span className="font-mono font-bold text-red-600">DELETE</span> to confirm
            </label>
            <Input
              ref={inputRef}
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Type DELETE"
              className={cn(
                "font-mono text-sm",
                typed.length > 0 && !canDelete && "border-red-300 focus-visible:ring-red-300",
                canDelete && "border-green-400 focus-visible:ring-green-400",
              )}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canDelete && !isDeleting) onConfirm(website.id);
                if (e.key === "Escape" && !isDeleting) onClose();
              }}
              disabled={isDeleting}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!canDelete || isDeleting}
            onClick={() => onConfirm(website.id)}
            className={cn(
              "gap-1.5 min-w-[120px]",
              canDelete
                ? "bg-red-600 hover:bg-red-700 text-white border-red-600"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            {isDeleting ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Deleting…</>
            ) : (
              <><Trash2 className="h-3.5 w-3.5" /> Delete Website</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function WebsitesPage() {
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; domain: string } | null>(null);

  const { data: websites = [], isLoading } = useQuery({
    queryKey: ["websites"],
    queryFn: () => websitesApi.list().then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (websiteId: string) => websitesApi.delete(websiteId),
    onSuccess: (res, websiteId) => {
      const data = res.data;
      toast.success(
        `✅ ${data.domain} deleted. Crawlers stopped, automations disabled.`,
        { duration: 5000 }
      );
      // Optimistically remove from list immediately
      queryClient.setQueryData<any[]>(["websites"], (old) =>
        (old || []).filter((w: any) => w.id !== websiteId)
      );
      // Also invalidate to sync with server
      queryClient.invalidateQueries({ queryKey: ["websites"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setDeleteTarget(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Delete failed. Please try again.");
    },
  });

  return (
    <>
      <div className="flex flex-col h-full">
        <Header title="Websites" description={`${websites.length} websites under monitoring`} />
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : websites.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Globe className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>No websites yet. Add websites from client profiles.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {websites.map((website: any) => (
                <Card key={website.id} className="hover:shadow-md transition-shadow group">
                  <CardContent className="p-5">
                    {/* Domain header */}
                    <div className="flex items-center gap-2 mb-3">
                      <Globe className="h-5 w-5 text-muted-foreground shrink-0" />
                      <Link
                        href={`/websites/${website.id}`}
                        className="font-semibold hover:text-primary truncate flex-1 text-sm"
                      >
                        {website.domain}
                      </Link>
                    </div>

                    {/* Score row */}
                    <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                      <div className="rounded bg-muted/50 p-2">
                        <div className={cn("text-lg font-bold", scoreColor(website.technical_score))}>
                          {website.technical_score ?? "–"}
                        </div>
                        <div className="text-xs text-muted-foreground">Technical</div>
                      </div>
                      <div className="rounded bg-muted/50 p-2">
                        <div className={cn("text-lg font-bold", scoreColor(website.content_score))}>
                          {website.content_score ?? "–"}
                        </div>
                        <div className="text-xs text-muted-foreground">Content</div>
                      </div>
                      <div className="rounded bg-muted/50 p-2">
                        <div className={cn("text-lg font-bold", scoreColor(website.ai_visibility_score))}>
                          {website.ai_visibility_score ?? "–"}
                        </div>
                        <div className="text-xs text-muted-foreground">AI</div>
                      </div>
                    </div>

                    {/* Meta row */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                      <span>Last crawled: {formatRelative(website.last_crawled_at)}</span>
                      {website.is_verified ? (
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle className="h-3 w-3" /> Verified
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <XCircle className="h-3 w-3" /> Unverified
                        </span>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      <Link href={`/websites/${website.id}`} className="flex-1">
                        <Button variant="outline" size="sm" className="w-full">
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> View Details
                        </Button>
                      </Link>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteTarget({ id: website.id, domain: website.domain })}
                        className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-400 hover:text-red-700 shrink-0"
                        title="Delete website"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      <DeleteModal
        website={deleteTarget}
        onClose={() => { if (!deleteMutation.isPending) setDeleteTarget(null); }}
        onConfirm={(id) => deleteMutation.mutate(id)}
        isDeleting={deleteMutation.isPending}
      />
    </>
  );
}
