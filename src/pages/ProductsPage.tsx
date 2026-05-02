import { useMemo, useState } from "react";
import {
  Search,
  Plus,
  Grid3X3,
  List,
  AlertTriangle,
  Package,
  Loader2,
  Copy,
  Edit3,
  Trash2,
  MoreVertical,
  Download,
  Upload,
  ChevronDown,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  useProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useBulkCreateProducts,
  useAISettings,
} from "@/hooks/useSupabaseData";
import { useLanguage } from "@/contexts/LanguageContext";
import { ProductWizard, ProductForm } from "@/components/products/ProductWizard";
import { CsvImportDialog } from "@/components/products/CsvImportDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportProductsCsv, downloadCsv } from "@/lib/csv";
import { toast } from "sonner";

export default function ProductsPage() {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [initialForm, setInitialForm] = useState<Partial<ProductForm> | null>(null);
  const [initialStep, setInitialStep] = useState<1 | 2 | 3>(1);

  const { t, dir } = useLanguage();
  const { data: products = [], isLoading } = useProducts();
  const { data: aiSettings } = useAISettings();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const bulkCreate = useBulkCreateProducts();

  const categoriesList = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[],
    [products],
  );
  const categoriesWithAll = ["all", ...categoriesList];
  const filtered = products.filter(
    (p) =>
      (categoryFilter === "all" || p.category === categoryFilter) &&
      (search === "" || p.name.toLowerCase().includes(search.toLowerCase())),
  );

  const openCreate = () => {
    setEditingId(null);
    setInitialForm(null);
    setInitialStep(1);
    setWizardOpen(true);
  };

  const openEdit = (p: any) => {
    setEditingId(p.id);
    setInitialForm({
      name: p.name,
      description: p.description || "",
      category: p.category || "",
      price: Number(p.price),
      compare_price: Number(p.compare_price || 0),
      stock: p.stock,
      sku: p.sku || "",
      active: p.active,
      images: p.images || [],
      variants: Array.isArray(p.variants) ? structuredClone(p.variants) : [],
      sizes_available: Array.isArray(p.sizes_available) ? [...p.sizes_available] : [],
      stock_per_size: p.stock_per_size ? structuredClone(p.stock_per_size) : {},
      auto_description: p.auto_description || "",
      type: p.type || null,
      color: Array.isArray(p.color) ? [...p.color] : [],
      pattern: p.pattern || null,
      style: p.style || null,
      material: p.material || null,
      fit: p.fit || null,
      occasion: Array.isArray(p.occasion) ? [...p.occasion] : [],
      sleeve: p.sleeve || null,
      neckline: p.neckline || null,
      length: p.length || null,
    });
    setInitialStep(1);
    setWizardOpen(true);
  };

  const duplicate = (p: any) => {
    setEditingId(null);
    setInitialForm({
      name: `${p.name} (Copy)`,
      description: p.description || "",
      category: p.category || "",
      price: Number(p.price),
      compare_price: Number(p.compare_price || 0),
      stock: p.stock,
      sku: "",
      active: p.active,
      images: p.images || [],
      variants: Array.isArray(p.variants) ? structuredClone(p.variants) : [],
      sizes_available: Array.isArray(p.sizes_available) ? [...p.sizes_available] : [],
      stock_per_size: p.stock_per_size ? structuredClone(p.stock_per_size) : {},
      auto_description: p.auto_description || "",
      type: p.type || null,
      color: Array.isArray(p.color) ? [...p.color] : [],
      pattern: p.pattern || null,
      style: p.style || null,
      material: p.material || null,
      fit: p.fit || null,
      occasion: Array.isArray(p.occasion) ? [...p.occasion] : [],
      sleeve: p.sleeve || null,
      neckline: p.neckline || null,
      length: p.length || null,
    });
    setInitialStep(2);
    setWizardOpen(true);
  };

  const handleSubmit = async (form: ProductForm, opts: { addAnother: boolean }) => {
    if (editingId) {
      await updateProduct.mutateAsync({ id: editingId, ...form });
    } else {
      await createProduct.mutateAsync(form);
    }
    if (!opts.addAnother) setWizardOpen(false);
  };

  const handleDelete = async () => {
    if (!editingId) return;
    if (!confirm(t("confirm_delete_product"))) return;
    await deleteProduct.mutateAsync(editingId);
    setWizardOpen(false);
  };

  const handleExport = () => {
    if (filtered.length === 0) {
      toast.error(t("no_products_to_export"));
      return;
    }
    downloadCsv(`products-${Date.now()}.csv`, exportProductsCsv(filtered as any));
  };

  const handleBulkImport = async (rows: any[]) => {
    await bulkCreate.mutateAsync(rows);
  };

  if (isLoading)
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 pb-20 md:pb-6" dir={dir}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-heading font-bold text-foreground">{t("products")}</h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            {products.length} {t("products_count_suffix")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-lg px-2.5 md:px-3 py-2 text-xs md:text-sm border border-border text-foreground hover:bg-muted flex items-center gap-1.5 transition-colors">
                <span className="hidden sm:inline">{t("import_export")}</span>
                <span className="sm:hidden">{t("csv_short")}</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setCsvOpen(true)}>
                <Upload className="h-4 w-4 me-2" /> {t("import_csv")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExport}>
                <Download className="h-4 w-4 me-2" /> {t("export_csv_action")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={openCreate}
            className="rounded-lg px-3 py-2 text-xs md:text-sm bg-primary text-primary-foreground font-medium flex items-center gap-1.5 hover:bg-primary/90 transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t("add_product")}</span>
            <span className="sm:hidden">{t("add_short")}</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 w-full sm:flex-1 sm:max-w-sm">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search")}
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {categoriesWithAll.map((c) => (
            <button
              key={c}
              onClick={() => setCategoryFilter(c)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                categoryFilter === c ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {c === "all" ? t("all") : c}
            </button>
          ))}
        </div>
        <div className="flex gap-1 ms-auto">
          <button
            onClick={() => setView("grid")}
            className={`p-1.5 rounded ${view === "grid" ? "bg-muted text-foreground" : "text-muted-foreground"}`}
          >
            <Grid3X3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView("list")}
            className={`p-1.5 rounded ${view === "list" ? "bg-muted text-foreground" : "text-muted-foreground"}`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center">
          <Package className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">{t("no_products")}</p>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> {t("add_product")}
          </button>
        </div>
      ) : view === "grid" ? (
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.04 } } }}
        >
          {filtered.map((p) => (
            <motion.div
              key={p.id}
              variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
              className="glass-hover rounded-xl overflow-hidden group relative"
            >
              <div
                onClick={() => openEdit(p)}
                className="aspect-square bg-muted/50 flex items-center justify-center relative overflow-hidden cursor-pointer"
              >
                {p.images && p.images.length > 0 ? (
                  <img
                    src={p.images[0]}
                    alt={p.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <Package className="h-12 w-12 text-muted-foreground/30" />
                )}
                {p.stock <= 5 && p.stock > 0 && (
                  <span className="absolute top-2 end-2 px-2 py-0.5 rounded text-[10px] font-medium bg-warning/20 text-warning flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> {t("low_stock")}
                  </span>
                )}
                {p.stock === 0 && (
                  <span className="absolute top-2 end-2 px-2 py-0.5 rounded text-[10px] font-medium bg-destructive/20 text-destructive">
                    {t("out_of_stock")}
                  </span>
                )}
                {!p.active && (
                  <span className="absolute top-2 start-2 px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                    {t("inactive")}
                  </span>
                )}
                {/* Hover quick actions */}
                <div className="absolute bottom-2 end-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(p);
                    }}
                    title={t("edit")}
                    className="p-1.5 rounded-md bg-background/90 text-foreground hover:bg-background"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicate(p);
                    }}
                    title={t("duplicate")}
                    className="p-1.5 rounded-md bg-background/90 text-foreground hover:bg-background"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (confirm(`${t("delete")} "${p.name}"?`)) await deleteProduct.mutateAsync(p.id);
                    }}
                    title={t("delete")}
                    className="p-1.5 rounded-md bg-background/90 text-destructive hover:bg-background"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="p-4 cursor-pointer" onClick={() => openEdit(p)}>
                <p className="text-xs text-muted-foreground">{p.category}</p>
                <h3 className="text-sm font-medium text-foreground mt-0.5 truncate">{p.name}</h3>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-foreground font-heading font-bold">${Number(p.price).toFixed(2)}</span>
                  {p.compare_price && (
                    <span className="text-xs text-muted-foreground line-through">
                      ${Number(p.compare_price).toFixed(2)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("stock_label")}: {p.stock} · {t("sku_label")}: {p.sku || "—"}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start">
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{t("product_col_h")}</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{t("category_col_h")}</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{t("price_col_h")}</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{t("stock_col_h")}</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{t("status_col_h")}</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td onClick={() => openEdit(p)} className="px-4 py-3 text-foreground font-medium cursor-pointer">
                    <div className="flex items-center gap-2">
                      {p.images && p.images.length > 0 ? (
                        <img src={p.images[0]} alt="" className="h-8 w-8 rounded object-cover" />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                          <Package className="h-4 w-4 text-muted-foreground/50" />
                        </div>
                      )}
                      {p.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.category}</td>
                  <td className="px-4 py-3 text-foreground">${Number(p.price).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={p.stock <= 5 ? "text-warning" : "text-muted-foreground"}>{p.stock}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        p.active ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {p.active ? t("active") : t("inactive")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1 rounded hover:bg-muted">
                          <MoreVertical className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(p)}>
                          <Edit3 className="h-4 w-4 me-2" /> {t("edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => duplicate(p)}>
                          <Copy className="h-4 w-4 me-2" /> {t("duplicate")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={async () => {
                            if (confirm(`${t("delete")} "${p.name}"?`)) await deleteProduct.mutateAsync(p.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 me-2" /> {t("delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ProductWizard
        key={editingId || "new-product"}
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        initial={initialForm}
        editingId={editingId}
        initialStep={initialStep}
        categories={categoriesList}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
        aiLanguage={aiSettings?.language}
        saving={createProduct.isPending || updateProduct.isPending}
      />

      <CsvImportDialog open={csvOpen} onClose={() => setCsvOpen(false)} onImport={handleBulkImport} />
    </div>
  );
}
