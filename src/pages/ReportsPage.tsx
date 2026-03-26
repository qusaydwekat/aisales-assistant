import { Calendar, Download, Loader2 } from "lucide-react";
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { useOrders, useConversations, useProducts } from "@/hooks/useSupabaseData";
import { platformColors } from "@/data/mock-data";

type Platform = "facebook" | "instagram" | "whatsapp";

export default function ReportsPage() {
  const { data: orders = [], isLoading: loadingOrders } = useOrders();
  const { data: conversations = [], isLoading: loadingConvos } = useConversations();
  const { data: products = [] } = useProducts();

  const isLoading = loadingOrders || loadingConvos;

  // Messages by platform
  const msgByPlatform: Record<string, number> = {};
  conversations.forEach(c => { msgByPlatform[c.platform] = (msgByPlatform[c.platform] || 0) + 1; });
  const messagesByPlatform = Object.entries(msgByPlatform).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1), value, color: platformColors[name as Platform] || '#888',
  }));

  // Revenue over time
  const revByDate: Record<string, number> = {};
  orders.forEach(o => {
    const d = new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    revByDate[d] = (revByDate[d] || 0) + Number(o.total);
  });
  const revenueData = Object.entries(revByDate).map(([date, revenue]) => ({ date, revenue })).slice(-7);

  // KPIs
  const totalRevenue = orders.reduce((s, o) => s + Number(o.total), 0);
  const deliveredCount = orders.filter(o => o.status === 'delivered').length;
  const conversionRate = conversations.length > 0 ? Math.round((orders.length / conversations.length) * 100) : 0;

  // Top products (from order items)
  const productSales: Record<string, { name: string; orders: number; revenue: number }> = {};
  orders.forEach(o => {
    const items = Array.isArray(o.items) ? o.items : [];
    items.forEach((item: any) => {
      const key = item.name || item.product_id || 'Unknown';
      if (!productSales[key]) productSales[key] = { name: key, orders: 0, revenue: 0 };
      productSales[key].orders += item.quantity || 1;
      productSales[key].revenue += (item.price || 0) * (item.quantity || 1);
    });
  });
  const topProducts = Object.values(productSales).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  const handleExport = () => {
    const csv = ["Date,Revenue", ...revenueData.map(r => `${r.date},${r.revenue}`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "report.csv"; a.click();
  };

  if (isLoading) return <div className="p-6 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Reports & Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Track your store's performance</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="glass-hover rounded-lg px-3 py-2 text-sm text-muted-foreground flex items-center gap-1.5"><Download className="h-4 w-4" /> Export</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Conversations', value: String(conversations.length) },
          { label: 'Total Orders', value: String(orders.length) },
          { label: 'Conversion Rate', value: `${conversionRate}%` },
          { label: 'Total Revenue', value: `$${totalRevenue.toLocaleString()}` },
        ].map(k => (
          <div key={k.label} className="glass rounded-xl p-4">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="text-2xl font-heading font-bold text-foreground mt-1">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {messagesByPlatform.length > 0 && (
          <div className="glass rounded-xl p-5">
            <h3 className="text-sm font-heading font-semibold text-foreground mb-4">Conversations by Platform</h3>
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
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: m.color }} /> {m.name}
                </div>
              ))}
            </div>
          </div>
        )}

        {revenueData.length > 0 && (
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
        )}
      </div>

      {topProducts.length > 0 && (
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-heading font-semibold text-foreground mb-4">Top Products</h3>
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
      )}

      {orders.length === 0 && conversations.length === 0 && (
        <div className="glass rounded-xl p-12 text-center text-muted-foreground">
          No data yet. Reports will populate as you receive orders and conversations.
        </div>
      )}
    </div>
  );
}
