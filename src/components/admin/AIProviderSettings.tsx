import { useEffect, useState } from "react";
import { Loader2, Save, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const MODELS: { value: string; label: string; hint?: string }[] = [
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)", hint: "Recommended default" },
  { value: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Preview)", hint: "Top-tier multimodal" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", hint: "Balanced" },
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", hint: "Fastest & cheapest" },
  { value: "openai/gpt-5", label: "GPT-5 (via gateway)", hint: "Best reasoning & tool use" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini (via gateway)" },
  { value: "openai/gpt-5-nano", label: "GPT-5 Nano (via gateway)" },
  { value: "openai/gpt-5.2", label: "GPT-5.2 (via gateway)" },
];

export default function AIProviderSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [model, setModel] = useState("google/gemini-3-flash-preview");
  const [autofillModel, setAutofillModel] = useState("google/gemini-3-flash-preview");
  const [testModel, setTestModel] = useState("google/gemini-3-flash-preview");
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
        setModel(data.model);
        setAutofillModel(data.autofill_model);
        setTestModel(data.test_model);
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const payload = {
      provider: "lovable",
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
      toast({ title: "AI models updated", description: "Now using Lovable AI." });
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
          <h3 className="text-sm font-heading font-semibold text-foreground">AI Engine</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Powered by <strong className="text-foreground">Lovable AI</strong> — no API key needed, billed via workspace credits.
        </p>
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
        />
        <ModelPicker
          label="Product autofill (vision)"
          hint="Used when uploading product images. Must support vision."
          value={autofillModel}
          onChange={setAutofillModel}
        />
        <ModelPicker
          label="Chat tester (dashboard)"
          hint="Used by the AI Settings page chat preview."
          value={testModel}
          onChange={setTestModel}
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
    </div>
  );
}

function ModelPicker({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
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
        {MODELS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}{o.hint ? ` — ${o.hint}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
