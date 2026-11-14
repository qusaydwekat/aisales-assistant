import { useEffect, useMemo, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, ExternalLink, Facebook, Instagram, Loader2, RefreshCw, Store, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useMetaProductSources, useProductImportCandidates, useProductSyncRun, useStore } from "@/hooks/useSupabaseData";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  connections: any[];
}

const currencies = ["ILS", "JOD", "USD", "EUR", "AED", "SAR", "EGP", "GBP"];

export function MetaImportDialog({ open, onClose, connections }: Props) {
  const { dir } = useLanguage();
  const ar = dir === "rtl";
  const text = (en: string, arabic: string) => ar ? arabic : en;
  const qc = useQueryClient();
  const { data: store } = useStore();
  const { data: savedSources = [], refetch: refetchSources } = useMetaProductSources();
  const [tab, setTab] = useState<"import" | "review" | "sources">("import");
  const [actionError, setActionError] = useState("");
  const [sourceType, setSourceType] = useState<"shop" | "posts">("shop");
  const eligibleConnections = useMemo(() => connections.filter((connection) =>
    connection.status === "connected" && ["facebook", "instagram"].includes(connection.platform)
  ), [connections]);
  const [connectionId, setConnectionId] = useState("");
  const [discovered, setDiscovered] = useState<any[]>([]);
  const [externalId, setExternalId] = useState("");
  const [currency, setCurrency] = useState("ILS");
  const [autoSync, setAutoSync] = useState(true);
  const [runId, setRunId] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [editor, setEditor] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const { data: run } = useProductSyncRun(runId);
  const { data: previewRows = [] } = useProductImportCandidates(runId);
  const { data: reviewRows = [], refetch: refetchReview } = useProductImportCandidates();

  useEffect(() => {
    if (!connectionId && eligibleConnections[0]) setConnectionId(eligibleConnections[0].id);
  }, [eligibleConnections, connectionId]);

  useEffect(() => {
    if ((store as any)?.currency) setCurrency((store as any).currency);
  }, [(store as any)?.currency]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["meta_product_sources"] });
    qc.invalidateQueries({ queryKey: ["product_import_candidates"] });
    qc.invalidateQueries({ queryKey: ["product_sync_run"] });
    refetchSources();
    refetchReview();
  };

  const call = async (action: string, payload: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("meta-product-sync", { body: { action, ...payload } });
    if (error) {
      const details = error instanceof FunctionsHttpError ? await error.context.text() : error.message;
      let message = details;
      try { message = JSON.parse(details).error || details; } catch { /* keep provider message */ }
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const perform = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    setActionError("");
    try { await work(); } catch (error: any) {
      const message = error.message || text("Import failed", "فشل الاستيراد");
      setActionError(message);
      toast.error(message);
    } finally { setBusy(""); }
  };

  const discover = () => perform("discover", async () => {
    if (!connectionId) throw new Error(text("Choose a connected account", "اختر حساباً مرتبطاً"));
    const result = await call("discover", { connection_id: connectionId, source_type: sourceType });
    setDiscovered(result.sources || []);
    setExternalId(result.sources?.[0]?.id || "");
    if (!result.sources?.length) {
      const message = text("No readable Shops were found. Reconnect with catalog access; Meta may also require App Review approval.", "لم نجد متاجر يمكن قراءتها. أعد الربط مع إذن الكتالوج؛ وقد تتطلب Meta أيضاً موافقة مراجعة التطبيق.");
      setActionError(message);
      toast.info(message);
    }
  });

  const startPreview = () => perform("start", async () => {
    const selected = discovered.find((source) => source.id === externalId);
    const result = await call("start", {
      connection_id: connectionId,
      source_type: sourceType,
      external_id: externalId,
      name: selected?.name,
      currency,
      auto_sync: autoSync,
      preview: true,
    });
    setRunId(result.run_id);
    setTab("import");
    invalidate();
  });

  const commit = () => perform("commit", async () => {
    if (!runId) return;
    await call("commit", { run_id: runId });
    invalidate();
    toast.success(text("Import started", "بدأ الاستيراد"));
  });

  const syncNow = (sourceId: string) => perform(sourceId, async () => {
    const result = await call("sync-source", { source_id: sourceId });
    setRunId(result.run_id);
    setTab("import");
    invalidate();
  });

  const toggleAuto = (sourceId: string, enabled: boolean) => perform(sourceId, async () => {
    await call("set-auto", { source_id: sourceId, auto_sync: enabled });
    invalidate();
  });

  const openEditor = (candidate: any) => {
    const extracted = candidate.extracted || {};
    setEditor(candidate);
    setEditForm({
      name: extracted.name || "",
      description: extracted.description || "",
      category: extracted.category || "",
      price: extracted.price ?? "",
      currency: extracted.currency || currency,
      availability: extracted.availability || "unknown",
      stockTracked: extracted.stockTracked === true,
      stock: extracted.stock || 0,
    });
  };

  const approve = () => perform("approve", async () => {
    if (!editor) return;
    await call("approve", {
      candidate_id: editor.id,
      edits: {
        ...editForm,
        price: editForm.price === "" ? null : Number(editForm.price),
        stock: Math.max(0, Math.floor(Number(editForm.stock) || 0)),
      },
    });
    toast.success(text("Product approved", "تم اعتماد المنتج"));
    setEditor(null);
    invalidate();
  });

  const dismiss = (candidateId: string) => perform(candidateId, async () => {
    await call("dismiss", { candidate_id: candidateId });
    invalidate();
  });

  const issueLabel = (issue: string) => {
    const labels: Record<string, string> = {
      missing_name: text("Name needed", "الاسم مطلوب"),
      missing_price: text("Price needed", "السعر مطلوب"),
      missing_currency: text("Currency needed", "العملة مطلوبة"),
      currency_mismatch: text("Different currency", "عملة مختلفة"),
      multiple_products: text("Several products in one post", "عدة منتجات في المنشور"),
      variant_prices_differ: text("Variant prices differ", "أسعار المتغيرات مختلفة"),
      availability_review_required: text("Confirm availability", "تأكيد التوفر مطلوب"),
      extraction_failed: text("Could not extract details", "تعذر استخراج التفاصيل"),
      import_failed: text("Import failed", "فشل الاستيراد"),
      invalid_stock: text("Invalid stock", "المخزون غير صالح"),
    };
    if (issue.startsWith("local_conflict:")) return text(`Locally edited: ${issue.split(":")[1]}`, `معدل محلياً: ${issue.split(":")[1]}`);
    return labels[issue] || issue;
  };

  const renderCandidate = (candidate: any, review = false) => {
    const extracted = candidate.extracted || {};
    const issues = candidate.issues || [];
    return (
      <div key={candidate.id} className="rounded-xl border border-border bg-card/60 p-3 flex gap-3">
        <div className="h-16 w-16 rounded-lg bg-muted overflow-hidden shrink-0 flex items-center justify-center">
          {candidate.photos?.[0] ? <img src={candidate.photos[0]} alt="" className="h-full w-full object-cover" /> : <Store className="h-6 w-6 text-muted-foreground" />}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium text-foreground truncate">{extracted.name || text("Untitled product", "منتج بدون اسم")}</p>
          <p className="text-xs text-muted-foreground">
            {extracted.price != null ? `${extracted.price} ${extracted.currency || ""}` : text("No reliable price", "لا يوجد سعر موثوق")}
          </p>
          {issues.length > 0 && <div className="flex flex-wrap gap-1">{issues.map((issue: string) => <span key={issue} className="rounded bg-warning/15 text-warning px-1.5 py-0.5 text-[10px]">{issueLabel(issue)}</span>)}</div>}
          <div className="flex items-center gap-3 pt-1">
            {candidate.permalink && <a href={candidate.permalink} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1">{text("Original", "الأصل")}<ExternalLink className="h-3 w-3" /></a>}
            {(review || issues.length > 0) && <button onClick={() => openEditor(candidate)} className="text-xs text-primary">{text("Review & edit", "مراجعة وتعديل")}</button>}
            {review && <button onClick={() => dismiss(candidate.id)} className="text-xs text-muted-foreground">{text("Dismiss", "تجاهل")}</button>}
          </div>
        </div>
      </div>
    );
  };

  const previewReady = run?.status === "completed" && (run.checkpoint as any)?.mode === "preview";
  const runRunning = run?.status === "running";

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value && !runRunning) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-hidden flex flex-col p-0" dir={dir}>
        <DialogHeader className="p-5 md:p-6 border-b border-border">
          <DialogTitle className="flex items-center gap-2"><Facebook className="h-5 w-5 text-primary" />{text("Import from Meta", "الاستيراد من Meta")}</DialogTitle>
          <DialogDescription>{text("Import Shops and product posts without duplicates or guessed details.", "استورد المتاجر ومنشورات المنتجات بدون تكرار أو تخمين التفاصيل.")}</DialogDescription>
        </DialogHeader>

        <div className="flex border-b border-border px-4 gap-1 overflow-x-auto">
          {(["import", "review", "sources"] as const).map((item) => (
            <button key={item} onClick={() => setTab(item)} className={`shrink-0 px-3 py-2.5 text-sm whitespace-nowrap border-b-2 ${tab === item ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
              {item === "import" ? text("Import", "استيراد") : item === "review" ? `${text("Needs review", "بحاجة لمراجعة")} (${reviewRows.length})` : `${text("Automatic sync", "المزامنة التلقائية")} (${savedSources.length})`}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
          {tab === "import" && (
            <>
              <div className="grid md:grid-cols-2 gap-3">
                <button onClick={() => { setSourceType("shop"); setDiscovered([]); }} className={`rounded-xl border p-4 text-start ${sourceType === "shop" ? "border-primary bg-primary/5" : "border-border"}`}>
                  <Store className="h-5 w-5 text-primary mb-2" />
                  <p className="font-medium text-sm text-foreground">{text("Facebook / Instagram Shop", "متجر فيسبوك / إنستغرام")}</p>
                  <p className="text-xs text-muted-foreground mt-1">{text("Structured products, variations, prices and availability.", "منتجات منظمة مع المتغيرات والأسعار والتوفر.")}</p>
                </button>
                <button onClick={() => { setSourceType("posts"); setDiscovered([]); }} className={`rounded-xl border p-4 text-start ${sourceType === "posts" ? "border-primary bg-primary/5" : "border-border"}`}>
                  <Instagram className="h-5 w-5 text-primary mb-2" />
                  <p className="font-medium text-sm text-foreground">{text("Page posts and photos", "منشورات وصور الصفحة")}</p>
                  <p className="text-xs text-muted-foreground mt-1">{text("AI finds products; incomplete details stay in review.", "يجد الذكاء الاصطناعي المنتجات وتبقى التفاصيل الناقصة للمراجعة.")}</p>
                </button>
              </div>

              {eligibleConnections.length === 0 ? (
                <div className="rounded-xl border border-border p-6 text-center">
                  <p className="text-sm text-muted-foreground mb-3">{text("Connect a Facebook Page or Instagram professional account first.", "اربط صفحة فيسبوك أو حساب إنستغرام احترافي أولاً.")}</p>
                  <a href="/platforms" className="text-sm text-primary">{text("Open connected platforms", "فتح المنصات المرتبطة")}</a>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-3 items-end">
                  <label className="text-xs text-muted-foreground">{text("Connected account", "الحساب المرتبط")}
                    <select value={connectionId} onChange={(event) => { setConnectionId(event.target.value); setDiscovered([]); }} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                      {eligibleConnections.map((connection) => <option key={connection.id} value={connection.id}>{connection.page_name} · {connection.platform}</option>)}
                    </select>
                  </label>
                  <Button variant="outline" onClick={discover} disabled={!!busy || !connectionId} className="gap-2">
                    {busy === "discover" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    {text("Find products", "البحث عن المنتجات")}
                  </Button>
                </div>
              )}

              {actionError && (
                <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive space-y-2">
                  <p className="break-words">{actionError}</p>
                  <a href="/platforms" className="inline-flex items-center gap-1 font-medium text-primary">
                    {text("Open connected accounts", "فتح الحسابات المرتبطة")}<ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              )}

              {discovered.length > 0 && (
                <div className="grid md:grid-cols-3 gap-3 items-end rounded-xl bg-muted/40 p-4">
                  <label className="text-xs text-muted-foreground md:col-span-1">{sourceType === "shop" ? text("Shop catalog", "كتالوج المتجر") : text("Post source", "مصدر المنشورات")}
                    <select value={externalId} onChange={(event) => setExternalId(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                      {discovered.map((source) => <option key={source.id} value={source.id}>{source.name}{source.product_count != null ? ` (${source.product_count})` : ""}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">{text("Store currency", "عملة المتجر")}
                    <select value={currency} disabled={!!(store as any)?.currency} onChange={(event) => setCurrency(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-70">
                      {currencies.map((code) => <option key={code}>{code}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-xs text-foreground">
                    {text("Automatic sync", "مزامنة تلقائية")}<Switch checked={autoSync} onCheckedChange={setAutoSync} />
                  </label>
                  <Button onClick={startPreview} disabled={!!busy || !externalId || runRunning} className="md:col-span-3">
                    {busy === "start" && <Loader2 className="h-4 w-4 animate-spin me-2" />}{text("Preview all products", "معاينة كل المنتجات")}
                  </Button>
                </div>
              )}

              {run && (
                <div className="rounded-xl border border-border p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">{runRunning ? text("Reading source and preparing products…", "جاري قراءة المصدر وتجهيز المنتجات…") : run.status === "failed" ? text("Sync needs attention", "المزامنة تحتاج للانتباه") : previewReady ? text("Preview ready", "المعاينة جاهزة") : text("Sync finished", "انتهت المزامنة")}</p>
                    {runRunning ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : run.status === "failed" ? <AlertCircle className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-success" />}
                  </div>
                  {run.error && <p className="text-xs text-destructive break-words">{run.error}</p>}
                  {run.counts && <div className="flex flex-wrap gap-2 text-xs">
                    {Object.entries(run.counts as Record<string, number>).map(([key, value]) => <span key={key} className="rounded bg-muted px-2 py-1 text-muted-foreground">{key}: {value}</span>)}
                  </div>}
                  {previewReady && <Button onClick={commit} disabled={!!busy || !(run.counts as any)?.ready}>{busy === "commit" && <Loader2 className="h-4 w-4 animate-spin me-2" />}{text("Import all ready products", "استيراد كل المنتجات الجاهزة")} ({(run.counts as any)?.ready || 0})</Button>}
                </div>
              )}

              {runId && previewRows.length > 0 && <div className="grid sm:grid-cols-2 gap-3">{previewRows.map((candidate) => renderCandidate(candidate))}</div>}
            </>
          )}

          {tab === "review" && (
            reviewRows.length ? <div className="grid sm:grid-cols-2 gap-3">{reviewRows.map((candidate) => renderCandidate(candidate, true))}</div> : <div className="py-12 text-center"><CheckCircle2 className="h-9 w-9 text-success mx-auto mb-2" /><p className="text-sm text-muted-foreground">{text("Nothing needs review.", "لا يوجد ما يحتاج للمراجعة.")}</p></div>
          )}

          {tab === "sources" && (
            savedSources.length ? <div className="space-y-3">{savedSources.map((source: any) => (
              <div key={source.id} className="rounded-xl border border-border p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-sm font-medium text-foreground">{source.name}</p><p className="text-xs text-muted-foreground">{source.source_type === "shop" ? text("Shop", "متجر") : text("Posts", "منشورات")} · {source.last_successful_sync_at ? new Date(source.last_successful_sync_at).toLocaleString() : text("Not synced yet", "لم تتم المزامنة بعد")}</p></div>
                  <Switch checked={source.auto_sync} onCheckedChange={(checked) => toggleAuto(source.id, checked)} disabled={busy === source.id} />
                </div>
                {source.last_error && <p className="text-xs text-destructive">{source.last_error}</p>}
                <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => syncNow(source.id)} disabled={!!busy}><RefreshCw className={`h-3.5 w-3.5 me-1.5 ${busy === source.id ? "animate-spin" : ""}`} />{text("Sync now", "مزامنة الآن")}</Button>{source.status === "paused" && <a href="/platforms" className="text-xs text-primary self-center">{text("Reconnect account", "إعادة ربط الحساب")}</a>}</div>
              </div>
            ))}</div> : <p className="py-12 text-center text-sm text-muted-foreground">{text("Your saved import sources will appear here.", "ستظهر مصادر الاستيراد المحفوظة هنا.")}</p>
          )}
        </div>

        {editor && (
          <div className="absolute inset-0 z-10 bg-background/95 backdrop-blur-sm overflow-y-auto p-5 md:p-8" dir={dir}>
            <div className="max-w-xl mx-auto space-y-4">
              <div className="flex items-center justify-between"><h3 className="font-heading font-semibold text-foreground">{text("Review product", "مراجعة المنتج")}</h3><Button variant="ghost" size="icon" onClick={() => setEditor(null)}><X className="h-4 w-4" /></Button></div>
              <label className="block text-xs text-muted-foreground">{text("Product name", "اسم المنتج")}<Input value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} className="mt-1" /></label>
              <label className="block text-xs text-muted-foreground">{text("Description", "الوصف")}<Textarea value={editForm.description} onChange={(event) => setEditForm({ ...editForm, description: event.target.value })} className="mt-1" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-muted-foreground">{text("Price", "السعر")}<Input type="number" min="0" value={editForm.price} onChange={(event) => setEditForm({ ...editForm, price: event.target.value })} className="mt-1" /></label>
                <label className="block text-xs text-muted-foreground">{text("Currency", "العملة")}<select value={editForm.currency} onChange={(event) => setEditForm({ ...editForm, currency: event.target.value })} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">{currencies.map((code) => <option key={code}>{code}</option>)}</select></label>
              </div>
              <label className="block text-xs text-muted-foreground">{text("Category", "الفئة")}<Input value={editForm.category} onChange={(event) => setEditForm({ ...editForm, category: event.target.value })} className="mt-1" /></label>
              <label className="block text-xs text-muted-foreground">{text("Availability", "التوفر")}<select value={editForm.availability} onChange={(event) => setEditForm({ ...editForm, availability: event.target.value })} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"><option value="unknown">{text("Choose availability", "اختر التوفر")}</option><option value="in_stock">{text("In stock", "متوفر")}</option><option value="out_of_stock">{text("Out of stock", "غير متوفر")}</option></select></label>
              <label className="flex items-center justify-between rounded-lg border border-border p-3 text-sm text-foreground">{text("Track exact quantity", "تتبع الكمية بدقة")}<Switch checked={editForm.stockTracked} onCheckedChange={(checked) => setEditForm({ ...editForm, stockTracked: checked })} /></label>
              {editForm.stockTracked && <label className="block text-xs text-muted-foreground">{text("Exact quantity", "الكمية الدقيقة")}<Input type="number" min="0" value={editForm.stock} onChange={(event) => setEditForm({ ...editForm, stock: event.target.value })} className="mt-1" /></label>}
              <Button onClick={approve} disabled={busy === "approve" || editForm.availability === "unknown"} className="w-full">{busy === "approve" && <Loader2 className="h-4 w-4 animate-spin me-2" />}{text("Approve product", "اعتماد المنتج")}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
