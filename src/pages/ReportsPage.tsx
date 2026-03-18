import { Calendar, Download } from "lucide-react";
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { messagesOverTime, ordersPerDay, platformColors } from "@/data/mock-data";

const messagesByPlatform = [
  { name: 'WhatsApp', value: 212, color: platformColors.whatsapp },
  { name: 'Instagram', value: 117, color: platformColors.instagram },
  { name: 'Facebook', value: 71, color: platformColors.facebook },
];

const revenueData = [
  { date: 'Mar 12', revenue: 195 },
  { date: 'Mar 13', revenue: 356 },
  { date: 'Mar 14', revenue: 120 },
  { date: 'Mar 15', revenue: 510 },
  { date: 'Mar 16', revenue: 220 },
  { date: 'Mar 17', revenue: 400 },
  { date: 'Mar 18', revenue: 545 },
];

const topProducts = [
  { name: 'Classic White Sneakers', orders: 23, revenue: 2069.77 },
  { name: 'Midnight Bomber Jacket', orders: 18, revenue: 2699.82 },
  { name: 'Organic Cotton Tee', orders: 31, revenue: 1084.69 },
  { name: 'Aviator Sunglasses', orders: 15, revenue: 689.85 },
];

export default function ReportsPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Reports & Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Track your store's performance</p>
        </div>
        <div className="flex gap-2">
          <button className="glass-hover rounded-lg px-3 py-2 text-sm text-muted-foreground flex items-center gap-1.5"><Calendar className="h-4 w-4" /> Last 7 Days</button>
          <button className="glass-hover rounded-lg px-3 py-2 text-sm text-muted-foreground flex items-center gap-1.5"><Download className="h-4 w-4" /> Export</button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Avg Response Time', value: '4.2s' },
          { label: 'AI Resolution Rate', value: '87%' },
          { label: 'Conversion Rate', value: '23%' },
          { label: 'Total Revenue', value: '$2,346' },
        ].map(k => (
          <div key={k.label} className="glass rounded-xl p-4">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="text-2xl font-heading font-bold text-foreground mt-1">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Donut */}
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-heading font-semibold text-foreground mb-4">Messages by Platform</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={messagesByPlatform} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" stroke="none">
                {messagesByPlatform.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ background: 'hsl(222 41% 8%)', border: '1px solid hsl(222 20% 16%)', borderRadius: '8px', color: '#fff' }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 mt-2">
            {messagesByPlatform.map(m => (
              <div key={m.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: m.color }} />
                {m.name}
              </div>
            ))}
          </div>
        </div>

        {/* Revenue Line */}
        <div className="glass rounded-xl p-5 lg:col-span-2">
          <h3 className="text-sm font-heading font-semibold text-foreground mb-4">Revenue Over Time</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 20% 16%)" />
              <XAxis dataKey="date" tick={{ fill: '#94A3B8', fontSize: 12 }} axisLine={false} />
              <YAxis tick={{ fill: '#94A3B8', fontSize: 12 }} axisLine={false} />
              <Tooltip contentStyle={{ background: 'hsl(222 41% 8%)', border: '1px solid hsl(222 20% 16%)', borderRadius: '8px', color: '#fff' }} />
              <Line type="monotone" dataKey="revenue" stroke="hsl(199 89% 42%)" strokeWidth={2} dot={{ fill: 'hsl(199 89% 42%)' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Products */}
      <div className="glass rounded-xl p-5">
        <h3 className="text-sm font-heading font-semibold text-foreground mb-4">Top Products (AI Orders)</h3>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left">
            <th className="pb-2 text-xs text-muted-foreground">Product</th>
            <th className="pb-2 text-xs text-muted-foreground">Orders</th>
            <th className="pb-2 text-xs text-muted-foreground">Revenue</th>
          </tr></thead>
          <tbody>
            {topProducts.map(p => (
              <tr key={p.name} className="border-b border-border/50">
                <td className="py-2.5 text-foreground">{p.name}</td>
                <td className="py-2.5 text-muted-foreground">{p.orders}</td>
                <td className="py-2.5 text-foreground font-medium">${p.revenue.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
