import { useState } from "react";
import { Download, Plus, Facebook, Instagram, MessageCircle, X, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useOrders, useUpdateOrderStatus, useCreateOrder } from "@/hooks/useSupabaseData";
import { platformColors } from "@/data/mock-data";
import type { Tables } from "@/integrations/supabase/types";

type OrderStatus = "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled";
type Platform = "facebook" | "instagram" | "whatsapp";
const platformIcons: Record<Platform, typeof Facebook> = { facebook: Facebook, instagram: Instagram, whatsapp: MessageCircle };
const orderStatusColors: Record<string, string> = {
  pending: "bg-warning/20 text-warning", confirmed: "bg-primary/20 text-primary",
  processing: "bg-accent/20 text-accent", shipped: "bg-info/20 text-info",
  delivered: "bg-success/20 text-success", cancelled: "bg-destructive/20 text-destructive",
};

export default function OrdersPage() {
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [selectedOrder, setSelectedOrder] = useState<Tables<"orders"> | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ customer_name: '', phone: '', address: '', total: 0, notes: '' });

  const { data: orders = [], isLoading } = useOrders();
  const updateStatus = useUpdateOrderStatus();
  const createOrder = useCreateOrder();

  const filtered = orders.filter(o => statusFilter === 'all' || o.status === statusFilter);

  const handleExport = () => {
    const csv = ["Order,Customer,Phone,Total,Status,Date",
      ...orders.map(o => `${o.order_number},${o.customer_name},${o.phone},${o.total},${o.status},${new Date(o.created_at).toLocaleDateString()}`)
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "orders.csv"; a.click();
  };

  const handleCreate = async () => {
    if (!createForm.customer_name.trim()) return;
    await createOrder.mutateAsync({ ...createForm, items: [] });
    setShowCreate(false);
    setCreateForm({ customer_name: '', phone: '', address: '', total: 0, notes: '' });
  };

  if (isLoading) return <div className="p-6 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 pb-20 md:pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-heading font-bold text-foreground">Orders</h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">{orders.length} total orders</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="glass-hover rounded-lg px-3 py-2 text-xs md:text-sm text-muted-foreground flex items-center gap-1.5">
            <Download className="h-4 w-4" /> <span className="hidden sm:inline">Export CSV</span><span className="sm:hidden">Export</span>
          </button>
          <button onClick={() => setShowCreate(true)} className="rounded-lg px-3 py-2 text-xs md:text-sm bg-primary text-primary-foreground font-medium flex items-center gap-1.5 hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Create Order</span><span className="sm:hidden">Create</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(['all', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center text-muted-foreground">No orders found.</div>
      ) : (
        <div className="glass rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Order ID</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Customer</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">Phone</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Total</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Status</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden sm:table-cell">Platform</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden lg:table-cell">Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(order => {
                  const PlatformIcon = order.platform ? platformIcons[order.platform as Platform] : null;
                  return (
                    <tr key={order.id} onClick={() => setSelectedOrder(order)} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">{order.order_number}</td>
                      <td className="px-4 py-3 text-foreground">{order.customer_name}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{order.phone}</td>
                      <td className="px-4 py-3 font-medium text-foreground">${Number(order.total).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-md text-xs font-medium ${orderStatusColors[order.status]}`}>
                          {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {PlatformIcon && <PlatformIcon className="h-4 w-4" style={{ color: platformColors[order.platform as Platform] }} />}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                        {new Date(order.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Order Detail Modal */}
      <AnimatePresence>
        {selectedOrder && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
            onClick={() => setSelectedOrder(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              className="glass rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-heading font-bold text-foreground">{selectedOrder.order_number}</h2>
                <button onClick={() => setSelectedOrder(null)} className="p-1 rounded-lg hover:bg-muted"><X className="h-5 w-5 text-muted-foreground" /></button>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-muted-foreground text-xs">Customer</p><p className="text-foreground">{selectedOrder.customer_name}</p></div>
                <div><p className="text-muted-foreground text-xs">Phone</p><p className="text-foreground">{selectedOrder.phone}</p></div>
                <div className="col-span-2"><p className="text-muted-foreground text-xs">Address</p><p className="text-foreground">{selectedOrder.address || '—'}</p></div>
                {selectedOrder.notes && <div className="col-span-2"><p className="text-muted-foreground text-xs">Notes</p><p className="text-foreground">{selectedOrder.notes}</p></div>}
              </div>
              <div className="flex justify-between items-center text-foreground font-heading font-bold">
                <span>Total</span>
                <span>${Number(selectedOrder.total).toFixed(2)}</span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">Update Status</p>
                <select
                  value={selectedOrder.status}
                  onChange={e => {
                    updateStatus.mutate({ id: selectedOrder.id, status: e.target.value as OrderStatus });
                    setSelectedOrder({ ...selectedOrder, status: e.target.value as OrderStatus });
                  }}
                  className="w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none">
                  {["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"].map(s => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Order Modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
            onClick={() => setShowCreate(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              className="glass rounded-2xl w-full max-w-md p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-heading font-bold text-foreground">Create Order</h2>
                <button onClick={() => setShowCreate(false)} className="p-1 rounded-lg hover:bg-muted"><X className="h-5 w-5 text-muted-foreground" /></button>
              </div>
              <div className="space-y-3">
                <div><label className="text-xs text-muted-foreground">Customer Name *</label><input value={createForm.customer_name} onChange={e => setCreateForm(f => ({ ...f, customer_name: e.target.value }))} className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-muted-foreground">Phone</label><input value={createForm.phone} onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))} className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" /></div>
                  <div><label className="text-xs text-muted-foreground">Total</label><input type="number" value={createForm.total} onChange={e => setCreateForm(f => ({ ...f, total: Number(e.target.value) }))} className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" /></div>
                </div>
                <div><label className="text-xs text-muted-foreground">Address</label><input value={createForm.address} onChange={e => setCreateForm(f => ({ ...f, address: e.target.value }))} className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" /></div>
                <div><label className="text-xs text-muted-foreground">Notes</label><textarea value={createForm.notes} onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none resize-none focus:ring-1 focus:ring-primary" /></div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted">Cancel</button>
                <button onClick={handleCreate} disabled={createOrder.isPending} className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50">
                  {createOrder.isPending ? 'Creating...' : 'Create'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
