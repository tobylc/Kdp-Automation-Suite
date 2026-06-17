import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAiProviderConfig,
  useUpdateAiProviderConfig,
  useTestAiProviderConnection,
  getGetAiProviderConfigQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Bot, Save, FlaskConical, Eye, EyeOff, ExternalLink, CheckCircle2, XCircle, Zap, Shield } from "lucide-react";

const PROVIDERS = [
  {
    id: "anthropic" as const,
    label: "Anthropic (Claude)",
    description: "Direct Anthropic API. Leave API key blank to use Replit integration.",
    docsUrl: "https://console.anthropic.com/settings/keys",
    models: [
      { id: "claude-sonnet-4-6", label: "claude-sonnet-4-6 (recommended)" },
      { id: "claude-sonnet-4-5", label: "claude-sonnet-4-5" },
      { id: "claude-3-5-sonnet-20241022", label: "claude-3-5-sonnet (stable)" },
      { id: "claude-3-haiku-20240307", label: "claude-3-haiku (fastest)" },
    ],
  },
  {
    id: "openrouter" as const,
    label: "OpenRouter (300+ models)",
    description: "Single key — Claude, GPT-4o, Gemini, Llama, free tier models. Best for smart routing.",
    docsUrl: "https://openrouter.ai/keys",
    models: [
      // ── Free tier (vision-capable) ──────────────────────────────────────
      { id: "google/gemma-4-31b-it:free",       label: "Google: Gemma 4 31B — free, vision" },
      { id: "google/gemma-4-26b-a4b-it:free",   label: "Google: Gemma 4 26B A4B — free, vision" },
      { id: "nvidia/nemotron-nano-12b-v2-vl:free", label: "NVIDIA: Nemotron Nano 12B VL — free, vision" },
      // ── Google Gemini ───────────────────────────────────────────────────
      { id: "google/gemini-2.5-flash-lite",     label: "Google: Gemini 2.5 Flash Lite — ~$0.10/M, fast vision ✓" },
      { id: "google/gemini-2.5-flash",          label: "Google: Gemini 2.5 Flash — ~$0.30/M, excellent vision ✓" },
      { id: "google/gemini-2.5-pro",            label: "Google: Gemini 2.5 Pro — ~$1.25/M, best Google vision" },
      // ── OpenAI ─────────────────────────────────────────────────────────
      { id: "openai/gpt-4o-mini",               label: "OpenAI: GPT-4o mini — ~$0.15/M, vision" },
      { id: "openai/gpt-4.1-mini",              label: "OpenAI: GPT-4.1 mini — ~$0.40/M, vision" },
      { id: "openai/gpt-4o",                    label: "OpenAI: GPT-4o — ~$2.50/M, premium vision ✓" },
      { id: "openai/gpt-4.1",                   label: "OpenAI: GPT-4.1 — ~$2/M, vision" },
      // ── Meta Llama ──────────────────────────────────────────────────────
      { id: "meta-llama/llama-4-maverick",      label: "Meta: Llama 4 Maverick — ~$0.15/M, vision" },
      { id: "meta-llama/llama-4-scout",         label: "Meta: Llama 4 Scout — ~$0.08/M, vision" },
      // ── Anthropic ───────────────────────────────────────────────────────
      { id: "anthropic/claude-3-haiku",         label: "Anthropic: Claude 3 Haiku — ~$0.25/M, reliable" },
      { id: "anthropic/claude-3.5-haiku",       label: "Anthropic: Claude 3.5 Haiku — ~$0.80/M, reliable" },
      { id: "anthropic/claude-3.5-sonnet",      label: "Anthropic: Claude 3.5 Sonnet — ~$3/M, best vision" },
      { id: "anthropic/claude-sonnet-4-5",      label: "Anthropic: Claude Sonnet 4.5 — ~$3/M, latest" },
    ],
  },
  {
    id: "openai" as const,
    label: "OpenAI (direct)",
    description: "Direct OpenAI API using your own key.",
    docsUrl: "https://platform.openai.com/api-keys",
    models: [
      { id: "gpt-4o", label: "GPT-4o (vision, recommended)" },
      { id: "gpt-4o-mini", label: "GPT-4o mini (cheaper)" },
      { id: "gpt-4-turbo", label: "GPT-4 Turbo (vision)" },
    ],
  },
];

