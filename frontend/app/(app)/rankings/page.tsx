"use client";
import { Header } from "@/components/layout/Header";
import { TrendingUp } from "lucide-react";

export default function RankingsPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Rankings" description="Keyword rankings from Google Search Console" />
      <div className="flex-1 flex items-center justify-center text-center">
        <div>
          <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-40" />
          <h3 className="font-semibold mb-2">Rankings Tracking</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Connect Google Search Console to track keyword rankings automatically.
            Data pulls weekly and shows position changes over time.
          </p>
        </div>
      </div>
    </div>
  );
}
