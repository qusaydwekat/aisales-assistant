import { useState } from "react";
import { Users, ShoppingCart, MessageSquare, Package, Check, X as XIcon, Pause, Loader2, Shield, BarChart3, Bell } from "lucide-react";
import { motion } from "framer-motion";
import { useAdminUsers, useAdminStats, useAdminUpdateUserStatus, useAdminStores } from "@/hooks/useSupabaseData";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

type Tab = 'overview' | 'users' | 'pending';

export default function AdminPage() {
  const { role, loading } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const { data: users = [], isLoading: loadingUsers } = useAdminUsers();
  const { data: stores = [] } = useAdminStores();
  const { data: stats, isLoading: loadingStats } = useAdminStats();
  const updateStatus = useAdminUpdateUserStatus();

  if (loading) return <div className="p-6 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (role !== 'admin') return <Navigate to="/dashboard" replace />;

  const pendingUsers = users.filter((u: any) => u.status === 'pending');
  const getStoreName = (userId: string) => stores.find((s: any) => s.user_id === userId)?.name || '—';

  const statCards = [
    { label: "Total Users", value: stats?.totalUsers || 0, icon: Users, color: "text-primary" },
    { label: "Total Orders", value: stats?.totalOrders || 0, icon: ShoppingCart, color: "text-success" },
    { label: "Conversations", value: stats?.totalConversations || 0, icon: MessageSquare, color: "text-accent" },
    { label: "Total Revenue", value: `$${(stats?.totalRevenue || 0).toLocaleString()}`, icon: BarChart3, color: "text-warning" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Super Admin</h1>
          <p className="text-sm text-muted-foreground">Platform-wide management</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border pb-px">
        {([['overview', 'Overview'], ['users', 'All Users'], ['pending', `Pending (${pendingUsers.length})`]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map(s => (
              <div key={s.label} className="glass rounded-xl p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
                <p className="text-3xl font-heading font-bold text-foreground mt-2">{s.value}</p>
              </div>
            ))}
          </div>

          {pendingUsers.length > 0 && (
            <div className="glass rounded-xl p-5">
              <h3 className="text-sm font-heading font-semibold text-foreground mb-3">Pending Approvals</h3>
              <div className="space-y-2">
                {pendingUsers.slice(0, 5).map((u: any) => (
                  <div key={u.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <div>
                      <p className="text-sm font-medium text-foreground">{u.full_name}</p>
                      <p className="text-xs text-muted-foreground">{u.email} · Store: {getStoreName(u.user_id)}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => updateStatus.mutate({ userId: u.user_id, status: 'active' })}
                        className="p-1.5 rounded-lg bg-success/20 text-success hover:bg-success/30"><Check className="h-4 w-4" /></button>
                      <button onClick={() => updateStatus.mutate({ userId: u.user_id, status: 'suspended' })}
                        className="p-1.5 rounded-lg bg-destructive/20 text-destructive hover:bg-destructive/30"><XIcon className="h-4 w-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* All Users */}
      {tab === 'users' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {loadingUsers ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <div className="glass rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-left">
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Name</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Email</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">Store</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden sm:table-cell">Role</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Status</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Actions</th>
                </tr></thead>
                <tbody>
                  {users.map((u: any) => {
                    const userRole = u.user_roles?.[0]?.role || u.user_roles?.role || '—';
                    return (
                      <tr key={u.id} className="border-b border-border/50">
                        <td className="px-4 py-3 text-foreground font-medium">{u.full_name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                        <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{getStoreName(u.user_id)}</td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className="px-2 py-0.5 rounded text-xs bg-primary/20 text-primary">{userRole}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            u.status === 'active' ? 'bg-success/20 text-success' :
                            u.status === 'pending' ? 'bg-warning/20 text-warning' :
                            'bg-destructive/20 text-destructive'
                          }`}>{u.status}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {u.status !== 'active' && (
                              <button onClick={() => updateStatus.mutate({ userId: u.user_id, status: 'active' })}
                                className="px-2 py-1 rounded text-xs bg-success/20 text-success hover:bg-success/30">Approve</button>
                            )}
                            {u.status !== 'suspended' && (
                              <button onClick={() => updateStatus.mutate({ userId: u.user_id, status: 'suspended' })}
                                className="px-2 py-1 rounded text-xs bg-destructive/20 text-destructive hover:bg-destructive/30">Suspend</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}

      {/* Pending Approvals */}
      {tab === 'pending' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {pendingUsers.length === 0 ? (
            <div className="glass rounded-xl p-12 text-center text-muted-foreground">No pending approvals.</div>
          ) : (
            <div className="space-y-3">
              {pendingUsers.map((u: any) => (
                <div key={u.id} className="glass rounded-xl p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-heading font-semibold text-foreground">{u.full_name}</h3>
                      <p className="text-sm text-muted-foreground">{u.email}</p>
                      <p className="text-sm text-muted-foreground mt-1">Store: <span className="text-foreground">{getStoreName(u.user_id)}</span></p>
                      <p className="text-xs text-muted-foreground mt-1">Registered: {new Date(u.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => updateStatus.mutate({ userId: u.user_id, status: 'active' })}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-success/20 text-success hover:bg-success/30 flex items-center gap-1">
                        <Check className="h-3 w-3" /> Approve
                      </button>
                      <button onClick={() => updateStatus.mutate({ userId: u.user_id, status: 'suspended' })}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-destructive/20 text-destructive hover:bg-destructive/30 flex items-center gap-1">
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
    </div>
  );
}