type Provider = "anthropic" | "openai" | "openrouter";

function ModelSelect({
  providerObj,
  value,
  onChange,
  customValue,
  onCustomChange,
}: {
  providerObj: typeof PROVIDERS[number];
  value: string;
  onChange: (v: string) => void;
  customValue: string;
  onCustomChange: (v: string) => void;
}) {
  const isCustom = value === "__custom" || (!providerObj.models.find((m) => m.id === value) && value !== "");
  const selectVal = isCustom ? "__custom" : value;

  return (
    <div className="space-y-2">
      <select
        value={selectVal}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {providerObj.models.map((m) => (
          <option key={m.id} value={m.id}>{m.label}</option>
        ))}
        <option value="__custom">Custom model ID...</option>
      </select>
      {selectVal === "__custom" && (
        <Input
          placeholder="e.g. anthropic/claude-3-opus or google/gemini-flash"
          value={customValue}
          onChange={(e) => onCustomChange(e.target.value)}
          className="font-mono text-sm"
        />
      )}
    </div>
  );
}

function ApiKeyInput({
  value,
  onChange,
  hasStored,
  sameProviderAsStored,
  providerName,
  docsUrl,
  label = "API Key",
}: {
  value: string;
  onChange: (v: string) => void;
  hasStored: boolean;
  sameProviderAsStored: boolean;
  providerName: string;
  docsUrl: string;
  label?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <a href={docsUrl} target="_blank" rel="noopener noreferrer"
          className="text-xs text-primary flex items-center gap-1 hover:underline">
          Get key <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            hasStored && sameProviderAsStored
              ? "Leave blank to keep existing key"
              : providerName === "anthropic" && !hasStored
              ? "Leave blank to use Replit integration"
              : "Enter your API key"
          }
          className="font-mono text-sm pr-10"
        />
        <button type="button" onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {providerName === "anthropic" && (
        <p className="text-xs text-muted-foreground">Leave blank to use the built-in Replit integration.</p>
      )}
    </div>
  );
}

