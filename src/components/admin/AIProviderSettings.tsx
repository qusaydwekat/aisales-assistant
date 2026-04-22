import { useEffect, useState } from "react";
import { Loader2, Save, Sparkles, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Provider = "openai" | "lovable";

interface ProviderOption {
  id: Provider;
  label: string;
  description: string;
  models: { value: string; label: string; hint?: string }[];
}

const PROVIDERS: ProviderOption[] = [
  {
    id: "openai",
    label: "OpenAI",
    description: "Direct OpenAI API. Requires an OpenAI account with credits.",
    models: [
      { value: "gpt-4o", label: "GPT-4o", hint: "Best reasoning + vision" },
      { value: "gpt-4o-mini", label: "GPT-4o Mini", hint: "Fast & cheap" },
      { value: "gpt-4.1", label: "GPT-4.1" },
      { value: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
    ],
  },
  {
    id: "lovable",
    label: "Lovable AI",
    description: "Managed gateway. No API key needed — billed via workspace credits.",
    models: [
      { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", hint: "Top-tier multimodal" },
      { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", hint: "Balanced" },
      { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", hint: "Fastest & cheapest" },
      { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)" },
      { value: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Preview)" },
      { value: "openai/gpt-5", label: "GPT-5 (via gateway)" },
      { value: "openai/gpt-5-mini", label: "GPT-5 Mini (via gateway)" },
      { value: "openai/gpt-5-nano", label: "GPT-5 Nano (via gateway)" },
    ],
  },
];

export default function AIProviderSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState<Provider>("openai");
  const [model, setModel] = useState("gpt-4o");
  const [autofillModel, setAutofillModel] = useState("gpt-4o-mini");
  const [testModel, setTestModel] = useState("gpt-4o-mini");
  const [rowId, setRowId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("platform_ai_config")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error(error);
        toast({ title: "Failed to load AI config", description: error.message, variant: "destructive" });
      } else if (data) {
        setRowId(data.id);
        setProvider(data.provider as Provider);
        setModel(data.model);
        setAutofillModel(data.autofill_model);
        setTestModel(data.test_model);
      }
      setLoading(false);
    })();
  }, []);

  const currentModels = PROVIDERS.find((p) => p.id === provider)?.models || [];

  // When provider switches, snap to that provider's first model if current isn't valid
  useEffect(() => {
    const valid = (m: string) => currentModels.some((cm) => cm.value === m);
    if (!valid(model)) setModel(currentModels[0]?.value || "");
    if (!valid(autofillModel)) setAutofillModel(currentModels[0]?.value || "");
    if (!valid(testModel)) setTestModel(currentModels[0]?.value || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const save = async () => {
    setSaving(true);
    const payload = {
      provider,
      model,
      autofill_model: autofillModel,
      test_model: testModel,
      updated_by: (await supabase.auth.getUser()).data.user?.id || null,
    };
    const { error } = rowId
      ? await supabase.from("platform_ai_config").update(payload).eq("id", rowId)
      : await supabase.from("platform_ai_config").insert(payload as any);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "AI provider updated", description: `Now using ${provider === "lovable" ? "Lovable AI" : "OpenAI"}.` });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="glass rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-heading font-semibold text-foreground">AI Provider</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Choose which AI engine powers all stores on the platform.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PROVIDERS.map((p) => {
            const selected = provider === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setProvider(p.id)}
                className={`text-start p-4 rounded-xl border transition-all ${
                  selected
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-border bg-muted/20 hover:border-primary/40"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-foreground">{p.label}</span>
                  {selected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                </div>
                <p className="text-xs text-muted-foreground">{p.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="glass rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-heading font-semibold text-foreground">Models</h3>
        <p className="text-xs text-muted-foreground -mt-2">
          Pick the model used for each task. Different tasks can use different models.
        </p>

        <ModelPicker
          label="Customer agent (inbox replies)"
          hint="Used for live chats with customers across all platforms."
          value={model}
          onChange={setModel}
          options={currentModels}
        />
        <ModelPicker
          label="Product autofill (vision)"
          hint="Used when uploading product images. Must support vision."
          value={autofillModel}
          onChange={setAutofillModel}
          options={currentModels}
        />
        <ModelPicker
          label="Chat tester (dashboard)"
          hint="Used by the AI Settings page chat preview."
          value={testModel}
          onChange={setTestModel}
          options={currentModels}
        />

        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save changes
        </button>
      </div>

      <div className="glass rounded-xl p-5 text-xs text-muted-foreground space-y-1">
        <p><strong className="text-foreground">OpenAI</strong> uses your <code className="px-1 bg-muted rounded">OPENAI_API_KEY</code> secret.</p>
        <p><strong className="text-foreground">Lovable AI</strong> uses the managed <code className="px-1 bg-muted rounded">LOVABLE_API_KEY</code> — no setup needed; billed from workspace credits.</p>
      </div>
    </div>
  );
}

function ModelPicker({
  label,
  hint,
  value,
  onChange,
  options,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; hint?: string }[];
}) {
  return (
    <div>
      <label className="text-xs font-medium text-foreground">{label}</label>
      {hint && <p className="text-[11px] text-muted-foreground mb-1.5">{hint}</p>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}{o.hint ? ` — ${o.hint}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
