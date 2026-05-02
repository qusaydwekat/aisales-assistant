import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Loader2, Trash2, ChevronLeft, ChevronRight, Check, Plus, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { ImageDropzone } from "./ImageDropzone";
import { CategoryCombobox } from "./CategoryCombobox";

export type ProductForm = {
  name: string;
  description: string;
  category: string;
  price: number;
  compare_price: number;
  stock: number;
  sku: string;
  active: boolean;
  images: string[];
  variants?: any[];
  sizes_available?: string[];
  stock_per_size?: Record<string, number>;
  // Visual / nameless-product attributes
  auto_description?: string;
  type?: string | null;
  color?: string[];
  pattern?: string | null;
  style?: string | null;
  material?: string | null;
  fit?: string | null;
  occasion?: string[];
  sleeve?: string | null;
  neckline?: string | null;
  length?: string | null;
};

const EMPTY: ProductForm = {
  name: "",
  description: "",
  category: "",
  price: 0,
  compare_price: 0,
  stock: 0,
  sku: "",
  active: true,
  images: [],
  variants: [],
  sizes_available: [],
  stock_per_size: {},
  auto_description: "",
  type: null,
  color: [],
  pattern: null,
  style: null,
  material: null,
  fit: null,
  occasion: [],
  sleeve: null,
  neckline: null,
  length: null,
};

const freshForm = (initial?: Partial<ProductForm> | null): ProductForm => ({
  ...structuredClone(EMPTY),
  ...(initial ? structuredClone(initial) : {}),
});

const parseList = (value: string) => value.split(",").map((s) => s.trim()).filter(Boolean);

const formatStockPerSize = (stock?: Record<string, number>) =>
  Object.entries(stock || {}).map(([size, qty]) => `${size}: ${qty}`).join(", ");

const parseStockPerSize = (value: string) =>
  Object.fromEntries(
    value.split(",")
      .map((part) => part.split(":").map((s) => s.trim()))
      .filter(([size, qty]) => size && qty !== undefined)
      .map(([size, qty]) => [size, Number(qty) || 0])
  );

interface Props {
  open: boolean;
  onClose: () => void;
  initial?: Partial<ProductForm> | null;
  editingId?: string | null;
  initialStep?: 1 | 2 | 3;
  categories: string[];
  onSubmit: (form: ProductForm, opts: { addAnother: boolean }) => Promise<void>;
  onDelete?: () => Promise<void>;
  saving?: boolean;
  aiLanguage?: string;
}

