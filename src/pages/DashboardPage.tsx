import { MessageSquare, ShoppingCart, Clock, DollarSign, Facebook, Instagram, MessageCircle } from "lucide-react";
import { motion } from "framer-motion";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { messagesOverTime, ordersPerDay, orders, conversations, notifications, platformColors } from "@/data/mock-data";

const metrics = [
  { label: "Messages Today", value: "59", change: "+12%", icon: MessageSquare, color: "text-primary" },
  { label: "New Orders", value: "8", change: "+23%", icon: ShoppingCart, color: "text-success" },
  { label: "Pending Orders", value: "3", change: "-2", icon: Clock, color: "text-warning" },
  { label: "Revenue (Month)", value: "$1,296", change: "+18%", icon: DollarSign, color: "text-accent" },
];

const platformStatus = [
  { name: "Facebook", connected: true, icon: Facebook, color: platformColors.facebook },
  { name: "Instagram", connected: true, icon: Instagram, color: platformColors.instagram },
  { name: "WhatsApp", connected: true, icon: MessageCircle, color: platformColors.whatsapp },
];

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

export default function DashboardPage() {
  const recentActivity = [
    ...orders.slice(0, 4).map(o => ({ type: 'order' as const, text: `${o.customerName} placed order ${o.id}`, time: o.createdAt, platform: o.platform })),
    ...conversations.filter(c => c.unread).map(c => ({ type: 'message' as const, text: `${c.customerName}: "${c.lastMessage}"`, time: c.lastMessageTime, platform: c.platform })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 6);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Welcome back, Youssef. Here's what's happening.</p>
      </div>

      {/* Metric Cards */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.08 } } }}
      >
        {metrics.map((m) => (
          <motion.div key={m.label} variants={item} className="glass rounded-xl p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{m.label}</p>
              <m.icon className={`h-5 w-5 ${m.color}`} />
            </div>
            <p className="text-3xl font-heading font-bold text-foreground mt-2">{m.value}</p>
            <p className="text-xs text-success mt-1">{m.change} from last period</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Platform Status */}
      <div className="flex flex-wrap gap-3">
        {platformStatus.map((p) => (
          <div key={p.name} className="glass rounded-lg px-4 py-2.5 flex items-center gap-2">
            <p.icon className="h-4 w-4" style={{ color: p.color }} />
            <span className="text-sm text-foreground">{p.name}</span>
            <span className="flex h-2 w-2 rounded-full bg-success" />
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-heading font-semibold text-foreground mb-4">Messages Over Time</h3>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={messagesOverTime}>
              <defs>
                <linearGradient id="colorFb" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={platformColors.facebook} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={platformColors.facebook} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorIg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={platformColors.instagram} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={platformColors.instagram} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorWa" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={platformColors.whatsapp} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={platformColors.whatsapp} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 20% 16%)" />
              <XAxis dataKey="date" tick={{ fill: '#94A3B8', fontSize: 12 }} axisLine={false} />
              <YAxis tick={{ fill: '#94A3B8', fontSize: 12 }} axisLine={false} />
              <Tooltip contentStyle={{ background: 'hsl(222 41% 8%)', border: '1px solid hsl(222 20% 16%)', borderRadius: '8px', color: '#fff' }} />
              <Area type="monotone" dataKey="whatsapp" stroke={platformColors.whatsapp} fillOpacity={1} fill="url(#colorWa)" />
              <Area type="monotone" dataKey="instagram" stroke={platformColors.instagram} fillOpacity={1} fill="url(#colorIg)" />
              <Area type="monotone" dataKey="facebook" stroke={platformColors.facebook} fillOpacity={1} fill="url(#colorFb)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-heading font-semibold text-foreground mb-4">Orders Per Day</h3>
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
      </div>

      {/* Activity Feed */}
      <div className="glass rounded-xl p-5">
        <h3 className="text-sm font-heading font-semibold text-foreground mb-4">Recent Activity</h3>
        <div className="space-y-3">
          {recentActivity.map((a, i) => (
            <div key={i} className="flex items-start gap-3 text-sm">
              <div
                className="mt-1 h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: platformColors[a.platform] }}
              />
              <p className="text-muted-foreground flex-1">{a.text}</p>
              <span className="text-xs text-muted-foreground/60 shrink-0">
                {new Date(a.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
