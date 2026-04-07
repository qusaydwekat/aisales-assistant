import { useState } from "react";
import { Calendar, Download, Loader2, TrendingUp, Clock, Target, BarChart3 } from "lucide-react";
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, AreaChart, Area } from "recharts";
import { useOrders, useConversations, useProducts } from "@/hooks/useSupabaseData";
import { useLanguage } from "@/contexts/LanguageContext";
import { platformColors } from "@/data/mock-data";

type Platform = "facebook" | "instagram" | "whatsapp";
type DateRange = "7d" | "30d" | "90d";

export default function ReportsPage() {
  const [range, setRange] = useState<DateRange>("30d");
  const { data: orders = [], isLoading: loadingOrders } = useOrders();
  const { data: conversations = [], isLoading: loadingConvos } = useConversations();
  const { data: products = [] } = useProducts();
  const { t, dir } = useLanguage();

  const isLoading = loadingOrders || loadingConvos;

  const daysBack = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);

  const filteredOrders = orders.filter(o => new Date(o.created_at) >= cutoff);
  const filteredConvos = conversations.filter(c => new Date(c.created_at) >= cutoff);

  // Messages by platform
  const msgByPlatform: Record<string, number> = {};
  filteredConvos.forEach(c => { msgByPlatform[c.platform] = (msgByPlatform[c.platform] || 0) + 1; });
  const messagesByPlatform = Object.entries(msgByPlatform).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1), value, color: platformColors[name as Platform] || '#888',
  }));

  // Revenue over time (grouped by day)
  const revByDate: Record<string, number> = {};
  filteredOrders.forEach(o => {
    const d = new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    revByDate[d] = (revByDate[d] || 0) + Number(o.total);
  });
  const revenueData = Object.entries(revByDate).map(([date, revenue]) => ({ date, revenue }));

  // Orders by status (funnel)
  const statusCounts: Record<string, number> = {};
  filteredOrders.forEach(o => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1; });
  const statusData = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'].map(s => ({
    status: s.charAt(0).toUpperCase() + s.slice(1),
    count: statusCounts[s] || 0,
  }));

  // Platform performance comparison
  const platformPerf: Record<string, { conversations: number; orders: number; revenue: number }> = {};
  filteredConvos.forEach(c => {
    if (!platformPerf[c.platform]) platformPerf[c.platform] = { conversations: 0, orders: 0, revenue: 0 };
    platformPerf[c.platform].conversations++;
  });
  filteredOrders.forEach(o => {
    if (o.platform && platformPerf[o.platform]) {
      platformPerf[o.platform].orders++;
      platformPerf[o.platform].revenue += Number(o.total);
    }
  });
  const platformComparison = Object.entries(platformPerf).map(([platform, data]) => ({
    platform: platform.charAt(0).toUpperCase() + platform.slice(1),
    ...data,
    conversionRate: data.conversations > 0 ? Math.round((data.orders / data.conversations) * 100) : 0,
  }));

  // KPIs
  const totalRevenue = filteredOrders.reduce((s, o) => s + Number(o.total), 0);
  const avgOrderValue = filteredOrders.length > 0 ? totalRevenue / filteredOrders.length : 0;
  const conversionRate = filteredConvos.length > 0 ? Math.round((filteredOrders.length / filteredConvos.length) * 100) : 0;
  const resolvedRate = filteredConvos.length > 0 ? Math.round((filteredConvos.filter(c => c.status === 'resolved').length / filteredConvos.length) * 100) : 0;

  // Top products
  const productSales: Record<string, { name: string; orders: number; revenue: number }> = {};
  filteredOrders.forEach(o => {
    const items = Array.isArray(o.items) ? o.items : [];
    items.forEach((item: any) => {
      const key = item.name || 'Unknown';
      if (!productSales[key]) productSales[key] = { name: key, orders: 0, revenue: 0 };
      productSales[key].orders += item.quantity || 1;
      productSales[key].revenue += (item.price || 0) * (item.quantity || 1);
    });
  });
  const topProducts = Object.values(productSales).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  const handleExport = () => {
    const rows = ["Date,Customer,Status,Total,Platform", ...filteredOrders.map(o => 
      `${new Date(o.created_at).toLocaleDateString()},${o.customer_name},${o.status},${o.total},${o.platform || ''}`
    )];
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `report-${range}.csv`; a.click();
  };

  const tooltipStyle = { background: 'hsl(222 41% 8%)', border: '1px solid hsl(222 20% 16%)', borderRadius: '8px', color: '#fff' };

  if (isLoading) return <div className="p-6 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24 md:pb-6" dir={dir}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">{t("reports")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("track_performance")}</p>
        </div>
        <div className="flex gap-2">
          {(["7d", "30d", "90d"] as const).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${range === r ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
              {r === "7d" ? t("seven_days") : r === "30d" ? t("thirty_days") : t("ninety_days")}
            </button>
          ))}
          <button onClick={handleExport} className="glass-hover rounded-lg px-3 py-1.5 text-xs text-muted-foreground flex items-center gap-1.5"><Download className="h-3.5 w-3.5" /> {t("export")}</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: t("conversations_label"), value: String(filteredConvos.length), icon: BarChart3, color: 'text-primary' },
          { label: t("orders"), value: String(filteredOrders.length), icon: Target, color: 'text-success' },
          { label: t("conversion_rate"), value: `${conversionRate}%`, icon: TrendingUp, color: 'text-accent' },
          { label: t("avg_order_value"), value: `$${avgOrderValue.toFixed(0)}`, icon: Clock, color: 'text-warning' },
        ].map(k => (
          <div key={k.label} className="glass rounded-xl p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <k.icon className={`h-4 w-4 ${k.color}`} />
            </div>
            <p className="text-2xl font-heading font-bold text-foreground mt-1">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Revenue + Platform Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {messagesByPlatform.length > 0 && (
          <div className="glass rounded-xl p-5">
            <h3 className="text-sm font-heading font-semibold text-foreground mb-4">{t("by_platform")}</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={messagesByPlatform} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" stroke="none">
                  {messagesByPlatform.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
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
            <h3 className="text-sm font-heading font-semibold text-foreground mb-4">{t("revenue_over_time")}</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(199 89% 42%)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(199 89% 42%)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 20% 16%)" />
                <XAxis dataKey="date" tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} />
                <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="revenue" stroke="hsl(199 89% 42%)" fill="url(#revenueGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Order Funnel + Platform Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {statusData.some(s => s.count > 0) && (
          <div className="glass rounded-xl p-5">
            <h3 className="text-sm font-heading font-semibold text-foreground mb-4">{t("order_status_funnel")}</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={statusData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 20% 16%)" />
                <XAxis type="number" tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} />
                <YAxis dataKey="status" type="category" tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} width={80} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="hsl(217 91% 53%)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {platformComparison.length > 0 && (
          <div className="glass rounded-xl p-5">
            <h3 className="text-sm font-heading font-semibold text-foreground mb-4">{t("platform_performance")}</h3>
            <div className="space-y-4">
              {platformComparison.map(p => (
                <div key={p.platform} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground font-medium">{p.platform}</span>
                    <span className="text-muted-foreground">{p.conversionRate}% {t("conv_abbr")}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(p.conversionRate, 100)}%`, backgroundColor: platformColors[p.platform.toLowerCase() as Platform] || '#888' }} />
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>{p.conversations} {t("convos_label")}</span>
                    <span>{p.orders} {t("orders_label")}</span>
                    <span>${p.revenue.toFixed(0)} {t("revenue_label")}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Top Products */}
      {topProducts.length > 0 && (
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-heading font-semibold text-foreground mb-4">{t("top_products")}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-start">
                <th className="pb-2 text-xs text-muted-foreground text-start">{t("product_col")}</th>
                <th className="pb-2 text-xs text-muted-foreground text-start">{t("sold_col")}</th>
                <th className="pb-2 text-xs text-muted-foreground text-start">{t("revenue_col")}</th>
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
      )}

      {filteredOrders.length === 0 && filteredConvos.length === 0 && (
        <div className="glass rounded-xl p-12 text-center text-muted-foreground">
          {t("no_data_period")}
        </div>
      )}
    </div>
  );
}