export function ProductWizard({
  open,
  onClose,
  initial,
  editingId,
  initialStep = 1,
  categories,
  onSubmit,
  onDelete,
  saving,
  aiLanguage,
}: Props) {
  const { language, t, dir } = useLanguage();
  const [step, setStep] = useState<1 | 2 | 3>(initialStep);
  const [form, setForm] = useState<ProductForm>(freshForm(initial));
  const [aiLoading, setAiLoading] = useState(false);
  const [aiHint, setAiHint] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(freshForm(initial));
      setStep(initialStep);
      setAiHint(false);
    }
  }, [open, initial, initialStep]);

  if (!open) return null;

  const set = <K extends keyof ProductForm>(k: K, v: ProductForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const canNextFromBasics = form.name.trim().length > 0 && form.price >= 0;

  const runAutofill = async () => {
    if (!form.images[0]) return;
    setAiLoading(true);
    try {
      // Prefer the store's AI language setting; fall back to UI language
      const lang = aiLanguage && aiLanguage !== "both" ? aiLanguage : language;
      const { data, error } = await supabase.functions.invoke("ai-product-autofill", {
        body: { image_url: form.images[0], language: lang },
      });
      if (error) throw error;
      const s = data?.suggestion || {};
      setForm((f) => ({
        ...f,
        name: f.name || s.name || "",
        description: f.description || s.description || "",
        category: f.category || s.category || "",
        price: f.price || (s.suggested_price ? Number(s.suggested_price) : 0),
        auto_description: f.auto_description || s.auto_description || "",
        type: f.type ?? s.type ?? null,
        color: (f.color && f.color.length ? f.color : s.color) || [],
        pattern: f.pattern ?? s.pattern ?? null,
        style: f.style ?? s.style ?? null,
        material: f.material ?? s.material ?? null,
        fit: f.fit ?? s.fit ?? null,
        occasion: (f.occasion && f.occasion.length ? f.occasion : s.occasion) || [],
        sleeve: f.sleeve ?? s.sleeve ?? null,
        neckline: f.neckline ?? s.neckline ?? null,
        length: f.length ?? s.length ?? null,
      }));
      setAiHint(true);
      toast.success(t("ai_suggestions_applied"));
    } catch (e: any) {
      toast.error(e.message || t("ai_autofill_failed"));
    } finally {
      setAiLoading(false);
    }
  };

  const submit = async (addAnother: boolean) => {
    if (!form.name.trim()) {
      toast.error(t("name_required"));
      setStep(2);
      return;
    }
    await onSubmit(form, { addAnother });
    if (addAnother) {
      setForm(freshForm());
      setStep(1);
    }
  };

  const stepLabels = [t("step_photos"), t("step_basics"), t("step_details")];
  const progress = (step / 3) * 100;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-2 md:p-4"
        dir={dir}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.96, y: 10 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.96, y: 10 }}
          onClick={(e) => e.stopPropagation()}
          className="glass rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="p-4 md:p-6 border-b border-border/50">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg md:text-xl font-heading font-bold text-foreground">
                {editingId ? t("edit_product_title") : t("new_product_title")}
              </h2>
              <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            {/* Stepper */}
            <div className="flex items-center gap-2">
              {stepLabels.map((label, i) => {
                const n = (i + 1) as 1 | 2 | 3;
                const done = step > n;
                const active = step === n;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      if (editingId || n === 1 || (n === 2 && form.images.length >= 0) || (n === 3 && canNextFromBasics))
                        setStep(n);
                    }}
                    className="flex items-center gap-2 flex-1 group"
                  >
                    <span
                      className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${
                        done
                          ? "bg-primary text-primary-foreground"
                          : active
                          ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {done ? <Check className="h-3.5 w-3.5" /> : n}
                    </span>
                    <span
                      className={`text-xs md:text-sm font-medium hidden sm:inline ${
                        active ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {label}
                    </span>
                    {i < 2 && <span className="flex-1 h-px bg-border" />}
                  </button>
                );
              })}
            </div>
            <div className="h-1 bg-muted rounded-full mt-3 overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
            {step === 1 && (
              <div className="space-y-4">
                <ImageDropzone images={form.images} onChange={(imgs) => set("images", imgs)} />
                {form.images.length > 0 && (
                  <button
                    type="button"
                    onClick={runAutofill}
                    disabled={aiLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary/10 text-primary font-medium text-sm hover:bg-primary/20 disabled:opacity-50 transition-colors"
                  >
                    {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {aiLoading ? t("analyzing_image") : t("autofill_with_ai")}
                  </button>
                )}
                {aiHint && (
                  <p className="text-xs text-primary text-center">{t("ai_hint")}</p>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground">{t("name_label")} *</label>
                  <input
                    autoFocus
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder={t("name_placeholder")}
                    className="w-full mt-1 rounded-lg bg-muted px-3 py-3 text-base text-foreground outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">{t("price_label")} *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.price || ""}
                      onChange={(e) => set("price", Number(e.target.value))}
                      placeholder="0.00"
                      className="w-full mt-1 rounded-lg bg-muted px-3 py-3 text-base text-foreground outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{t("compare_price_label")}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.compare_price || ""}
                      onChange={(e) => set("compare_price", Number(e.target.value))}
                      placeholder="0.00"
                      className="w-full mt-1 rounded-lg bg-muted px-3 py-3 text-base text-foreground outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">{t("stock_label")}</label>
                    <input
                      type="number"
                      value={form.stock || ""}
                      onChange={(e) => set("stock", Number(e.target.value))}
                      placeholder="0"
                      className="w-full mt-1 rounded-lg bg-muted px-3 py-3 text-base text-foreground outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{t("sku_label")}</label>
                    <input
                      value={form.sku}
                      onChange={(e) => set("sku", e.target.value)}
                      placeholder={t("sku_optional")}
                      className="w-full mt-1 rounded-lg bg-muted px-3 py-3 text-base text-foreground outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground">{t("description_label")}</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    rows={5}
                    placeholder={t("description_placeholder")}
                    className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none resize-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t("category_label")}</label>
                  <CategoryCombobox
                    value={form.category}
                    onChange={(v) => set("category", v)}
                    options={categories}
                  />
                </div>

                {/* Visual attributes — used by the AI to describe & match products without names */}
                <div className="rounded-lg border border-border/50 p-3 space-y-3 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-medium text-foreground">Visual attributes (AI uses these to describe & match)</span>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Visual description (auto)</label>
                    <input
                      value={form.auto_description || ""}
                      onChange={(e) => set("auto_description", e.target.value)}
                      placeholder="e.g. Flowy red floral V-neck midi dress"
                      className="w-full mt-1 rounded-lg bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={form.type || ""} onChange={(e) => set("type", e.target.value || null)} placeholder="Type (dress, top…)" className="rounded-lg bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" />
                    <input value={(form.color || []).join(", ")} onChange={(e) => set("color", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} placeholder="Colors (red, white)" className="rounded-lg bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" />
                    <input value={form.pattern || ""} onChange={(e) => set("pattern", e.target.value || null)} placeholder="Pattern (solid, floral…)" className="rounded-lg bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" />
                    <input value={form.style || ""} onChange={(e) => set("style", e.target.value || null)} placeholder="Style (casual, formal…)" className="rounded-lg bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" />
                    <input value={form.material || ""} onChange={(e) => set("material", e.target.value || null)} placeholder="Material (cotton, denim…)" className="rounded-lg bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" />
                    <input value={form.fit || ""} onChange={(e) => set("fit", e.target.value || null)} placeholder="Fit (slim, oversized…)" className="rounded-lg bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" />
                    <input value={form.sleeve || ""} onChange={(e) => set("sleeve", e.target.value || null)} placeholder="Sleeve (short, long…)" className="rounded-lg bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" />
                    <input value={form.neckline || ""} onChange={(e) => set("neckline", e.target.value || null)} placeholder="Neckline (v-neck, round…)" className="rounded-lg bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" />
                    <input value={form.length || ""} onChange={(e) => set("length", e.target.value || null)} placeholder="Length (mini, midi…)" className="rounded-lg bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" />
                    <input value={(form.occasion || []).join(", ")} onChange={(e) => set("occasion", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} placeholder="Occasion (daily, party…)" className="rounded-lg bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                </div>
                <VariationsSection form={form} setForm={setForm} t={t} />

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => set("active", e.target.checked)}
                    className="accent-primary h-4 w-4"
                  />
                  <span className="text-sm text-foreground">{t("active_visible")}</span>
                </label>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 md:p-6 border-t border-border/50 flex items-center gap-2">
            {editingId && onDelete && (
              <button
                onClick={onDelete}
                className="px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10 flex items-center gap-1.5 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">{t("delete")}</span>
              </button>
            )}
            <div className="flex-1" />
            {step > 1 && (
              <button
                onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
                className="px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted flex items-center gap-1"
              >
                <ChevronLeft className="h-4 w-4 rtl:rotate-180" /> {t("back")}
              </button>
            )}
            {step < 3 ? (
              <button
                onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
                disabled={step === 2 && !canNextFromBasics}
                className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
              >
                {t("next")} <ChevronRight className="h-4 w-4 rtl:rotate-180" />
              </button>
            ) : (
              <>
                {!editingId && (
                  <button
                    onClick={() => submit(true)}
                    disabled={saving}
                    className="px-3 py-2 rounded-lg text-sm border border-border text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    {t("save_and_add_another")}
                  </button>
                )}
                <button
                  onClick={() => submit(false)}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingId ? t("save") : t("create")}
                </button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ---------- Friendly variations editor ----------
const SIZE_PRESETS = ["XS", "S", "M", "L", "XL", "XXL"];
const NUMERIC_SIZES = ["36", "38", "40", "42", "44", "46"];
const COLOR_PRESETS: { name: string; hex: string }[] = [
  { name: "Black", hex: "#000000" },
  { name: "White", hex: "#FFFFFF" },
  { name: "Gray", hex: "#9CA3AF" },
  { name: "Red", hex: "#EF4444" },
  { name: "Pink", hex: "#EC4899" },
  { name: "Orange", hex: "#F97316" },
  { name: "Yellow", hex: "#EAB308" },
  { name: "Green", hex: "#22C55E" },
  { name: "Blue", hex: "#3B82F6" },
  { name: "Navy", hex: "#1E3A8A" },
  { name: "Purple", hex: "#A855F7" },
  { name: "Brown", hex: "#92400E" },
  { name: "Beige", hex: "#D6C7A8" },
];

function VariationsSection({
  form,
  setForm,
  t,
}: {
  form: ProductForm;
  setForm: React.Dispatch<React.SetStateAction<ProductForm>>;
  t: (k: string) => string;
}) {
  const sizes = form.sizes_available || [];
  const colors = form.color || [];
  const hasVariations = sizes.length > 0 || colors.length > 0;
  const [enabled, setEnabled] = useState<boolean>(hasVariations);
  const [sizeInput, setSizeInput] = useState("");
  const [colorInput, setColorInput] = useState("");
  const [sizeMode, setSizeMode] = useState<"letters" | "numbers">(
    sizes.some((s) => /^\d/.test(s)) ? "numbers" : "letters"
  );

  const update = (patch: Partial<ProductForm>) => setForm((f) => ({ ...f, ...patch }));

  const addSize = (s: string) => {
    const v = s.trim().toUpperCase();
    if (!v || sizes.includes(v)) return;
    update({ sizes_available: [...sizes, v] });
  };
  const removeSize = (s: string) => {
    const next = sizes.filter((x) => x !== s);
    const stock = { ...(form.stock_per_size || {}) };
    delete stock[s];
    update({ sizes_available: next, stock_per_size: stock });
  };

  const addColor = (c: string) => {
    const v = c.trim();
    if (!v || colors.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    update({ color: [...colors, v] });
  };
  const removeColor = (c: string) => update({ color: colors.filter((x) => x !== c) });

  const setStockFor = (size: string, qty: number) => {
    update({ stock_per_size: { ...(form.stock_per_size || {}), [size]: Math.max(0, qty || 0) } });
  };

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setEnabled((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-3 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <div className="text-start">
            <div className="text-sm font-medium text-foreground">{t("product_variations")}</div>
            <div className="text-[11px] text-muted-foreground">
              {hasVariations
                ? `${sizes.length} ${t("sizes_count_label")} · ${colors.length} ${t("colors_count_label")}`
                : t("variations_optional_hint")}
            </div>
          </div>
        </div>
        <span
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            enabled ? "bg-primary" : "bg-muted-foreground/30"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
              enabled ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </span>
      </button>

      {enabled && (
        <div className="px-3 pb-3 space-y-4 border-t border-border/50 pt-3">
          {/* Sizes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground">{t("sizes_label")}</label>
              <div className="flex rounded-md bg-background border border-border overflow-hidden text-[11px]">
                <button
                  type="button"
                  onClick={() => setSizeMode("letters")}
                  className={`px-2 py-0.5 ${sizeMode === "letters" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >
                  S/M/L
                </button>
                <button
                  type="button"
                  onClick={() => setSizeMode("numbers")}
                  className={`px-2 py-0.5 ${sizeMode === "numbers" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >
                  36/38/40
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(sizeMode === "letters" ? SIZE_PRESETS : NUMERIC_SIZES).map((s) => {
                const active = sizes.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => (active ? removeSize(s) : addSize(s))}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-border hover:border-primary/50"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input
                value={sizeInput}
                onChange={(e) => setSizeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addSize(sizeInput);
                    setSizeInput("");
                  }
                }}
                placeholder={t("custom_size_placeholder")}
                className="flex-1 rounded-lg bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary border border-border"
              />
              <button
                type="button"
                onClick={() => {
                  addSize(sizeInput);
                  setSizeInput("");
                }}
                className="px-3 rounded-lg bg-muted hover:bg-muted/70 text-foreground"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {sizes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {sizes.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/15 text-primary text-xs"
                  >
                    {s}
                    <button type="button" onClick={() => removeSize(s)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Colors */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">{t("colors_label")}</label>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_PRESETS.map((c) => {
                const active = colors.some((x) => x.toLowerCase() === c.name.toLowerCase());
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() =>
                      active
                        ? removeColor(colors.find((x) => x.toLowerCase() === c.name.toLowerCase())!)
                        : addColor(c.name)
                    }
                    className={`flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-md text-xs border transition-colors ${
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-background text-foreground hover:border-primary/50"
                    }`}
                  >
                    <span
                      className="h-4 w-4 rounded-full border border-border/60"
                      style={{ backgroundColor: c.hex }}
                    />
                    {c.name}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input
                value={colorInput}
                onChange={(e) => setColorInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addColor(colorInput);
                    setColorInput("");
                  }
                }}
                placeholder={t("custom_color_placeholder")}
                className="flex-1 rounded-lg bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary border border-border"
              />
              <button
                type="button"
                onClick={() => {
                  addColor(colorInput);
                  setColorInput("");
                }}
                className="px-3 rounded-lg bg-muted hover:bg-muted/70 text-foreground"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {colors.filter((c) => !COLOR_PRESETS.some((p) => p.name.toLowerCase() === c.toLowerCase())).length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {colors
                  .filter((c) => !COLOR_PRESETS.some((p) => p.name.toLowerCase() === c.toLowerCase()))
                  .map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/15 text-primary text-xs"
                    >
                      {c}
                      <button type="button" onClick={() => removeColor(c)} className="hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
              </div>
            )}
          </div>

          {/* Stock per size */}
          {sizes.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">{t("stock_per_size_label")}</label>
                <button
                  type="button"
                  onClick={() => {
                    const stock: Record<string, number> = {};
                    sizes.forEach((s) => (stock[s] = form.stock || 0));
                    update({ stock_per_size: stock });
                  }}
                  className="text-[11px] text-primary hover:underline"
                >
                  {t("fill_all_with")} {form.stock || 0}
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {sizes.map((s) => (
                  <div
                    key={s}
                    className="flex items-center gap-2 bg-background rounded-lg border border-border px-2 py-1.5"
                  >
                    <span className="text-xs font-medium text-foreground w-8">{s}</span>
                    <input
                      type="number"
                      min={0}
                      value={form.stock_per_size?.[s] ?? ""}
                      onChange={(e) => setStockFor(s, Number(e.target.value))}
                      placeholder="0"
                      className="flex-1 w-full bg-transparent text-sm text-foreground outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
