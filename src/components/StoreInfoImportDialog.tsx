import { useState } from "react";
import { Link } from "react-router-dom";
import { Download, Facebook, Instagram, Loader2, ArrowLeft } from "lucide-react";
import { usePlatformConnections } from "@/hooks/useSupabaseData";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type InfoKey = "name" | "description" | "category" | "address" | "phone" | "email" | "logo_url" | "cover_image_url";
export type ImportedStoreInfo = Partial<Record<InfoKey, string>>;
const fields: { key: InfoKey; en: string; ar: string }[] = [
  { key: "name", en: "Store name", ar: "اسم المتجر" },
  { key: "description", en: "Description", ar: "الوصف" },
  { key: "category", en: "Category", ar: "الفئة" },
  { key: "phone", en: "Phone", ar: "الهاتف" },
  { key: "email", en: "Email", ar: "البريد الإلكتروني" },
  { key: "address", en: "Address", ar: "العنوان" },
  { key: "logo_url", en: "Logo", ar: "الشعار" },
  { key: "cover_image_url", en: "Cover image", ar: "صورة الغلاف" },
];

export function StoreInfoImportDialog({ storeId, onApply }: { storeId: string; onApply: (info: ImportedStoreInfo) => void }) {
  const { dir } = useLanguage();
  const ar = dir === "rtl";
  const { data: connections, isLoading } = usePlatformConnections();
  const pages = connections?.filter(c => c.status === "connected" && (c.platform === "facebook" || c.platform === "instagram")) || [];
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<ImportedStoreInfo | null>(null);
  const [selected, setSelected] = useState<InfoKey[]>([]);
  const [source, setSource] = useState("");
  const [partial, setPartial] = useState(false);

  const load = async (connectionId: string) => {
    setBusy(true); setError("");
    try {
      const { data, error: requestError } = await supabase.functions.invoke("meta-store-info", { body: { store_id: storeId, connection_id: connectionId } });
      if (requestError || data?.error) {
        let code = data?.code;
        if (requestError && "context" in requestError) {
          try { code = (await requestError.context.json()).code; } catch { /* unavailable error body */ }
        }
        throw new Error(code === "reconnect"
          ? (ar ? "أعد ربط الصفحة ووافق على الوصول لمعلوماتها، ثم حاول مرة أخرى." : "Reconnect this page and approve profile access, then try again.")
          : (ar ? "تعذّر جلب معلومات الصفحة. حاول مرة أخرى." : "Could not load page information. Please try again."));
      }
      const info: ImportedStoreInfo = data.profile;
      setDraft(info); setSelected(Object.keys(info) as InfoKey[]); setSource(data.source_name || ""); setPartial(data.partial);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return <>
    <Button variant="outline" onClick={() => { setDraft(null); setError(""); setOpen(true); }}><Download />{ar ? "استيراد معلومات المتجر" : "Import store information"}</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent dir={dir} className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{ar ? "استيراد معلومات المتجر" : "Import store information"}</DialogTitle>
          <DialogDescription>{draft ? source : (ar ? "اختر صفحة متصلة" : "Choose a connected page")}</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {busy || isLoading ? <div role="status" className="flex items-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />{ar ? "جاري جلب المعلومات…" : "Loading page information…"}</div> : !draft ? <div className="space-y-2">
          {pages.map(page => <Button key={page.id} variant="outline" className="w-full h-auto min-h-12 justify-start whitespace-normal text-start" onClick={() => load(page.id)}>
            {page.platform === "facebook" ? <Facebook /> : <Instagram />}<span className="min-w-0 break-words">{page.page_name || page.page_id}<span className="block text-xs text-muted-foreground">{page.platform === "facebook" ? "Facebook" : "Instagram"}</span></span>
          </Button>)}
          {!pages.length && <><p className="text-sm text-muted-foreground py-4">{ar ? "لا توجد صفحات فيسبوك أو إنستغرام متصلة." : "No Facebook or Instagram pages connected."}</p><Button asChild variant="outline"><Link to="/platforms">{ar ? "ربط صفحة" : "Connect a page"}</Link></Button></>}
        </div> : <>
          {partial && <p className="text-sm text-muted-foreground">{ar ? "بعض المعلومات غير متاحة من هذه الصفحة." : "Some information is unavailable from this page."}</p>}
          <div className="space-y-4">
            {fields.filter(field => field.key in draft).map(field => <div key={field.key} className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground" htmlFor={`import-${field.key}`}>
                <input type="checkbox" checked={selected.includes(field.key)} onChange={e => setSelected(keys => e.target.checked ? [...keys, field.key] : keys.filter(key => key !== field.key))} className="accent-primary" />{ar ? field.ar : field.en}
              </label>
              {field.key === "logo_url" || field.key === "cover_image_url" ? <img src={draft[field.key]} alt={ar ? field.ar : field.en} className={field.key === "logo_url" ? "h-20 w-20 rounded-md object-cover" : "w-full h-28 rounded-md object-cover"} /> : field.key === "description" ? <Textarea id={`import-${field.key}`} value={draft[field.key] || ""} disabled={!selected.includes(field.key)} onChange={e => setDraft(info => ({ ...info, [field.key]: e.target.value }))} /> : <Input id={`import-${field.key}`} value={draft[field.key] || ""} disabled={!selected.includes(field.key)} onChange={e => setDraft(info => ({ ...info, [field.key]: e.target.value }))} />}
            </div>)}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)}><ArrowLeft />{ar ? "رجوع" : "Back"}</Button>
            <Button disabled={!selected.length || (selected.includes("name") && !draft.name?.trim())} onClick={() => { onApply(Object.fromEntries(selected.map(key => [key, draft[key]]))); setOpen(false); }}>{ar ? "استخدام المعلومات المحددة" : "Use selected information"}</Button>
          </DialogFooter>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}