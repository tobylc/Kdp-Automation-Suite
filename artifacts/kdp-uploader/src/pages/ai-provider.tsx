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
import { Bot, Save, FlaskConical, Eye, EyeOff, ExternalLink, CheckCircle2, XCircle } from "lucide-react";

const PROVIDERS = [
  {
    id: "anthropic" as const,
    label: "Anthropic (Claude)",
    description: "Direct Anthropic API — claude-sonnet, claude-haiku, etc. Leave API key blank to use Replit integration.",
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
    description: "Single API key that routes to Claude, GPT-4o, DeepSeek, Llama, and free models. Vision-capable models required for KDP uploads.",
    docsUrl: "https://openrouter.ai/keys",
    models: [
      { id: "anthropic/claude-sonnet-4-5", label: "Claude Sonnet 4.5 (via OpenRouter)" },
      { id: "anthropic/claude-3-5-sonnet", label: "Claude 3.5 Sonnet (via OpenRouter)" },
      { id: "openai/gpt-4o", label: "GPT-4o (vision)" },
      { id: "openai/gpt-4o-mini", label: "GPT-4o mini (cheaper)" },
      { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash (fast, free tier)" },
      { id: "meta-llama/llama-3.2-90b-vision-instruct", label: "Llama 3.2 90B Vision (free)" },
      { id: "deepseek/deepseek-chat", label: "DeepSeek Chat (text only — not for uploads)" },
    ],
  },
  {
    id: "openai" as const,
    label: "OpenAI (direct)",
    description: "Direct OpenAI API using your own key.",
    docsUrl: "https://platform.openai.com/api-keys",
    models: [
      { id: "gpt-4o", label: "GPT-4o (recommended, vision)" },
      { id: "gpt-4o-mini", label: "GPT-4o mini (cheaper)" },
      { id: "gpt-4-turbo", label: "GPT-4 Turbo (vision)" },
    ],
  },
];

export default function AiProviderPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: config, isLoading } = useGetAiProviderConfig();

  const [provider, setProvider] = useState<"anthropic" | "openai" | "openrouter">("anthropic");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (config) {
      setProvider(config.provider as typeof provider);
      setModel(config.model);
      setApiKey("");
    }
  }, [config]);

  const selectedProvider = PROVIDERS.find((p) => p.id === provider)!;

  const saveMutation = useUpdateAiProviderConfig({
    mutation: {
      onSuccess: () => {
        toast({ title: "Settings Saved", description: `Now using ${provider} / ${model}` });
        queryClient.invalidateQueries({ queryKey: getGetAiProviderConfigQueryKey() });
        setApiKey("");
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
        setTestResult({ success: data.success, message: data.message });
        toast({
          title: data.success ? "Connection OK" : "Connection Failed",
          description: data.message,
          variant: data.success ? "default" : "destructive",
        });
      },
      onError: (err) => {
        const msg = (err as any).data?.error ?? (err as any).message ?? "Test failed";
        setTestResult({ success: false, message: msg });
      },
    },
  });

  const handleSave = () => {
    saveMutation.mutate({
      data: {
        provider,
        model,
        apiKey: apiKey.trim() === "" ? undefined : apiKey.trim(),
      },
    });
  };

  if (isLoading) {
    return <div className="p-10 flex justify-center text-muted-foreground">Loading AI provider config...</div>;
  }

  const isDirty =
    provider !== config?.provider ||
    model !== config?.model ||
    apiKey.trim() !== "";

  return (
    <div className="p-6 lg:p-10 max-w-3xl mx-auto w-full flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Provider Settings</h1>
        <p className="text-muted-foreground mt-1">
          Choose which AI model powers the KDP upload agent. Vision capability is required.
        </p>
      </div>

      {/* Current config summary */}
      {config && (
        <div className="flex items-center gap-3 p-3 bg-muted/30 border rounded-lg text-sm">
          <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">Active:</span>
          <Badge variant="outline" className="font-mono">{config.provider}</Badge>
          <span className="font-mono text-xs text-muted-foreground">{config.model}</span>
          {config.hasApiKey ? (
            <Badge variant="secondary" className="ml-auto">API key stored</Badge>
          ) : (
            <Badge variant="outline" className="ml-auto text-muted-foreground">Replit integration</Badge>
          )}
        </div>
      )}

      <Card className="shadow-sm border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Provider &amp; Model
          </CardTitle>
          <CardDescription>
            Select a provider, pick a model, and enter your API key.
            Vision-capable models are required for KDP form automation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Provider selector */}
          <div className="space-y-2">
            <Label className="text-base">Provider</Label>
            <div className="grid gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setProvider(p.id);
                    setModel(p.models[0].id);
                    setTestResult(null);
                  }}
                  className={`w-full text-left p-4 rounded-lg border transition-colors ${
                    provider === p.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border hover:border-muted-foreground/40 hover:bg-muted/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-sm">{p.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{p.description}</div>
                    </div>
                    {provider === p.id && (
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Model selector */}
          <div className="space-y-2">
            <Label className="text-base">Model</Label>
            <select
              value={model}
              onChange={(e) => { setModel(e.target.value); setTestResult(null); }}
              className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {selectedProvider.models.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
              <option value="__custom">Custom model ID...</option>
            </select>
            {model === "__custom" && (
              <Input
                placeholder="e.g. anthropic/claude-3-opus or gpt-4-vision-preview"
                onChange={(e) => setModel(e.target.value)}
                className="font-mono text-sm"
              />
            )}
          </div>

          {/* API key */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base">API Key</Label>
              <a
                href={selectedProvider.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary flex items-center gap-1 hover:underline"
              >
                Get API key <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setTestResult(null); }}
                placeholder={
                  config?.hasApiKey && config.provider === provider
                    ? "Leave blank to keep existing key"
                    : provider === "anthropic" && !config?.hasApiKey
                    ? "Leave blank to use Replit integration"
                    : "Enter your API key"
                }
                className="font-mono text-sm pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {provider === "anthropic" && (
              <p className="text-xs text-muted-foreground">
                Anthropic only: leave blank to use the built-in Replit integration (no key needed when running on Replit). Enter a key to use your own Anthropic account.
              </p>
            )}
            {provider === "openrouter" && (
              <p className="text-xs text-muted-foreground">
                OpenRouter gives you access to 300+ models with one key. Free tier available. Sign up at openrouter.ai.
              </p>
            )}
          </div>

          {/* Test result */}
          {testResult && (
            <div className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${
              testResult.success ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"
            }`}>
              {testResult.success
                ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
              <span>{testResult.message}</span>
            </div>
          )}
        </CardContent>

        <CardFooter className="border-t bg-muted/10 p-4 flex justify-between gap-3">
          <Button
            variant="outline"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            className="font-mono text-sm"
          >
            <FlaskConical className="mr-2 h-4 w-4" />
            {testMutation.isPending ? "TESTING..." : "TEST_CONNECTION"}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending || !isDirty}
            className="font-mono text-sm"
          >
            <Save className="mr-2 h-4 w-4" />
            {saveMutation.isPending ? "SAVING..." : "SAVE_CONFIG"}
          </Button>
        </CardFooter>
      </Card>

      {/* Quick reference */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Quick Reference</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p><strong className="text-foreground">OpenRouter</strong> — Best option if you want GPT-4o or DeepSeek. One key, many models. Free credits on sign-up. <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">openrouter.ai</a></p>
          <p><strong className="text-foreground">Anthropic direct</strong> — Most reliable for KDP vision tasks. Requires credits at <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">console.anthropic.com</a></p>
          <p><strong className="text-foreground">Vision required</strong> — The KDP upload agent takes screenshots and asks the AI to interpret them. Models marked "text only" (like DeepSeek Chat) will not work for uploads.</p>
        </CardContent>
      </Card>
    </div>
  );
}
