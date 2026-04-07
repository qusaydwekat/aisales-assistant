import { MessageSquare, ShoppingCart, Clock, DollarSign, Facebook, Instagram, MessageCircle, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useDashboardStats, useConversations, useOrders } from "@/hooks/useSupabaseData";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { platformColors } from "@/data/mock-data";

type Platform = "facebook" | "instagram" | "whatsapp";
const platformIcons: Record<Platform, typeof Facebook> = { facebook: Facebook, instagram: Instagram, whatsapp: MessageCircle };

const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } };

export default function DashboardPage() {
  const { profile } = useAuth();
  const { t, dir } = useLanguage();
  const { data: stats, isLoading } = useDashboardStats();
  const { data: conversations = [] } = useConversations();
  const { data: orders = [] } = useOrders();

  const metrics = [
    { label: t("messages_today"), value: String(stats?.messagesToday || 0), icon: MessageSquare, color: "text-primary" },
    { label: t("new_orders"), value: String(stats?.newOrders || 0), icon: ShoppingCart, color: "text-success" },
    { label: t("pending_orders"), value: String(stats?.pendingOrders || 0), icon: Clock, color: "text-warning" },
    { label: t("revenue_month"), value: `$${(stats?.monthRevenue || 0).toLocaleString()}`, icon: DollarSign, color: "text-accent" },
  ];

  const platformStatus = (stats?.platforms || []).map((p: any) => ({
    name: p.platform?.charAt(0).toUpperCase() + p.platform?.slice(1),
    connected: p.status === 'connected',
    icon: platformIcons[p.platform as Platform] || MessageCircle,
    color: platformColors[p.platform as Platform] || '#888',
  }));

  // Build recent activity from real data
  const recentActivity = [
    ...orders.slice(0, 4).map(o => ({ type: 'order' as const, text: `${o.customer_name} placed order ${o.order_number}`, time: o.created_at, platform: o.platform as Platform })),
    ...conversations.filter(c => c.unread).slice(0, 4).map(c => ({ type: 'message' as const, text: `${c.customer_name}: "${c.last_message}"`, time: c.last_message_time || c.created_at, platform: c.platform as Platform })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 6);

  // Build chart data from orders
  const ordersByDay: Record<string, number> = {};
  orders.forEach(o => {
    const d = new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    ordersByDay[d] = (ordersByDay[d] || 0) + 1;
  });
  const ordersPerDay = Object.entries(ordersByDay).map(([date, count]) => ({ date, orders: count })).slice(-7);

  if (isLoading) return <div className="p-6 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 pb-20 md:pb-6" dir={dir}>
      <div>
        <h1 className="text-xl md:text-2xl font-heading font-bold text-foreground">{t("dashboard")}</h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">{t("welcome_back")}, {profile?.full_name || 'there'}. {t("here_whats_happening")}</p>
      </div>

      <motion.div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4"
        initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.08 } } }}>
        {metrics.map(m => (
          <motion.div key={m.label} variants={item} className="glass rounded-xl p-3 md:p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs md:text-sm text-muted-foreground">{m.label}</p>
              <m.icon className={`h-4 w-4 md:h-5 md:w-5 ${m.color}`} />
            </div>
            <p className="text-xl md:text-3xl font-heading font-bold text-foreground mt-1 md:mt-2">{m.value}</p>
          </motion.div>
        ))}
      </motion.div>

      {platformStatus.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {platformStatus.map((p: any) => (
            <div key={p.name} className="glass rounded-lg px-4 py-2.5 flex items-center gap-2">
              <p.icon className="h-4 w-4" style={{ color: p.color }} />
              <span className="text-sm text-foreground">{p.name}</span>
              <span className={`flex h-2 w-2 rounded-full ${p.connected ? 'bg-success' : 'bg-muted-foreground'}`} />
            </div>
          ))}
        </div>
      )}

      {ordersPerDay.length > 0 && (
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-heading font-semibold text-foreground mb-4">{t("orders_per_day")}</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={ordersPerDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 20% 16%)" />
              <XAxis dataKey="date" tick={{ fill: '#94A3B8', fontSize: 12 }} axisLine={false} />
              <YAxis tick={{ fill: '#94A3B8', fontSize: 12 }} axisLine={false} />
              <Tooltip contentStyle={{ background: 'hsl(222 41% 8%)', border: '1px solid hsl(222 20% 16%)', borderRadius: '8px', color: '#fff' }} />
              <Bar dataKey="orders" fill="hsl(217 91% 53%)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {recentActivity.length > 0 && (
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-heading font-semibold text-foreground mb-4">{t("recent_activity")}</h3>
          <div className="space-y-3">
            {recentActivity.map((a, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <div className="mt-1 h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: a.platform ? platformColors[a.platform] : '#888' }} />
                <p className="text-muted-foreground flex-1">{a.text}</p>
                <span className="text-xs text-muted-foreground/60 shrink-0">
                  {new Date(a.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {recentActivity.length === 0 && orders.length === 0 && (
        <div className="glass rounded-xl p-12 text-center text-muted-foreground">
          {t("no_activity_yet")}
        </div>
      )}
    </div>
  );
}
