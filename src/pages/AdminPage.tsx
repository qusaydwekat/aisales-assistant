import { useState } from "react";
import { 
  Users, ShoppingCart, MessageSquare, Package, Check, X as XIcon, 
  Loader2, Shield, BarChart3, Store, Link2, Eye, TrendingUp,
  ArrowUpRight, Clock, AlertCircle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  useAdminUsers, useAdminStats, useAdminUpdateUserStatus, 
  useAdminStores, useAdminOrders, useAdminConversations,
  useAdminProducts, useAdminConnections 
} from "@/hooks/useSupabaseData";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { format } from "date-fns";

type Tab = 'overview' | 'users' | 'pending' | 'stores' | 'orders' | 'conversations';

const tabs: { key: Tab; label: string; icon: any }[] = [
  { key: 'overview', label: 'Overview', icon: BarChart3 },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'pending', label: 'Pending', icon: AlertCircle },
  { key: 'stores', label: 'Stores', icon: Store },
  { key: 'orders', label: 'Orders', icon: ShoppingCart },
  { key: 'conversations', label: 'Conversations', icon: MessageSquare },
];

const statusColors: Record<string, string> = {
  active: 'bg-success/20 text-success',
  pending: 'bg-warning/20 text-warning',
  suspended: 'bg-destructive/20 text-destructive',
  open: 'bg-primary/20 text-primary',
  resolved: 'bg-success/20 text-success',
  pending_order: 'bg-warning/20 text-warning',
  confirmed: 'bg-primary/20 text-primary',
  processing: 'bg-accent/20 text-accent',
  shipped: 'bg-info/20 text-info',
  delivered: 'bg-success/20 text-success',
  cancelled: 'bg-destructive/20 text-destructive',
};

