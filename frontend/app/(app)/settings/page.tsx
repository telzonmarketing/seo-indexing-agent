"use client";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings, Key, Bot, Database } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Settings" description="Configure SEO OS" />
      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-4 w-4" /> AI Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Ollama Host</label>
              <Input defaultValue="http://localhost:11434" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">AI Model</label>
              <Input defaultValue="deepseek-r1:8b" placeholder="deepseek-r1:8b, qwen2.5:7b, llama3.2..." />
            </div>
            <Button size="sm">Save AI Settings</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="h-4 w-4" /> Google API
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Google Client ID</label>
              <Input type="password" placeholder="OAuth Client ID" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Google Client Secret</label>
              <Input type="password" placeholder="OAuth Client Secret" />
            </div>
            <Button size="sm">Save Google Settings</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4" /> Crawler Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Max Pages per Crawl</label>
              <Input type="number" defaultValue="200" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Crawl Delay (ms)</label>
              <Input type="number" defaultValue="300" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Default Crawl Frequency (hours)</label>
              <Input type="number" defaultValue="168" />
            </div>
            <Button size="sm">Save Crawler Settings</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
