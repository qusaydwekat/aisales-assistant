import { useState } from "react";
import { Search, Plus, Grid3X3, List, AlertTriangle, Package } from "lucide-react";
import { motion } from "framer-motion";
import { products, type Product } from "@/data/mock-data";

export default function ProductsPage() {
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const categories = ['all', ...Array.from(new Set(products.map(p => p.category)))];
  const filtered = products.filter(p =>
    (categoryFilter === 'all' || p.category === categoryFilter) &&
    (search === '' || p.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Products</h1>
          <p className="text-sm text-muted-foreground mt-1">{products.length} products</p>
        </div>
        <button className="rounded-lg px-3 py-2 text-sm bg-primary text-primary-foreground font-medium flex items-center gap-1.5 hover:bg-primary/90 transition-colors">
          <Plus className="h-4 w-4" /> Add Product
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 flex-1 max-w-sm">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..." className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1" />
        </div>
        <div className="flex gap-1">
          {categories.map(c => (
            <button key={c} onClick={() => setCategoryFilter(c)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${categoryFilter === c ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
              {c === 'all' ? 'All' : c}
            </button>
          ))}
        </div>
        <div className="flex gap-1 ml-auto">
          <button onClick={() => setView('grid')} className={`p-1.5 rounded ${view === 'grid' ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}><Grid3X3 className="h-4 w-4" /></button>
          <button onClick={() => setView('list')} className={`p-1.5 rounded ${view === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}><List className="h-4 w-4" /></button>
        </div>
      </div>

      {view === 'grid' ? (
        <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.05 } } }}>
          {filtered.map(p => (
            <motion.div key={p.id} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }} className="glass-hover rounded-xl overflow-hidden cursor-pointer group">
              <div className="aspect-square bg-muted/50 flex items-center justify-center relative">
                <Package className="h-12 w-12 text-muted-foreground/30" />
                {p.stock <= 5 && p.stock > 0 && (
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-medium bg-warning/20 text-warning flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Low Stock
                  </span>
                )}
                {p.stock === 0 && (
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-medium bg-destructive/20 text-destructive">Out of Stock</span>
                )}
                {!p.active && (
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">Inactive</span>
                )}
              </div>
              <div className="p-4">
                <p className="text-xs text-muted-foreground">{p.category}</p>
                <h3 className="text-sm font-medium text-foreground mt-0.5 truncate">{p.name}</h3>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-foreground font-heading font-bold">${p.price.toFixed(2)}</span>
                  {p.comparePrice && <span className="text-xs text-muted-foreground line-through">${p.comparePrice.toFixed(2)}</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Stock: {p.stock} · SKU: {p.sku}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left">
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Product</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Category</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Price</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Stock</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Status</th>
            </tr></thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer">
                  <td className="px-4 py-3 text-foreground font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.category}</td>
                  <td className="px-4 py-3 text-foreground">${p.price.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={p.stock <= 5 ? 'text-warning' : 'text-muted-foreground'}>{p.stock}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${p.active ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}`}>
                      {p.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
