"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clientsApi } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

export default function NewClientPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    industry: "",
    notes: "",
  });

  const mutation = useMutation({
    mutationFn: (data: any) => clientsApi.create(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Client created!");
      router.push(`/clients/${res.data.id}`);
    },
    onError: () => toast.error("Failed to create client"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Client name is required"); return; }
    mutation.mutate(form);
  };

  const field = (label: string, key: keyof typeof form, required?: boolean, placeholder?: string) => (
    <div>
      <label className="block text-sm font-medium mb-1.5">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      <Input
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        required={required}
      />
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <Header
        title="New Client"
        description="Add a new client to your SEO OS"
        actions={
          <Link href="/clients">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Client Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {field("Client Name", "name", true, "Acme Corporation")}
                {field("Email", "email", false, "contact@acme.com")}
                {field("Phone", "phone", false, "+1 (555) 000-0000")}
                {field("Company", "company", false, "Acme Corp")}
                {field("Industry", "industry", false, "E-commerce, SaaS, Healthcare...")}
                <div>
                  <label className="block text-sm font-medium mb-1.5">Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="WordPress site, English market, targeting US..."
                    rows={3}
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button type="submit" disabled={mutation.isPending} className="gap-2">
                <Save className="h-4 w-4" />
                {mutation.isPending ? "Creating..." : "Create Client"}
              </Button>
              <Link href="/clients">
                <Button type="button" variant="outline">Cancel</Button>
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
