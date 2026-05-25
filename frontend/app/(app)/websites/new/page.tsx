"use client";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, Suspense } from "react";
import { useMutation } from "@tanstack/react-query";
import { websiteSetupApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft, ArrowRight, CheckCircle2, Globe, Shield, Plug,
  Search, Zap, LayoutDashboard, RefreshCw, Copy, ExternalLink,
  AlertCircle, Info,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

const STEPS = [
  { num: 1, label: "Add URL", icon: Globe },
  { num: 2, label: "Verify Ownership", icon: Shield },
  { num: 3, label: "Connect Integrations", icon: Plug },
  { num: 4, label: "Run Crawl", icon: Search },
  { num: 5, label: "Initialize AI", icon: Zap },
  { num: 6, label: "Dashboard Ready", icon: LayoutDashboard },
];

const CMS_COLORS: Record<string, string> = {
  wordpress: "bg-blue-50 text-blue-700 border-blue-200",
  shopify: "bg-green-50 text-green-700 border-green-200",
  nextjs: "bg-slate-800 text-white border-slate-600",
  react: "bg-cyan-50 text-cyan-700 border-cyan-200",
  webflow: "bg-purple-50 text-purple-700 border-purple-200",
  wix: "bg-yellow-50 text-yellow-700 border-yellow-200",
  custom_html: "bg-gray-50 text-gray-700 border-gray-200",
  unknown: "bg-gray-50 text-gray-500 border-gray-200",
};

function StepBadge({ step, current }: { step: typeof STEPS[0]; current: number }) {
  const done = current > step.num;
  const active = current === step.num;
  const Icon = step.icon;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={cn(
        "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
        done ? "bg-green-500 border-green-500 text-white" :
        active ? "bg-primary border-primary text-white" :
        "bg-background border-muted text-muted-foreground"
      )}>
        {done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
      </div>
      <span className={cn("text-xs font-medium whitespace-nowrap", active ? "text-primary" : "text-muted-foreground")}>
        {step.label}
      </span>
    </div>
  );
}

function WizardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const clientId = searchParams.get("client_id") || "";

  const [currentStep, setCurrentStep] = useState(1);
  const [websiteId, setWebsiteId] = useState("");
  const [url, setUrl] = useState("");
  const [detection, setDetection] = useState<any>(null);
  const [verifyInstructions, setVerifyInstructions] = useState<any>(null);
  const [verifyToken, setVerifyToken] = useState("");
  const [integrations, setIntegrations] = useState({
    wordpress_api_url: "",
    gsc_connected: false,
    ga4_connected: false,
    cloudflare_connected: false,
    github_repo: "",
  });
  const [crawlResult, setCrawlResult] = useState<any>(null);
  const [agentsResult, setAgentsResult] = useState<any>(null);
  const [completedWebsiteId, setCompletedWebsiteId] = useState("");

  // Step 1: Add URL
  const step1Mutation = useMutation({
    mutationFn: () => websiteSetupApi.step1({ client_id: clientId, url }),
    onSuccess: (res) => {
      const data = res.data;
      setWebsiteId(data.website.id);
      setDetection(data.detection);
      toast.success("Website detected! Moving to verification.");
      setCurrentStep(2);
    },
    onError: () => toast.error("Failed to detect website. Check the URL and try again."),
  });

  // Step 2: Verify
  const step2VerifyMutation = useMutation({
    mutationFn: () => websiteSetupApi.step2Verify({ website_id: websiteId, verification_method: "meta_tag" }),
    onSuccess: (res) => {
      setVerifyInstructions(res.data.instructions);
      setVerifyToken(res.data.verification_token);
    },
    onError: () => toast.error("Verification setup failed"),
  });

  const step2ConfirmMutation = useMutation({
    mutationFn: () => websiteSetupApi.step2Confirm(websiteId),
    onSuccess: (res) => {
      if (res.data.verified) {
        toast.success("Ownership verified! ✅");
        setCurrentStep(3);
      } else {
        toast.error("Verification failed. Make sure the meta tag is added.");
      }
    },
  });

  // Step 3: Integrations
  const step3Mutation = useMutation({
    mutationFn: () => websiteSetupApi.step3({ website_id: websiteId, ...integrations }),
    onSuccess: (res) => {
      toast.success(`Integrations saved. Mode: ${res.data.bot_mode}`);
      setCurrentStep(4);
    },
    onError: () => toast.error("Failed to save integrations"),
  });

  // Step 4: Crawl
  const step4Mutation = useMutation({
    mutationFn: () => websiteSetupApi.step4({ website_id: websiteId, max_pages: 200 }),
    onSuccess: (res) => {
      setCrawlResult(res.data);
      toast.success("Crawl started! Moving to agent initialization.");
      setCurrentStep(5);
    },
    onError: () => toast.error("Failed to start crawl"),
  });

  // Step 5: Initialize agents
  const step5Mutation = useMutation({
    mutationFn: () => websiteSetupApi.step5(websiteId),
    onSuccess: (res) => {
      setAgentsResult(res.data);
      toast.success("AI agents initialized!");
      setCurrentStep(6);
    },
    onError: () => toast.error("Failed to initialize agents"),
  });

  // Step 6: Complete
  const step6Mutation = useMutation({
    mutationFn: () => websiteSetupApi.step6({ website_id: websiteId }),
    onSuccess: (res) => {
      setCompletedWebsiteId(websiteId);
      toast.success("🎉 Website successfully onboarded!");
    },
    onError: () => toast.error("Failed to complete onboarding"),
  });

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-4 p-6 border-b">
        {clientId ? (
          <Link href={`/clients/${clientId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to Client
            </Button>
          </Link>
        ) : (
          <Link href="/websites">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </Link>
        )}
        <div>
          <h1 className="text-lg font-bold">Connect a Website</h1>
          <p className="text-sm text-muted-foreground">6-step setup wizard — CMS detection, verification & AI agents</p>
        </div>
      </div>

      {/* Step Progress */}
      <div className="px-6 py-5 border-b bg-muted/30">
        <div className="flex items-start justify-between max-w-3xl mx-auto">
          {STEPS.map((step, i) => (
            <div key={step.num} className="flex items-center">
              <StepBadge step={step} current={currentStep} />
              {i < STEPS.length - 1 && (
                <div className={cn(
                  "h-0.5 w-12 sm:w-20 mx-1 mt-[-20px] transition-colors",
                  currentStep > step.num ? "bg-green-500" : "bg-muted"
                )} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="flex-1 p-6 max-w-2xl mx-auto w-full">

        {/* ── STEP 1: Add URL ── */}
        {currentStep === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold mb-1">Enter Website URL</h2>
              <p className="text-muted-foreground text-sm">We'll automatically detect the CMS, framework, hosting, and integrations.</p>
            </div>

            <Card>
              <CardContent className="pt-5 pb-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Website URL</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://example.com"
                      className="flex-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onKeyDown={(e) => e.key === "Enter" && url && step1Mutation.mutate()}
                    />
                    <Button
                      onClick={() => step1Mutation.mutate()}
                      disabled={!url || step1Mutation.isPending}
                    >
                      {step1Mutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <Search className="h-4 w-4 mr-1" />}
                      {step1Mutation.isPending ? "Detecting..." : "Detect"}
                    </Button>
                  </div>
                </div>

                <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>We'll check for WordPress, Shopify, Next.js, Wix, Webflow, sitemap, schema, analytics, and more automatically.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {detection && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" /> Detection Results
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <span className={cn("text-sm font-medium px-3 py-1 rounded-full border", CMS_COLORS[detection.cms_type] ?? CMS_COLORS.unknown)}>
                      {detection.framework_detected || detection.cms_type || "Unknown"}
                    </span>
                    {detection.hosting_provider && (
                      <span className="text-sm px-3 py-1 rounded-full bg-gray-100 text-gray-700 border">
                        🖥 {detection.hosting_provider}
                      </span>
                    )}
                    {detection.cdn_detected && (
                      <span className="text-sm px-3 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                        ⚡ {detection.cdn_detected}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    {[
                      { label: "SSL", val: detection.has_ssl },
                      { label: "Sitemap", val: detection.has_sitemap },
                      { label: "Robots.txt", val: detection.has_robots_txt },
                      { label: "Schema", val: detection.has_schema },
                      { label: "Analytics", val: detection.has_analytics },
                      { label: "Tag Manager", val: detection.has_tag_manager },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center gap-1.5">
                        {item.val
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          : <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                        <span className={item.val ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                  {detection.page_title && (
                    <p className="text-xs text-muted-foreground">📄 {detection.page_title}</p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Confidence: <strong className="text-foreground">{detection.detection_confidence}</strong></span>
                    {detection.response_time_ms && <span>Response: {detection.response_time_ms}ms</span>}
                    {detection.status_code && <span>HTTP {detection.status_code}</span>}
                  </div>
                  <div className="pt-2">
                    <p className="text-xs font-medium mb-1 text-muted-foreground">Bot Execution Mode:</p>
                    <span className={cn("text-sm font-medium px-3 py-1 rounded-full border", {
                      "bg-green-50 text-green-700 border-green-200": detection.bot_execution_mode === "fully_automated",
                      "bg-blue-50 text-blue-700 border-blue-200": detection.bot_execution_mode === "partial_automation",
                      "bg-orange-50 text-orange-700 border-orange-200": detection.bot_execution_mode === "recommendation_only",
                    })}>
                      {detection.bot_execution_mode === "fully_automated" && "⚡ Fully Automated"}
                      {detection.bot_execution_mode === "partial_automation" && "🔵 Partial Automation (WordPress API)"}
                      {detection.bot_execution_mode === "recommendation_only" && "📋 Recommendation Only"}
                    </span>
                  </div>
                  <Button className="w-full" onClick={() => setCurrentStep(2)}>
                    Continue to Verification <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ── STEP 2: Verify ── */}
        {currentStep === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold mb-1">Verify Website Ownership</h2>
              <p className="text-muted-foreground text-sm">Prove you control this website by adding a verification tag.</p>
            </div>

            {!verifyInstructions ? (
              <Card>
                <CardContent className="pt-5 pb-5 text-center">
                  <Shield className="h-10 w-10 mx-auto mb-3 text-primary/60" />
                  <p className="text-sm text-muted-foreground mb-4">Click below to generate your verification token and instructions.</p>
                  <Button onClick={() => step2VerifyMutation.mutate()} disabled={step2VerifyMutation.isPending}>
                    {step2VerifyMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <Shield className="h-4 w-4 mr-1" />}
                    Generate Verification Token
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Option 1 — Meta Tag (Recommended)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground mb-2">Add this tag inside the &lt;head&gt; of your homepage:</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-muted rounded px-3 py-2 font-mono break-all">
                        {verifyInstructions.meta_tag}
                      </code>
                      <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(verifyInstructions.meta_tag); toast.success("Copied!"); }}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Option 2 — DNS TXT Record</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <code className="text-xs bg-muted rounded px-3 py-2 font-mono block break-all">
                      {verifyInstructions.dns_txt}
                    </code>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Option 3 — HTML File Upload</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">{verifyInstructions.html_file}</p>
                  </CardContent>
                </Card>

                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="pt-4 pb-4">
                    <p className="text-sm font-medium mb-2">After adding the verification tag:</p>
                    <Button
                      className="w-full"
                      onClick={() => step2ConfirmMutation.mutate()}
                      disabled={step2ConfirmMutation.isPending}
                    >
                      {step2ConfirmMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                      Confirm Verification
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2 text-center">In development mode, verification auto-passes.</p>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Integrations ── */}
        {currentStep === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold mb-1">Connect Integrations</h2>
              <p className="text-muted-foreground text-sm">Connect tools to enable automation. You can skip any and add them later.</p>
            </div>

            <div className="space-y-3">
              {/* WordPress */}
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xl">🔵</span>
                    <div>
                      <p className="font-medium text-sm">WordPress REST API</p>
                      <p className="text-xs text-muted-foreground">Enables: auto blog posting, schema injection, meta updates</p>
                    </div>
                  </div>
                  <input
                    type="url"
                    placeholder="https://your-site.com/wp-json"
                    value={integrations.wordpress_api_url}
                    onChange={(e) => setIntegrations({ ...integrations, wordpress_api_url: e.target.value })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </CardContent>
              </Card>

              {/* GitHub */}
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xl">⚡</span>
                    <div>
                      <p className="font-medium text-sm">GitHub Repository</p>
                      <p className="text-xs text-muted-foreground">Enables: auto-commit fixes, auto-deploy, full automation mode</p>
                    </div>
                  </div>
                  <input
                    type="text"
                    placeholder="owner/repo-name"
                    value={integrations.github_repo}
                    onChange={(e) => setIntegrations({ ...integrations, github_repo: e.target.value })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </CardContent>
              </Card>

              {/* Toggle integrations */}
              {[
                { key: "gsc_connected", label: "Google Search Console", emoji: "🔍", desc: "Ranking data, impressions, clicks, indexing status" },
                { key: "ga4_connected", label: "Google Analytics 4", emoji: "📊", desc: "Traffic, conversions, user behavior data" },
                { key: "cloudflare_connected", label: "Cloudflare", emoji: "🛡", desc: "CDN performance, cache purging, page rules" },
              ].map((int) => (
                <Card key={int.key}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{int.emoji}</span>
                        <div>
                          <p className="font-medium text-sm">{int.label}</p>
                          <p className="text-xs text-muted-foreground">{int.desc}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setIntegrations({ ...integrations, [int.key]: !integrations[int.key as keyof typeof integrations] })}
                        className={cn(
                          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                          integrations[int.key as keyof typeof integrations] ? "bg-primary" : "bg-muted"
                        )}
                      >
                        <span className={cn(
                          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                          integrations[int.key as keyof typeof integrations] ? "translate-x-6" : "translate-x-1"
                        )} />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => { setIntegrations({ wordpress_api_url: "", gsc_connected: false, ga4_connected: false, cloudflare_connected: false, github_repo: "" }); step3Mutation.mutate(); }}>
                Skip (Recommendation Mode)
              </Button>
              <Button className="flex-1" onClick={() => step3Mutation.mutate()} disabled={step3Mutation.isPending}>
                {step3Mutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <ArrowRight className="h-4 w-4 mr-1" />}
                Save & Continue
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Crawl ── */}
        {currentStep === 4 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold mb-1">Run Onboarding Crawl</h2>
              <p className="text-muted-foreground text-sm">We'll crawl up to 200 pages, check all technical SEO issues, and generate your first score.</p>
            </div>

            <Card>
              <CardContent className="pt-6 pb-6 text-center">
                {!crawlResult ? (
                  <>
                    <Search className="h-12 w-12 mx-auto mb-4 text-primary/60" />
                    <p className="font-medium mb-2">Ready to crawl</p>
                    <p className="text-sm text-muted-foreground mb-5">This will check meta tags, headings, images, schema, page speed, and more across all pages.</p>
                    <Button size="lg" onClick={() => step4Mutation.mutate()} disabled={step4Mutation.isPending} className="w-full max-w-xs">
                      {step4Mutation.isPending ? <RefreshCw className="h-5 w-5 animate-spin mr-2" /> : <Search className="h-5 w-5 mr-2" />}
                      {step4Mutation.isPending ? "Starting crawl..." : "Start Crawl"}
                    </Button>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
                    <p className="font-medium mb-1">Crawl Started!</p>
                    <p className="text-sm text-muted-foreground mb-3">The crawl is running in the background. You'll see results in the website dashboard.</p>
                    <p className="text-xs text-muted-foreground">Crawl ID: {crawlResult.crawl_id}</p>
                    <Button className="mt-4 w-full" onClick={() => setCurrentStep(5)}>
                      Continue to AI Initialization <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── STEP 5: Initialize AI ── */}
        {currentStep === 5 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold mb-1">Initialize AI Agents</h2>
              <p className="text-muted-foreground text-sm">Start all 8 autonomous AI agents for this website.</p>
            </div>

            <Card>
              <CardContent className="pt-5 pb-5">
                <div className="grid grid-cols-2 gap-2 mb-5">
                  {[
                    "🔧 Technical SEO Agent",
                    "✍️ Content Agent",
                    "💡 Blog Idea Agent",
                    "🔗 Backlink Agent",
                    "🧠 Semantic SEO Agent",
                    "🤖 AI Search Agent",
                    "👁 Competitor Agent",
                    "📊 Reporting Agent",
                  ].map((agent) => (
                    <div key={agent} className={cn(
                      "flex items-center gap-2 text-sm rounded-md p-2.5 border transition-all",
                      agentsResult ? "bg-green-50 border-green-200 text-green-800" : "bg-muted/50 text-muted-foreground"
                    )}>
                      {agentsResult && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                      {agent}
                    </div>
                  ))}
                </div>

                {!agentsResult ? (
                  <Button className="w-full" onClick={() => step5Mutation.mutate()} disabled={step5Mutation.isPending}>
                    {step5Mutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
                    {step5Mutation.isPending ? "Initializing agents..." : "Initialize All Agents"}
                  </Button>
                ) : (
                  <Button className="w-full" onClick={() => setCurrentStep(6)}>
                    All agents initialized! Continue <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── STEP 6: Complete ── */}
        {currentStep === 6 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold mb-1">Complete Setup</h2>
              <p className="text-muted-foreground text-sm">Almost there! Finalize the setup to activate your dashboard.</p>
            </div>

            {!completedWebsiteId ? (
              <Card>
                <CardContent className="pt-6 pb-6 text-center">
                  <LayoutDashboard className="h-12 w-12 mx-auto mb-4 text-primary/60" />
                  <p className="font-medium mb-2">Everything is ready</p>
                  <p className="text-sm text-muted-foreground mb-5">Click below to complete setup and go to your dashboard.</p>
                  <Button size="lg" className="w-full max-w-xs" onClick={() => step6Mutation.mutate()} disabled={step6Mutation.isPending}>
                    {step6Mutation.isPending ? <RefreshCw className="h-5 w-5 animate-spin mr-2" /> : <CheckCircle2 className="h-5 w-5 mr-2" />}
                    Complete & Open Dashboard
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-green-200 bg-green-50">
                <CardContent className="pt-6 pb-6 text-center">
                  <CheckCircle2 className="h-14 w-14 mx-auto mb-4 text-green-500" />
                  <h3 className="text-lg font-bold text-green-900 mb-2">🎉 Website Successfully Onboarded!</h3>
                  <p className="text-sm text-green-700 mb-5">All AI agents are running. Your SEO OS is now monitoring this website 24/7.</p>
                  <div className="flex gap-3 justify-center">
                    <Link href={`/websites/${completedWebsiteId}`}>
                      <Button>
                        <ExternalLink className="h-4 w-4 mr-1" /> View Website Dashboard
                      </Button>
                    </Link>
                    {clientId && (
                      <Link href={`/clients/${clientId}`}>
                        <Button variant="outline">
                          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Client
                        </Button>
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

export default function NewWebsitePage() {
  return (
    <Suspense fallback={
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    }>
      <WizardContent />
    </Suspense>
  );
}
