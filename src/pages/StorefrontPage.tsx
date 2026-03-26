import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Package, ShoppingCart, MessageCircle, Search, X, Plus, Minus, Store, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface Product {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  compare_price: number | null;
  images: string[] | null;
  stock: number;
}

interface CartItem {
  product: Product;
  quantity: number;
}

interface StoreInfo {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  phone: string | null;
  email: string | null;
}

export default function StorefrontPage() {
  const [searchParams] = useSearchParams();
  const storeId = searchParams.get("store");
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showProduct, setShowProduct] = useState<Product | null>(null);
  const [orderForm, setOrderForm] = useState({ name: "", phone: "", address: "", notes: "" });
  const [showCheckout, setShowCheckout] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadStore();
  }, [storeId]);

  const loadStore = async () => {
    setLoading(true);
    try {
      let storeQuery = supabase.from("stores").select("id, name, description, logo_url, cover_image_url, phone, email");
      if (storeId) storeQuery = storeQuery.eq("id", storeId);
      const { data: stores } = await storeQuery.limit(1).single();
      if (!stores) { setLoading(false); return; }
      setStore(stores);

      const { data: prods } = await supabase
        .from("products")
        .select("id, name, description, category, price, compare_price, images, stock")
        .eq("store_id", stores.id)
        .eq("active", true)
        .order("created_at", { ascending: false });
      setProducts(prods || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const categories = ["all", ...Array.from(new Set(products.map(p => p.category).filter(Boolean)))];
  const filtered = products.filter(p =>
    (category === "all" || p.category === category) &&
    (search === "" || p.name.toLowerCase().includes(search.toLowerCase()))
  );

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(c => c.product.id === product.id);
      if (existing) return prev.map(c => c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { product, quantity: 1 }];
    });
    toast.success("Added to cart!");
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(c => c.product.id === productId ? { ...c, quantity: Math.max(0, c.quantity + delta) } : c).filter(c => c.quantity > 0));
  };

  const cartTotal = cart.reduce((s, c) => s + c.product.price * c.quantity, 0);
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  const handleCheckout = async () => {
    if (!orderForm.name || !orderForm.phone || !store) return;
    setSubmitting(true);
    try {
      const items = cart.map(c => ({
        product_id: c.product.id,
        name: c.product.name,
        quantity: c.quantity,
        price: c.product.price,
        image: c.product.images?.[0] || "",
      }));
      
      // Create conversation
      const { data: convo } = await supabase.from("conversations").insert({
        store_id: store.id,
        platform: "whatsapp" as const,
        customer_name: orderForm.name,
        customer_phone: orderForm.phone,
        customer_address: orderForm.address,
        last_message: `New order: ${cart.length} items, $${cartTotal.toFixed(2)}`,
        status: "pending_order" as const,
      }).select().single();

      // Create order
      await supabase.from("orders").insert({
        store_id: store.id,
        customer_name: orderForm.name,
        phone: orderForm.phone,
        address: orderForm.address,
        items,
        total: cartTotal,
        notes: orderForm.notes,
        conversation_id: convo?.id,
        platform: "whatsapp" as const,
      });

      // Send message in conversation
      if (convo) {
        await supabase.from("messages").insert({
          conversation_id: convo.id,
          sender: "customer",
          content: `Hi! I'd like to order:\n${cart.map(c => `• ${c.product.name} × ${c.quantity}`).join("\n")}\n\nTotal: $${cartTotal.toFixed(2)}\nAddress: ${orderForm.address}`,
        });
      }

      toast.success("Order placed successfully! We'll contact you shortly.");
      setCart([]);
      setShowCheckout(false);
      setShowCart(false);
      setOrderForm({ name: "", phone: "", address: "", notes: "" });
    } catch (err: any) {
      toast.error(err.message);
    }
    setSubmitting(false);
  };

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  if (!store) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground">Store not found</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {store.logo_url ? (
              <img src={store.logo_url} alt="" className="h-9 w-9 rounded-lg object-cover" />
            ) : (
              <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
                <Store className="h-5 w-5 text-primary-foreground" />
              </div>
            )}
            <span className="font-heading font-bold text-foreground text-lg">{store.name}</span>
          </div>
          <button onClick={() => setShowCart(true)} className="relative p-2 rounded-lg hover:bg-muted transition-colors">
            <ShoppingCart className="h-5 w-5 text-foreground" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Cover */}
      {store.cover_image_url && (
        <div className="h-48 md:h-64 w-full overflow-hidden">
          <img src={store.cover_image_url} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Store Info */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {store.description && <p className="text-muted-foreground text-sm max-w-xl">{store.description}</p>}
      </div>

      {/* Search & Filters */}
      <div className="max-w-6xl mx-auto px-4 pb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 flex-1 max-w-md">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..." className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1" />
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {categories.map(c => (
              <button key={c} onClick={() => setCategory(c)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${category === c ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                {c === "all" ? "All" : c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Products Grid */}
      <div className="max-w-6xl mx-auto px-4 pb-20">
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <Package className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">No products found</p>
          </div>
        ) : (
          <motion.div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" initial="hidden" animate="show"
            variants={{ show: { transition: { staggerChildren: 0.04 } } }}>
            {filtered.map(p => (
              <motion.div key={p.id} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
                className="glass-hover rounded-xl overflow-hidden cursor-pointer group"
                onClick={() => setShowProduct(p)}>
                <div className="aspect-square bg-muted/50 flex items-center justify-center overflow-hidden relative">
                  {p.images && p.images.length > 0 ? (
                    <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <Package className="h-10 w-10 text-muted-foreground/30" />
                  )}
                  {p.stock === 0 && <span className="absolute top-2 end-2 px-2 py-0.5 rounded text-[10px] font-medium bg-destructive/20 text-destructive">Sold Out</span>}
                  {p.compare_price && <span className="absolute top-2 start-2 px-2 py-0.5 rounded text-[10px] font-medium bg-success/20 text-success">Sale</span>}
                </div>
                <div className="p-3">
                  <p className="text-xs text-muted-foreground">{p.category}</p>
                  <h3 className="text-sm font-medium text-foreground mt-0.5 truncate">{p.name}</h3>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-heading font-bold text-foreground">${Number(p.price).toFixed(2)}</span>
                      {p.compare_price && <span className="text-[10px] text-muted-foreground line-through">${Number(p.compare_price).toFixed(2)}</span>}
                    </div>
                    {p.stock > 0 && (
                      <button onClick={e => { e.stopPropagation(); addToCart(p); }}
                        className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* WhatsApp Float */}
      {store.phone && (
        <a href={`https://wa.me/${store.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener"
          className="fixed bottom-6 end-6 h-14 w-14 rounded-full bg-[#25D366] text-white shadow-lg flex items-center justify-center hover:scale-110 transition-transform z-30">
          <MessageCircle className="h-6 w-6" />
        </a>
      )}

      {/* Product Detail Modal */}
      <AnimatePresence>
        {showProduct && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-sm p-4"
            onClick={() => setShowProduct(null)}>
            <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
              onClick={e => e.stopPropagation()} className="glass rounded-2xl w-full max-w-md max-h-[80vh] overflow-y-auto">
              {showProduct.images && showProduct.images.length > 0 && (
                <img src={showProduct.images[0]} alt="" className="w-full aspect-square object-cover rounded-t-2xl" />
              )}
              <div className="p-6 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{showProduct.category}</p>
                    <h2 className="text-lg font-heading font-bold text-foreground">{showProduct.name}</h2>
                  </div>
                  <button onClick={() => setShowProduct(null)} className="p-1 rounded-lg hover:bg-muted"><X className="h-5 w-5 text-muted-foreground" /></button>
                </div>
                {showProduct.description && <p className="text-sm text-muted-foreground">{showProduct.description}</p>}
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-heading font-bold text-foreground">${Number(showProduct.price).toFixed(2)}</span>
                  {showProduct.compare_price && <span className="text-sm text-muted-foreground line-through">${Number(showProduct.compare_price).toFixed(2)}</span>}
                </div>
                <p className="text-xs text-muted-foreground">{showProduct.stock > 0 ? `${showProduct.stock} in stock` : 'Out of stock'}</p>
                {showProduct.stock > 0 && (
                  <button onClick={() => { addToCart(showProduct); setShowProduct(null); }}
                    className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
                    <ShoppingCart className="h-4 w-4" /> Add to Cart
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cart Drawer */}
      <AnimatePresence>
        {showCart && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" onClick={() => setShowCart(false)}>
            <motion.div initial={{ x: 300 }} animate={{ x: 0 }} exit={{ x: 300 }}
              onClick={e => e.stopPropagation()}
              className="absolute top-0 end-0 h-full w-full max-w-md glass border-s border-border flex flex-col">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h2 className="font-heading font-bold text-foreground">Cart ({cartCount})</h2>
                <button onClick={() => setShowCart(false)} className="p-1 rounded-lg hover:bg-muted"><X className="h-5 w-5 text-muted-foreground" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {cart.length === 0 && <p className="text-sm text-muted-foreground text-center mt-8">Your cart is empty</p>}
                {cart.map(c => (
                  <div key={c.product.id} className="flex items-center gap-3 bg-muted/50 rounded-xl p-3">
                    <div className="h-14 w-14 rounded-lg bg-muted overflow-hidden shrink-0">
                      {c.product.images?.[0] ? <img src={c.product.images[0]} alt="" className="h-full w-full object-cover" /> : <Package className="h-6 w-6 text-muted-foreground m-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.product.name}</p>
                      <p className="text-xs text-muted-foreground">${Number(c.product.price).toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => updateQuantity(c.product.id, -1)} className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center hover:bg-background"><Minus className="h-3 w-3" /></button>
                      <span className="text-sm font-medium w-6 text-center">{c.quantity}</span>
                      <button onClick={() => updateQuantity(c.product.id, 1)} className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center hover:bg-background"><Plus className="h-3 w-3" /></button>
                    </div>
                  </div>
                ))}
              </div>
              {cart.length > 0 && (
                <div className="p-4 border-t border-border space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">Total</span>
                    <span className="text-xl font-heading font-bold text-foreground">${cartTotal.toFixed(2)}</span>
                  </div>
                  <button onClick={() => { setShowCart(false); setShowCheckout(true); }}
                    className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors">
                    Checkout
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Checkout Modal */}
      <AnimatePresence>
        {showCheckout && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
            onClick={() => setShowCheckout(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              onClick={e => e.stopPropagation()} className="glass rounded-2xl w-full max-w-md p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-heading font-bold text-foreground">Complete Order</h2>
                <button onClick={() => setShowCheckout(false)} className="p-1 rounded-lg hover:bg-muted"><X className="h-5 w-5 text-muted-foreground" /></button>
              </div>
              <div className="space-y-3">
                <div><label className="text-xs text-muted-foreground">Full Name *</label><input value={orderForm.name} onChange={e => setOrderForm(f => ({ ...f, name: e.target.value }))} className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" /></div>
                <div><label className="text-xs text-muted-foreground">Phone *</label><input value={orderForm.phone} onChange={e => setOrderForm(f => ({ ...f, phone: e.target.value }))} className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" /></div>
                <div><label className="text-xs text-muted-foreground">Delivery Address</label><input value={orderForm.address} onChange={e => setOrderForm(f => ({ ...f, address: e.target.value }))} className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" /></div>
                <div><label className="text-xs text-muted-foreground">Notes</label><textarea value={orderForm.notes} onChange={e => setOrderForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none resize-none focus:ring-1 focus:ring-primary" /></div>
              </div>
              <div className="glass rounded-lg p-3 space-y-1.5">
                {cart.map(c => (
                  <div key={c.product.id} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{c.product.name} × {c.quantity}</span>
                    <span className="text-foreground">${(c.product.price * c.quantity).toFixed(2)}</span>
                  </div>
                ))}
                <div className="border-t border-border pt-1.5 flex justify-between font-medium">
                  <span className="text-foreground">Total</span>
                  <span className="text-foreground">${cartTotal.toFixed(2)}</span>
                </div>
              </div>
              <button onClick={handleCheckout} disabled={submitting || !orderForm.name || !orderForm.phone}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
                {submitting ? "Placing Order..." : "Place Order"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
