import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useSupabaseData";
import { useLanguage } from "@/contexts/LanguageContext";
import { Tag, HelpCircle, Bell, Plus, Trash2, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type Tab = "promotions" | "gaps" | "restock";

export default function GrowthPage() {
  const { dir } = useLanguage();
  const { data: store } = useStore();
  const [tab, setTab] = useState<Tab>("promotions");

  if (!store) {
    return <div className="p-6 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 pb-20 md:pb-6 max-w-5xl" dir={dir}>
      <div>
        <h1 className="text-xl md:text-2xl font-heading font-bold text-foreground">Growth Tools</h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">Promotions, knowledge gaps, and restock alerts your AI uses to sell smarter.</p>
      </div>

      <div className="flex gap-2 border-b border-border">
        {([
          { id: "promotions", label: "Promotions", icon: Tag },
          { id: "gaps", label: "Knowledge Gaps", icon: HelpCircle },
          { id: "restock", label: "Restock Signups", icon: Bell },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-primary text-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "promotions" && <PromotionsTab storeId={store.id} />}
      {tab === "gaps" && <GapsTab storeId={store.id} />}
      {tab === "restock" && <RestockTab storeId={store.id} />}
    </div>
  );
}

// ============ PROMOTIONS ============
function PromotionsTab({ storeId }: { storeId: string }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    code: "", label: "", type: "percent", value: 10, min_order: 0, ends_at: "",
  });

  const { data: promos = [], isLoading } = useQuery({
    queryKey: ["promotions", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("promotions")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createPromo = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("promotions").insert({
        store_id: storeId,
        code: form.code.trim().toUpperCase(),
        label: form.label.trim() || form.code,
        type: form.type,
        value: form.value,
        min_order: form.min_order,
        ends_at: form.ends_at || null,
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Promotion created");
      qc.invalidateQueries({ queryKey: ["promotions", storeId] });
      setCreating(false);
      setForm({ code: "", label: "", type: "percent", value: 10, min_order: 0, ends_at: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const togglePromo = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("promotions").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["promotions", storeId] }),
  });

  const deletePromo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("promotions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["promotions", storeId] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Create discount codes the AI can offer customers.</p>
        <button onClick={() => setCreating(!creating)} className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> New Promotion
        </button>
      </div>

      {creating && (
        <div className="glass rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Code</label>
              <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="SUMMER20"
                className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary uppercase" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Label (shown to customer)</label>
              <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Summer Sale 20% off"
                className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary">
                <option value="percent">Percent off (%)</option>
                <option value="fixed">Fixed amount off</option>
                <option value="free_shipping">Free shipping</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Value</label>
              <input type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: Number(e.target.value) }))}
                className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Min order amount</label>
              <input type="number" value={form.min_order} onChange={e => setForm(f => ({ ...f, min_order: Number(e.target.value) }))}
                className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Ends at (optional)</label>
              <input type="datetime-local" value={form.ends_at} onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))}
                className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setCreating(false)} className="px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted">Cancel</button>
            <button onClick={() => createPromo.mutate()} disabled={!form.code || createPromo.isPending}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50">
              {createPromo.isPending ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : promos.length === 0 ? (
        <div className="glass rounded-xl p-8 text-center text-sm text-muted-foreground">No promotions yet. Create one above and the AI can offer it to customers.</div>
      ) : (
        <div className="space-y-2">
          {promos.map((p: any) => (
            <div key={p.id} className="glass rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-bold text-primary">{p.code}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-sm text-foreground">{p.label}</span>
                  {!p.active && <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">inactive</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {p.type === "percent" && `${p.value}% off`}
                  {p.type === "fixed" && `$${p.value} off`}
                  {p.type === "free_shipping" && "Free shipping"}
                  {p.min_order > 0 && ` · min $${p.min_order}`}
                  {p.ends_at && ` · ends ${format(new Date(p.ends_at), "MMM d")}`}
                  {` · used ${p.uses}×`}
                </p>
              </div>
              <button onClick={() => togglePromo.mutate({ id: p.id, active: !p.active })}
                className="text-xs px-2 py-1 rounded-lg hover:bg-muted text-muted-foreground">
                {p.active ? "Disable" : "Enable"}
              </button>
              <button onClick={() => deletePromo.mutate(p.id)}
                className="p-2 rounded-lg hover:bg-destructive/10 text-destructive">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ KNOWLEDGE GAPS ============
function GapsTab({ storeId }: { storeId: string }) {
  const qc = useQueryClient();
  const [answering, setAnswering] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");

  const { data: gaps = [], isLoading } = useQuery({
    queryKey: ["knowledge_gaps", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_gaps")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const resolve = useMutation({
    mutationFn: async ({ id, ans }: { id: string; ans: string }) => {
      const { error } = await supabase.from("knowledge_gaps")
        .update({ status: "answered", answer: ans, answered_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Answer saved — AI will use it next time");
      qc.invalidateQueries({ queryKey: ["knowledge_gaps", storeId] });
      setAnswering(null);
      setAnswer("");
    },
  });

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("knowledge_gaps").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["knowledge_gaps", storeId] }),
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Questions your AI couldn't answer. Provide answers and the AI will learn them.</p>
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : gaps.length === 0 ? (
        <div className="glass rounded-xl p-8 text-center text-sm text-muted-foreground">No knowledge gaps detected. Your AI is handling everything well 🎉</div>
      ) : (
        gaps.map((g: any) => (
          <div key={g.id} className="glass rounded-xl p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="text-sm text-foreground">"{g.customer_question}"</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(g.created_at), "MMM d, HH:mm")} · 
                  <span className={g.status === "answered" ? "text-success ms-1" : "text-warning ms-1"}>{g.status}</span>
                </p>
                {g.answer && <p className="text-xs text-muted-foreground mt-2 italic">Your answer: {g.answer}</p>}
              </div>
              <button onClick={() => dismiss.mutate(g.id)} className="p-2 rounded-lg hover:bg-destructive/10 text-destructive">
                <X className="h-4 w-4" />
              </button>
            </div>
            {g.status === "open" && (
              answering === g.id ? (
                <div className="flex gap-2 pt-2">
                  <input autoFocus value={answer} onChange={e => setAnswer(e.target.value)}
                    placeholder="Answer this question..."
                    className="flex-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" />
                  <button onClick={() => resolve.mutate({ id: g.id, ans: answer })} disabled={!answer.trim()}
                    className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50">
                    <Check className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button onClick={() => { setAnswering(g.id); setAnswer(""); }}
                  className="text-xs text-primary hover:underline">+ Provide answer</button>
              )
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ============ RESTOCK ============
function RestockTab({ storeId }: { storeId: string }) {
  const qc = useQueryClient();

  const { data: signups = [], isLoading } = useQuery({
    queryKey: ["restock_signups", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restock_signups")
        .select("*, products(name, stock)")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("restock_signups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["restock_signups", storeId] }),
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Customers waiting for items to come back in stock. They get auto-notified within 15 minutes once stock is updated.</p>
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : signups.length === 0 ? (
        <div className="glass rounded-xl p-8 text-center text-sm text-muted-foreground">No restock signups yet.</div>
      ) : (
        signups.map((s: any) => (
          <div key={s.id} className="glass rounded-xl p-4 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{s.products?.name || "Unknown product"} {s.variant && <span className="text-xs text-muted-foreground">({s.variant})</span>}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {s.customer_name || "Customer"} · {s.platform || "—"} · stock now: {s.products?.stock ?? 0}
                {" · "}
                <span className={s.status === "notified" ? "text-success" : "text-warning"}>{s.status}</span>
              </p>
            </div>
            <button onClick={() => remove.mutate(s.id)} className="p-2 rounded-lg hover:bg-destructive/10 text-destructive">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))
      )}
    </div>
  );
}
