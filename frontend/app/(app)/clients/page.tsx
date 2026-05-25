"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clientsApi } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, Globe, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn, scoreColor, formatRelative } from "@/lib/utils";
import toast from "react-hot-toast";

export default function ClientsPage() {
  const [search, setSearch] = useState("");
  const qc = useQueryClient();

  const { data: clientsData, isLoading } = useQuery({
    queryKey: ["clients", search],
    queryFn: () => clientsApi.list(search || undefined).then((r) => r.data),
  });
  const clients = clientsData?.clients ?? clientsData ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => clientsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Client removed");
    },
    onError: () => toast.error("Failed to delete client"),
  });

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Clients"
        description={`${clientsData?.total ?? clients.length} active clients`}
        actions={
          <Link href="/clients/new">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> New Client
            </Button>
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-4 relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : clients.length === 0 ? (
          <div className="py-16 text-center">
            <Globe className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No clients yet</h3>
            <p className="text-muted-foreground mb-4">Add your first client to get started</p>
            <Link href="/clients/new">
              <Button><Plus className="h-4 w-4 mr-1" /> Add Client</Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clients.map((client: any) => (
              <Card key={client.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-primary">
                          {client.name[0].toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <Link href={`/clients/${client.id}`} className="font-semibold hover:text-primary transition-colors">
                          {client.name}
                        </Link>
                        {client.company && (
                          <p className="text-xs text-muted-foreground">{client.company}</p>
                        )}
                      </div>
                    </div>
                    <div className={cn("text-lg font-bold", scoreColor(client.seo_health_score))}>
                      {client.seo_health_score}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                    <span>{client.website_count} {client.website_count === 1 ? "website" : "websites"}</span>
                    {client.industry && <span>• {client.industry}</span>}
                  </div>

                  <div className="flex items-center gap-2">
                    <Link href={`/clients/${client.id}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        <ExternalLink className="h-3.5 w-3.5 mr-1" /> View
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Delete ${client.name}?`)) deleteMutation.mutate(client.id);
                      }}
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
  );
}
