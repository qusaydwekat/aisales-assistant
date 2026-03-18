import { useState } from "react";
import { Search, Filter, Download, Plus, Facebook, Instagram, MessageCircle, ChevronDown, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { orders, orderStatusColors, platformColors, type Order, type OrderStatus, type Platform } from "@/data/mock-data";

const platformIcons: Record<Platform, typeof Facebook> = { facebook: Facebook, instagram: Instagram, whatsapp: MessageCircle };

export default function OrdersPage() {
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const filtered = orders.filter(o => statusFilter === 'all' || o.status === statusFilter);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">{orders.length} total orders</p>
        </div>
        <div className="flex gap-2">
          <button className="glass-hover rounded-lg px-3 py-2 text-sm text-muted-foreground flex items-center gap-1.5">
            <Download className="h-4 w-4" /> Export CSV
          </button>
          <button className="rounded-lg px-3 py-2 text-sm bg-primary text-primary-foreground font-medium flex items-center gap-1.5 hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Create Order
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5">
        {(['all', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Order ID</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Customer</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">Phone</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden lg:table-cell">Products</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Total</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Status</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden sm:table-cell">Platform</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden lg:table-cell">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(order => {
                const PlatformIcon = platformIcons[order.platform];
                return (
                  <tr key={order.id} onClick={() => setSelectedOrder(order)} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{order.id}</td>
                    <td className="px-4 py-3 text-foreground">{order.customerName}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{order.phone}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{order.items.map(i => i.name).join(', ')}</td>
                    <td className="px-4 py-3 font-medium text-foreground">${order.total.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-md text-xs font-medium ${orderStatusColors[order.status]}`}>
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <PlatformIcon className="h-4 w-4" style={{ color: platformColors[order.platform] }} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Detail Modal */}
      <AnimatePresence>
        {selectedOrder && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
            onClick={() => setSelectedOrder(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="glass rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-heading font-bold text-foreground">{selectedOrder.id}</h2>
                <button onClick={() => setSelectedOrder(null)} className="p-1 rounded-lg hover:bg-muted"><X className="h-5 w-5 text-muted-foreground" /></button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-muted-foreground text-xs">Customer</p><p className="text-foreground">{selectedOrder.customerName}</p></div>
                <div><p className="text-muted-foreground text-xs">Phone</p><p className="text-foreground">{selectedOrder.phone}</p></div>
                <div className="col-span-2"><p className="text-muted-foreground text-xs">Address</p><p className="text-foreground">{selectedOrder.address}</p></div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-2">Items</p>
                {selectedOrder.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-border/50 text-sm">
                    <div>
                      <p className="text-foreground">{item.name}</p>
                      <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                    </div>
                    <p className="text-foreground font-medium">${(item.price * item.quantity).toFixed(2)}</p>
                  </div>
                ))}
                <div className="flex justify-between mt-3 text-foreground font-heading font-bold">
                  <span>Total</span>
                  <span>${selectedOrder.total.toFixed(2)}</span>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-2">Status</p>
                <span className={`px-3 py-1.5 rounded-lg text-xs font-medium ${orderStatusColors[selectedOrder.status]}`}>
                  {selectedOrder.status.charAt(0).toUpperCase() + selectedOrder.status.slice(1)}
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