export default function AiProviderPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: config, isLoading } = useGetAiProviderConfig();

  // Primary model
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [customModel, setCustomModel] = useState("");
  const [apiKey, setApiKey] = useState("");

  // Smart routing
  const [smartRoutingEnabled, setSmartRoutingEnabled] = useState(false);
  const [fallbackProvider, setFallbackProvider] = useState<Provider>("anthropic");
  const [fallbackModel, setFallbackModel] = useState("claude-sonnet-4-6");
  const [fallbackCustomModel, setFallbackCustomModel] = useState("");
  const [fallbackApiKey, setFallbackApiKey] = useState("");

  const [testResult, setTestResult] = useState<{
    primary: { success: boolean; message: string };
    fallback?: { success: boolean; message: string; model: string };
  } | null>(null);

  useEffect(() => {
    if (config) {
      setProvider(config.provider as Provider);
      setModel(config.model);
      setSmartRoutingEnabled(config.smartRoutingEnabled);
      if (config.fallbackProvider) setFallbackProvider(config.fallbackProvider as Provider);
      if (config.fallbackModel) setFallbackModel(config.fallbackModel);
      setApiKey("");
      setFallbackApiKey("");
      setTestResult(null);
    }
  }, [config]);

  const primaryProviderObj = PROVIDERS.find((p) => p.id === provider)!;
  const fallbackProviderObj = PROVIDERS.find((p) => p.id === fallbackProvider)!;

  const resolvedModel = model === "__custom" ? customModel : model;
  const resolvedFallbackModel = fallbackModel === "__custom" ? fallbackCustomModel : fallbackModel;

  const saveMutation = useUpdateAiProviderConfig({
    mutation: {
      onSuccess: () => {
        toast({ title: "Settings Saved", description: `${provider}/${resolvedModel}${smartRoutingEnabled ? ` → ${fallbackProvider}/${resolvedFallbackModel}` : ""}` });
        queryClient.invalidateQueries({ queryKey: getGetAiProviderConfigQueryKey() });
        setApiKey("");
        setFallbackApiKey("");
      },
      onError: (err) => {
        const msg = (err as any).data?.error ?? (err as any).message ?? "Save failed";
        toast({ title: "Save Failed", description: msg, variant: "destructive" });
      },
    },
  });

  const testMutation = useTestAiProviderConnection({
    mutation: {
      onSuccess: (data) => {
        setTestResult({
          primary: { success: data.success, message: data.message },
          fallback: data.fallbackResult as { success: boolean; message: string; model: string } | undefined,
        });
      },
      onError: (err) => {
        const msg = (err as any).data?.error ?? (err as any).message ?? "Test failed";
        setTestResult({ primary: { success: false, message: msg } });
      },
    },
  });

  const handleSave = () => {
    saveMutation.mutate({
      data: {
        provider,
        model: resolvedModel,
        apiKey: apiKey.trim() === "" ? undefined : apiKey.trim(),
        smartRoutingEnabled,
        fallbackProvider: smartRoutingEnabled ? fallbackProvider : null,
        fallbackModel: smartRoutingEnabled ? resolvedFallbackModel : null,
        fallbackApiKey: fallbackApiKey.trim() === "" ? undefined : fallbackApiKey.trim(),
      },
    });
  };

  if (isLoading) {
    return <div className="p-10 flex justify-center text-muted-foreground">Loading AI provider config...</div>;
  }

  const isDirty =
    provider !== config?.provider ||
    model !== config?.model ||
    apiKey.trim() !== "" ||
    fallbackApiKey.trim() !== "" ||
    smartRoutingEnabled !== config?.smartRoutingEnabled ||
    (smartRoutingEnabled && fallbackProvider !== config?.fallbackProvider) ||
    (smartRoutingEnabled && resolvedFallbackModel !== config?.fallbackModel);

  return (
    <div className="p-6 lg:p-10 max-w-3xl mx-auto w-full flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Provider Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure which model powers KDP uploads. Enable smart routing to use a free model first
          and automatically fall back to a reliable model only when needed.
        </p>
      </div>

      {/* Active summary */}
      {config && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/30 border rounded-lg text-sm">
          <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">Active:</span>
          <Badge variant="outline" className="font-mono">{config.provider}</Badge>
          <span className="font-mono text-xs text-muted-foreground truncate">{config.model}</span>
          {config.smartRoutingEnabled && config.fallbackModel && (
            <>
              <span className="text-muted-foreground">→ fallback:</span>
              <Badge variant="secondary" className="font-mono">{config.fallbackProvider}</Badge>
              <span className="font-mono text-xs text-muted-foreground truncate">{config.fallbackModel}</span>
            </>
          )}
          {config.smartRoutingEnabled && (
            <Badge className="ml-auto bg-amber-100 text-amber-800 border-amber-200">Smart Routing ON</Badge>
          )}
        </div>
      )}

      {/* ── Primary model ────────────────────────────────────────────────── */}
      <Card className="shadow-sm border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-amber-500" />
            Primary Model
          </CardTitle>
          <CardDescription>
            This model handles every KDP upload step. For maximum economy, pick a free/cheap model here
            and set a reliable fallback below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Provider tiles */}
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground">Provider</Label>
            <div className="grid gap-2">
              {PROVIDERS.map((p) => (
                <button key={p.id} onClick={() => { setProvider(p.id); setModel(p.models[0].id); setTestResult(null); }}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    provider === p.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border hover:border-muted-foreground/40 hover:bg-muted/20"
                  }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-sm">{p.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{p.description}</div>
                    </div>
                    {provider === p.id && <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground">Model</Label>
            <ModelSelect
              providerObj={primaryProviderObj}
              value={model}
              onChange={(v) => { setModel(v); setTestResult(null); }}
              customValue={customModel}
              onCustomChange={setCustomModel}
            />
          </div>

          <ApiKeyInput
            value={apiKey}
            onChange={(v) => { setApiKey(v); setTestResult(null); }}
            hasStored={!!config?.hasApiKey}
            sameProviderAsStored={config?.provider === provider}
            providerName={provider}
            docsUrl={primaryProviderObj.docsUrl}
          />
        </CardContent>
      </Card>

      {/* ── Smart routing toggle ─────────────────────────────────────────── */}
      <Card className={`shadow-sm border transition-colors ${smartRoutingEnabled ? "border-amber-200 bg-amber-50/40" : ""}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-base">Smart Routing / Fallback</CardTitle>
            </div>
            <button
              onClick={() => setSmartRoutingEnabled(!smartRoutingEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                smartRoutingEnabled ? "bg-amber-500" : "bg-muted-foreground/30"
              }`}
              role="switch"
              aria-checked={smartRoutingEnabled}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                smartRoutingEnabled ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>
          <CardDescription>
            When enabled: try the primary model first. If it fails (out of credits, rate limit, error) <em>or</em> returns
            an uncertain response, automatically retry with the fallback model — at no extra cost unless actually needed.
          </CardDescription>
        </CardHeader>

        {smartRoutingEnabled && (
          <CardContent className="space-y-5 border-t pt-5">
            <div className="p-3 rounded-lg bg-amber-100/60 border border-amber-200 text-xs text-amber-900 space-y-1">
              <p><strong>Suggested setup (low cost):</strong></p>
              <p>Primary → <code>google/gemini-2.5-flash-lite</code> via OpenRouter (~$0.10/M, confirmed working)</p>
              <p>Fallback → <code>openai/gpt-4o</code> via OpenRouter (~$2.50/M, fires only when primary fails)</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">Fallback Provider</Label>
              <div className="grid gap-2">
                {PROVIDERS.map((p) => (
                  <button key={p.id} onClick={() => { setFallbackProvider(p.id); setFallbackModel(p.models[0].id); }}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      fallbackProvider === p.id
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "border-border hover:border-muted-foreground/40 hover:bg-muted/20"
                    }`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-sm">{p.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{p.description}</div>
                      </div>
                      {fallbackProvider === p.id && <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">Fallback Model</Label>
              <ModelSelect
                providerObj={fallbackProviderObj}
                value={fallbackModel}
                onChange={setFallbackModel}
                customValue={fallbackCustomModel}
                onCustomChange={setFallbackCustomModel}
              />
            </div>

            <ApiKeyInput
              value={fallbackApiKey}
              onChange={setFallbackApiKey}
              hasStored={!!config?.hasFallbackApiKey}
              sameProviderAsStored={config?.fallbackProvider === fallbackProvider}
              providerName={fallbackProvider}
              docsUrl={fallbackProviderObj.docsUrl}
              label="Fallback API Key"
            />
          </CardContent>
        )}

        {/* Test result */}
        {testResult && (
          <CardContent className="border-t pt-4 space-y-2">
            <div className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${
              testResult.primary.success ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"
            }`}>
              {testResult.primary.success
                ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
              <div>
                <div className="font-medium text-xs mb-0.5">Primary</div>
                {testResult.primary.message}
              </div>
            </div>
            {testResult.fallback && (
              <div className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${
                testResult.fallback.success ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"
              }`}>
                {testResult.fallback.success
                  ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                  : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                <div>
                  <div className="font-medium text-xs mb-0.5">Fallback ({testResult.fallback.model})</div>
                  {testResult.fallback.message}
                </div>
              </div>
            )}
          </CardContent>
        )}

        <CardFooter className="border-t bg-muted/10 p-4 flex justify-between gap-3">
          <Button variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending} className="font-mono text-sm">
            <FlaskConical className="mr-2 h-4 w-4" />
            {testMutation.isPending ? "TESTING..." : "TEST_CONNECTION"}
          </Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending || !isDirty} className="font-mono text-sm">
            <Save className="mr-2 h-4 w-4" />
            {saveMutation.isPending ? "SAVING..." : "SAVE_CONFIG"}
          </Button>
        </CardFooter>
      </Card>

      {/* Reference card */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Cost Guide</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p><strong className="text-foreground">Book discovery &amp; shelf scan</strong> — already free (HTML scraping, no AI).</p>
          <p><strong className="text-foreground">KDP upload agent</strong> — the only AI cost. Vision required for every step.</p>
          <p><strong className="text-foreground">Recommended low-cost setup</strong> — Primary: <code>google/gemini-2.5-flash-lite</code> (OpenRouter, ~$0.10/M, confirmed working). Fallback: <code>openai/gpt-4o</code> (fires only on failure/uncertainty). Estimated cost: ~$0.01–0.05 per book upload.</p>
          <p><strong className="text-foreground">OpenRouter</strong> — <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">openrouter.ai</a> — one key, hundreds of models, free tiers available.</p>
        </CardContent>
      </Card>
    </div>
  );
}