const platformColors: Record<string, string> = {
  facebook: 'bg-[hsl(220,46%,48%)]/20 text-[hsl(220,46%,48%)]',
  instagram: 'bg-[hsl(330,60%,52%)]/20 text-[hsl(330,60%,52%)]',
  whatsapp: 'bg-success/20 text-success',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[status] || 'bg-muted text-muted-foreground'}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${platformColors[platform] || 'bg-muted text-muted-foreground'}`}>
      {platform}
    </span>
  );
}

export default function AdminPage() {
  const { role, loading } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const { data: users = [], isLoading: loadingUsers } = useAdminUsers();
  const { data: stores = [] } = useAdminStores();
  const { data: stats, isLoading: loadingStats } = useAdminStats();
  const { data: orders = [] } = useAdminOrders();
  const { data: conversations = [] } = useAdminConversations();
  const { data: products = [] } = useAdminProducts();
  const { data: connections = [] } = useAdminConnections();
  const updateStatus = useAdminUpdateUserStatus();

  if (loading) return <div className="p-6 flex items-center justify-center min-h-[50vh]"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (role !== 'admin') return <Navigate to="/dashboard" replace />;

  const pendingUsers = users.filter((u: any) => u.status === 'pending');
  const getStoreName = (userId: string) => stores.find((s: any) => s.user_id === userId)?.name || '—';
  const getStoreForId = (storeId: string) => stores.find((s: any) => s.id === storeId);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-heading font-bold text-foreground">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">Platform-wide management & monitoring</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-px border-b border-border scrollbar-none">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
              tab === key 
                ? 'border-primary text-foreground' 
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            <Icon className="h-4 w-4" />
            {label}
            {key === 'pending' && pendingUsers.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-warning/20 text-warning">{pendingUsers.length}</span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ═══════════ OVERVIEW ═══════════ */}
        {tab === 'overview' && (
          <motion.div key="overview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              {[
                { label: "Total Users", value: stats?.totalUsers || 0, icon: Users, color: "text-primary", sub: `${pendingUsers.length} pending` },
                { label: "Total Stores", value: stats?.totalStores || 0, icon: Store, color: "text-accent", sub: `${stats?.activeConnections || 0} connected` },
                { label: "Total Orders", value: stats?.totalOrders || 0, icon: ShoppingCart, color: "text-success", sub: `${stats?.todayOrders || 0} today` },
                { label: "Revenue", value: `$${(stats?.totalRevenue || 0).toLocaleString()}`, icon: TrendingUp, color: "text-warning", sub: `${stats?.pendingOrders || 0} pending` },
                { label: "Conversations", value: stats?.totalConversations || 0, icon: MessageSquare, color: "text-info", sub: "all platforms" },
                { label: "Products", value: stats?.totalProducts || 0, icon: Package, color: "text-primary", sub: "across stores" },
                { label: "Connections", value: stats?.activeConnections || 0, icon: Link2, color: "text-success", sub: `of ${stats?.totalConnections || 0} total` },
                { label: "Pending Orders", value: stats?.pendingOrders || 0, icon: Clock, color: "text-warning", sub: "need attention" },
              ].map(s => (
                <div key={s.label} className="glass rounded-xl p-4 md:p-5 group hover:border-primary/20 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <s.icon className={`h-4 w-4 ${s.color} opacity-60`} />
                  </div>
                  <p className="text-2xl md:text-3xl font-heading font-bold text-foreground">{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
                </div>
              ))}
            </div>

            {/* Quick panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Pending Approvals */}
              <div className="glass rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-heading font-semibold text-foreground">Pending Approvals</h3>
                  {pendingUsers.length > 0 && (
                    <button onClick={() => setTab('pending')} className="text-xs text-primary hover:underline flex items-center gap-1">
                      View all <ArrowUpRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {pendingUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No pending approvals ✓</p>
                ) : (
                  <div className="space-y-2">
                    {pendingUsers.slice(0, 4).map((u: any) => (
                      <div key={u.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{u.full_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                        <div className="flex gap-1.5 shrink-0 ml-2">
                          <button onClick={() => updateStatus.mutate({ userId: u.user_id, status: 'active' })}
                            className="p-1.5 rounded-lg bg-success/20 text-success hover:bg-success/30 transition-colors"><Check className="h-3.5 w-3.5" /></button>
                          <button onClick={() => updateStatus.mutate({ userId: u.user_id, status: 'suspended' })}
                            className="p-1.5 rounded-lg bg-destructive/20 text-destructive hover:bg-destructive/30 transition-colors"><XIcon className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Orders */}
              <div className="glass rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-heading font-semibold text-foreground">Recent Orders</h3>
                  <button onClick={() => setTab('orders')} className="text-xs text-primary hover:underline flex items-center gap-1">
                    View all <ArrowUpRight className="h-3 w-3" />
                  </button>
                </div>
                {orders.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No orders yet</p>
                ) : (
                  <div className="space-y-2">
                    {orders.slice(0, 4).map((o: any) => (
                      <div key={o.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{o.order_number || '—'}</p>
                          <p className="text-xs text-muted-foreground">{o.customer_name} · ${Number(o.total).toLocaleString()}</p>
                        </div>
                        <StatusBadge status={o.status} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══════════ ALL USERS ═══════════ */}
        {tab === 'users' && (
          <motion.div key="users" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {loadingUsers ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : (
              <div className="glass rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border text-left">
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Name</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden sm:table-cell">Email</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden lg:table-cell">Store</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">Role</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Status</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">Joined</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Actions</th>
                    </tr></thead>
                    <tbody>
                      {users.map((u: any) => {
                        const userRole = u.user_roles?.[0]?.role || u.user_roles?.role || '—';
                        return (
                          <tr key={u.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-medium text-foreground">{u.full_name}</p>
                              <p className="text-xs text-muted-foreground sm:hidden">{u.email}</p>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{u.email}</td>
                            <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{getStoreName(u.user_id)}</td>
                            <td className="px-4 py-3 hidden md:table-cell">
                              <span className="px-2 py-0.5 rounded-full text-xs bg-primary/20 text-primary">{userRole}</span>
                            </td>
                            <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                            <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell">
                              {format(new Date(u.created_at), 'MMM d, yyyy')}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1">
                                {u.status !== 'active' && (
                                  <button onClick={() => updateStatus.mutate({ userId: u.user_id, status: 'active' })}
                                    className="px-2 py-1 rounded-lg text-xs bg-success/20 text-success hover:bg-success/30 transition-colors">Approve</button>
                                )}
                                {u.status !== 'suspended' && (
                                  <button onClick={() => updateStatus.mutate({ userId: u.user_id, status: 'suspended' })}
                                    className="px-2 py-1 rounded-lg text-xs bg-destructive/20 text-destructive hover:bg-destructive/30 transition-colors">Suspend</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">
                  {users.length} user{users.length !== 1 ? 's' : ''} total
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ═══════════ PENDING ═══════════ */}
        {tab === 'pending' && (
          <motion.div key="pending" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {pendingUsers.length === 0 ? (
              <div className="glass rounded-xl p-12 text-center">
                <Check className="h-8 w-8 text-success mx-auto mb-3" />
                <p className="text-muted-foreground">No pending approvals</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {pendingUsers.map((u: any) => (
                  <div key={u.id} className="glass rounded-xl p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-heading font-semibold text-foreground">{u.full_name}</h3>
                        <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                        <p className="text-sm text-muted-foreground mt-1">Store: <span className="text-foreground">{getStoreName(u.user_id)}</span></p>
                        <p className="text-xs text-muted-foreground mt-1">Registered: {format(new Date(u.created_at), 'MMM d, yyyy')}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => updateStatus.mutate({ userId: u.user_id, status: 'active' })}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-success/20 text-success hover:bg-success/30 flex items-center gap-1 transition-colors">
                          <Check className="h-3 w-3" /> Approve
                        </button>
                        <button onClick={() => updateStatus.mutate({ userId: u.user_id, status: 'suspended' })}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-destructive/20 text-destructive hover:bg-destructive/30 flex items-center gap-1 transition-colors">
                          <XIcon className="h-3 w-3" /> Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ═══════════ STORES ═══════════ */}
        {tab === 'stores' && (
          <motion.div key="stores" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {stores.length === 0 ? (
              <div className="glass rounded-xl p-12 text-center text-muted-foreground">No stores registered yet</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {stores.map((s: any) => {
                  const owner = users.find((u: any) => u.user_id === s.user_id);
                  const storeConnections = connections.filter((c: any) => c.store_id === s.id);
                  const storeProducts = products.filter((p: any) => p.store_id === s.id);
                  const storeOrders = orders.filter((o: any) => o.store_id === s.id);
                  return (
                    <div key={s.id} className="glass rounded-xl p-5 hover:border-primary/20 transition-colors">
                      <div className="flex items-start gap-3 mb-3">
                        {s.logo_url ? (
                          <img src={s.logo_url} alt={s.name} className="h-10 w-10 rounded-lg object-cover" />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Store className="h-5 w-5 text-primary" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <h3 className="font-heading font-semibold text-foreground truncate">{s.name || 'Unnamed Store'}</h3>
                          <p className="text-xs text-muted-foreground truncate">{owner?.full_name || 'Unknown'} · {owner?.email || ''}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-muted/30 p-2">
                          <p className="text-lg font-bold text-foreground">{storeProducts.length}</p>
                          <p className="text-[10px] text-muted-foreground">Products</p>
                        </div>
                        <div className="rounded-lg bg-muted/30 p-2">
                          <p className="text-lg font-bold text-foreground">{storeOrders.length}</p>
                          <p className="text-[10px] text-muted-foreground">Orders</p>
                        </div>
                        <div className="rounded-lg bg-muted/30 p-2">
                          <p className="text-lg font-bold text-foreground">{storeConnections.filter((c: any) => c.status === 'connected').length}</p>
                          <p className="text-[10px] text-muted-foreground">Connected</p>
                        </div>
                      </div>
                      {storeConnections.length > 0 && (
                        <div className="flex gap-1.5 mt-3 flex-wrap">
                          {storeConnections.map((c: any) => (
                            <PlatformBadge key={c.id} platform={c.platform} />
                          ))}
                        </div>
                      )}
                      {owner && <StatusBadge status={owner.status} />}
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* ═══════════ ORDERS ═══════════ */}
        {tab === 'orders' && (
          <motion.div key="orders" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {orders.length === 0 ? (
              <div className="glass rounded-xl p-12 text-center text-muted-foreground">No orders yet</div>
            ) : (
              <div className="glass rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border text-left">
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Order #</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Customer</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">Store</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden sm:table-cell">Platform</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Total</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Status</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden lg:table-cell">Date</th>
                    </tr></thead>
                    <tbody>
                      {orders.map((o: any) => {
                        const orderStore = getStoreForId(o.store_id);
                        return (
                          <tr key={o.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3 font-mono text-xs text-foreground">{o.order_number || '—'}</td>
                            <td className="px-4 py-3">
                              <p className="text-foreground font-medium">{o.customer_name}</p>
                              {o.phone && <p className="text-xs text-muted-foreground">{o.phone}</p>}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell">{orderStore?.name || '—'}</td>
                            <td className="px-4 py-3 hidden sm:table-cell">
                              {o.platform ? <PlatformBadge platform={o.platform} /> : <span className="text-xs text-muted-foreground">—</span>}
                            </td>
                            <td className="px-4 py-3 font-medium text-foreground">${Number(o.total).toLocaleString()}</td>
                            <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                            <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                              {format(new Date(o.created_at), 'MMM d, HH:mm')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">
                  Showing {orders.length} order{orders.length !== 1 ? 's' : ''}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ═══════════ CONVERSATIONS ═══════════ */}
        {tab === 'conversations' && (
          <motion.div key="conversations" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {conversations.length === 0 ? (
              <div className="glass rounded-xl p-12 text-center text-muted-foreground">No conversations yet</div>
            ) : (
              <div className="glass rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border text-left">
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Customer</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">Store</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Platform</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden sm:table-cell">Last Message</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Status</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden lg:table-cell">Last Activity</th>
                    </tr></thead>
                    <tbody>
                      {conversations.map((c: any) => {
                        const convStore = getStoreForId(c.store_id);
                        return (
                          <tr key={c.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {c.unread && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                                <div>
                                  <p className="font-medium text-foreground">{c.customer_name || 'Unknown'}</p>
                                  {c.customer_phone && <p className="text-xs text-muted-foreground">{c.customer_phone}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell">{convStore?.name || '—'}</td>
                            <td className="px-4 py-3"><PlatformBadge platform={c.platform} /></td>
                            <td className="px-4 py-3 hidden sm:table-cell">
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">{c.last_message || '—'}</p>
                            </td>
                            <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                            <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                              {c.last_message_time ? format(new Date(c.last_message_time), 'MMM d, HH:mm') : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">
                  Showing {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
