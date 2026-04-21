import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Loader2, Trash2, ChevronLeft, ChevronRight, Check } from "lucide-react";
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
};

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
  const { language } = useLanguage();
  const [step, setStep] = useState<1 | 2 | 3>(initialStep);
  const [form, setForm] = useState<ProductForm>({ ...EMPTY, ...(initial || {}) });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiHint, setAiHint] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY, ...(initial || {}) });
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
      }));
      setAiHint(true);
      toast.success("AI suggestions applied");
    } catch (e: any) {
      toast.error(e.message || "AI autofill failed");
    } finally {
      setAiLoading(false);
    }
  };

  const submit = async (addAnother: boolean) => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      setStep(2);
      return;
    }
    await onSubmit(form, { addAnother });
    if (addAnother) {
      setForm({ ...EMPTY });
      setStep(1);
    }
  };

  const stepLabels = ["Photos", "Basics", "Details"];
  const progress = (step / 3) * 100;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-2 md:p-4"
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
                {editingId ? "Edit product" : "New product"}
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
                    {aiLoading ? "Analyzing image..." : "Autofill with AI"}
                  </button>
                )}
                {aiHint && (
                  <p className="text-xs text-primary text-center">✨ AI suggested — edit anytime in next steps</p>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground">Name *</label>
                  <input
                    autoFocus
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="e.g. Classic Leather Wallet"
                    className="w-full mt-1 rounded-lg bg-muted px-3 py-3 text-base text-foreground outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Price *</label>
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
                    <label className="text-xs text-muted-foreground">Compare price</label>
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
                    <label className="text-xs text-muted-foreground">Stock</label>
                    <input
                      type="number"
                      value={form.stock || ""}
                      onChange={(e) => set("stock", Number(e.target.value))}
                      placeholder="0"
                      className="w-full mt-1 rounded-lg bg-muted px-3 py-3 text-base text-foreground outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">SKU</label>
                    <input
                      value={form.sku}
                      onChange={(e) => set("sku", e.target.value)}
                      placeholder="optional"
                      className="w-full mt-1 rounded-lg bg-muted px-3 py-3 text-base text-foreground outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground">Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    rows={5}
                    placeholder="Tell customers what makes this product special..."
                    className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none resize-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Category</label>
                  <CategoryCombobox
                    value={form.category}
                    onChange={(v) => set("category", v)}
                    options={categories}
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => set("active", e.target.checked)}
                    className="accent-primary h-4 w-4"
                  />
                  <span className="text-sm text-foreground">Active (visible in storefront)</span>
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
                <span className="hidden sm:inline">Delete</span>
              </button>
            )}
            <div className="flex-1" />
            {step > 1 && (
              <button
                onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
                className="px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted flex items-center gap-1"
              >
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
            )}
            {step < 3 ? (
              <button
                onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
                disabled={step === 2 && !canNextFromBasics}
                className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <>
                {!editingId && (
                  <button
                    onClick={() => submit(true)}
                    disabled={saving}
                    className="px-3 py-2 rounded-lg text-sm border border-border text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    Save & add another
                  </button>
                )}
                <button
                  onClick={() => submit(false)}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingId ? "Save" : "Create"}
                </button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
