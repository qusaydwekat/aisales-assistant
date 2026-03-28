import { useState } from "react";
import { Search, Plus, Grid3X3, List, AlertTriangle, Package, X, Loader2, Trash2, Upload } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from "@/hooks/useSupabaseData";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useLanguage } from "@/contexts/LanguageContext";

export default function ProductsPage() {
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', category: '', price: 0, compare_price: 0, stock: 0, sku: '', active: true, images: [] as string[] });
  const { t, dir } = useLanguage();
  const { upload, uploading } = useFileUpload();

  const { data: products = [], isLoading } = useProducts();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const categories = ['all', ...Array.from(new Set(products.map(p => p.category).filter(Boolean)))];
  const filtered = products.filter(p =>
    (categoryFilter === 'all' || p.category === categoryFilter) &&
    (search === '' || p.name.toLowerCase().includes(search.toLowerCase()))
  );

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: '', description: '', category: '', price: 0, compare_price: 0, stock: 0, sku: '', active: true, images: [] });
    setShowForm(true);
  };

  const openEdit = (p: any) => {
    setEditingId(p.id);
    setForm({ name: p.name, description: p.description || '', category: p.category || '', price: Number(p.price), compare_price: Number(p.compare_price || 0), stock: p.stock, sku: p.sku || '', active: p.active, images: p.images || [] });
    setShowForm(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await upload(file, "products");
    if (url) {
      setForm(f => ({ ...f, images: [...f.images, url] }));
    }
  };

  const removeImage = (idx: number) => {
    setForm(f => ({ ...f, images: f.images.filter((_, i) => i !== idx) }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    if (editingId) {
      await updateProduct.mutateAsync({ id: editingId, ...form });
    } else {
      await createProduct.mutateAsync(form);
    }
    setShowForm(false);
  };

  if (isLoading) return <div className="p-6 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 pb-20 md:pb-6" dir={dir}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-heading font-bold text-foreground">{t("products")}</h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">{products.length} {t("products").toLowerCase()}</p>
        </div>
        <button onClick={openCreate} className="rounded-lg px-3 py-2 text-xs md:text-sm bg-primary text-primary-foreground font-medium flex items-center gap-1.5 hover:bg-primary/90 transition-colors shrink-0">
          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">{t("add_product")}</span><span className="sm:hidden">Add</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 w-full sm:flex-1 sm:max-w-sm">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("search")} className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1" />
        </div>
        <div className="flex gap-1">
          {categories.map(c => (
            <button key={c} onClick={() => setCategoryFilter(c)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${categoryFilter === c ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
              {c === 'all' ? t('all') : c}
            </button>
          ))}
        </div>
        <div className="flex gap-1 ms-auto">
          <button onClick={() => setView('grid')} className={`p-1.5 rounded ${view === 'grid' ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}><Grid3X3 className="h-4 w-4" /></button>
          <button onClick={() => setView('list')} className={`p-1.5 rounded ${view === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}><List className="h-4 w-4" /></button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center">
          <Package className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">{t("no_products")}</p>
        </div>
      ) : view === 'grid' ? (
        <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.05 } } }}>
          {filtered.map(p => (
            <motion.div key={p.id} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }} onClick={() => openEdit(p)} className="glass-hover rounded-xl overflow-hidden cursor-pointer group">
              <div className="aspect-square bg-muted/50 flex items-center justify-center relative overflow-hidden">
                {p.images && p.images.length > 0 ? (
                  <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <Package className="h-12 w-12 text-muted-foreground/30" />
                )}
                {p.stock <= 5 && p.stock > 0 && (
                  <span className="absolute top-2 end-2 px-2 py-0.5 rounded text-[10px] font-medium bg-warning/20 text-warning flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> {t("low_stock")}
                  </span>
                )}
                {p.stock === 0 && (
                  <span className="absolute top-2 end-2 px-2 py-0.5 rounded text-[10px] font-medium bg-destructive/20 text-destructive">{t("out_of_stock")}</span>
                )}
                {!p.active && (
                  <span className="absolute top-2 start-2 px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">{t("inactive")}</span>
                )}
              </div>
              <div className="p-4">
                <p className="text-xs text-muted-foreground">{p.category}</p>
                <h3 className="text-sm font-medium text-foreground mt-0.5 truncate">{p.name}</h3>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-foreground font-heading font-bold">${Number(p.price).toFixed(2)}</span>
                  {p.compare_price && <span className="text-xs text-muted-foreground line-through">${Number(p.compare_price).toFixed(2)}</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Stock: {p.stock} · SKU: {p.sku}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-start">
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Product</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Category</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Price</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Stock</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Status</th>
            </tr></thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} onClick={() => openEdit(p)} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer">
                  <td className="px-4 py-3 text-foreground font-medium">
                    <div className="flex items-center gap-2">
                      {p.images && p.images.length > 0 ? (
                        <img src={p.images[0]} alt="" className="h-8 w-8 rounded object-cover" />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center"><Package className="h-4 w-4 text-muted-foreground/50" /></div>
                      )}
                      {p.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.category}</td>
                  <td className="px-4 py-3 text-foreground">${Number(p.price).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={p.stock <= 5 ? 'text-warning' : 'text-muted-foreground'}>{p.stock}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${p.active ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}`}>
                      {p.active ? t('active') : t('inactive')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Product Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
            onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              className="glass rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-heading font-bold text-foreground">{editingId ? t('edit_product') : t('add_product')}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 rounded-lg hover:bg-muted"><X className="h-5 w-5 text-muted-foreground" /></button>
              </div>

              {/* Image Upload */}
              <div>
                <label className="text-xs text-muted-foreground">Images</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {form.images.map((img, i) => (
                    <div key={i} className="relative h-20 w-20 rounded-lg overflow-hidden group">
                      <img src={img} alt="" className="h-full w-full object-cover" />
                      <button onClick={() => removeImage(i)} className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <X className="h-4 w-4 text-white" />
                      </button>
                    </div>
                  ))}
                  <label className="h-20 w-20 rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center cursor-pointer transition-colors">
                    {uploading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : <Upload className="h-5 w-5 text-muted-foreground" />}
                    <span className="text-[10px] text-muted-foreground mt-1">Upload</span>
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={uploading} />
                  </label>
                </div>
              </div>

              <div className="space-y-3">
                <div><label className="text-xs text-muted-foreground">Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" /></div>
                <div><label className="text-xs text-muted-foreground">Description</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none resize-none focus:ring-1 focus:ring-primary" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-muted-foreground">Category</label><input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" /></div>
                  <div><label className="text-xs text-muted-foreground">SKU</label><input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="text-xs text-muted-foreground">Price *</label><input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))} className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" /></div>
                  <div><label className="text-xs text-muted-foreground">Compare Price</label><input type="number" value={form.compare_price} onChange={e => setForm(f => ({ ...f, compare_price: Number(e.target.value) }))} className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" /></div>
                  <div><label className="text-xs text-muted-foreground">Stock *</label><input type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: Number(e.target.value) }))} className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" /></div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="accent-primary" />
                  <label className="text-sm text-foreground">{t("active")}</label>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                {editingId && (
                  <button onClick={async () => { await deleteProduct.mutateAsync(editingId); setShowForm(false); }}
                    className="px-4 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10 flex items-center gap-1.5 transition-colors">
                    <Trash2 className="h-4 w-4" /> {t("delete")}
                  </button>
                )}
                <div className="flex-1" />
                <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors">{t("cancel")}</button>
                <button onClick={handleSubmit} disabled={createProduct.isPending || updateProduct.isPending}
                  className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
                  {createProduct.isPending || updateProduct.isPending ? t('saving') : editingId ? t('update') : t('create')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
