import { useState, useEffect } from "react";
import { Store, Clock, Truck, RotateCcw, Loader2 } from "lucide-react";
import { useStore, useUpdateStore } from "@/hooks/useSupabaseData";
import { toast } from "sonner";

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface WorkingHours {
  [day: string]: { open: boolean; from: string; to: string };
}

export default function StoreSettingsPage() {
  const { data: store, isLoading } = useStore();
  const updateStore = useUpdateStore();

  const [form, setForm] = useState({
    name: '', description: '', category: '', address: '', phone: '', email: '',
    delivery_info: '', return_policy: '',
  });
  const [hours, setHours] = useState<WorkingHours>({});

  useEffect(() => {
    if (store) {
      setForm({
        name: store.name || '', description: store.description || '', category: store.category || '',
        address: store.address || '', phone: store.phone || '', email: store.email || '',
        delivery_info: store.delivery_info || '', return_policy: store.return_policy || '',
      });
      setHours((store.working_hours as WorkingHours) || days.reduce((acc, d) => ({ ...acc, [d]: { open: d !== 'Friday', from: '09:00', to: '18:00' } }), {}));
    }
  }, [store]);

  const handleSave = async () => {
    if (!store) return;
    await updateStore.mutateAsync({ id: store.id, ...form, working_hours: hours });
  };

  if (isLoading) return <div className="p-6 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Store Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your store information</p>
      </div>

      <div className="glass rounded-xl p-6 space-y-4">
        <h2 className="font-heading font-semibold text-foreground flex items-center gap-2"><Store className="h-4 w-4 text-primary" /> Store Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className="text-xs text-muted-foreground">Store Name</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" /></div>
          <div><label className="text-xs text-muted-foreground">Category</label><input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" /></div>
        </div>
        <div><label className="text-xs text-muted-foreground">Description</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary resize-none" /></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className="text-xs text-muted-foreground">Phone</label><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" /></div>
          <div><label className="text-xs text-muted-foreground">Email</label><input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" /></div>
        </div>
        <div><label className="text-xs text-muted-foreground">Address</label><input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" /></div>
      </div>

      <div className="glass rounded-xl p-6 space-y-4">
        <h2 className="font-heading font-semibold text-foreground flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Business Hours</h2>
        <div className="space-y-2">
          {days.map(day => {
            const h = hours[day] || { open: true, from: '09:00', to: '18:00' };
            return (
              <div key={day} className="flex items-center gap-3">
                <label className="w-28 text-sm text-foreground">{day}</label>
                <input type="checkbox" checked={h.open} onChange={e => setHours(prev => ({ ...prev, [day]: { ...h, open: e.target.checked } }))} className="accent-primary" />
                <input type="time" value={h.from} onChange={e => setHours(prev => ({ ...prev, [day]: { ...h, from: e.target.value } }))} disabled={!h.open} className="rounded bg-muted px-2 py-1 text-sm text-foreground outline-none disabled:opacity-40" />
                <span className="text-muted-foreground text-sm">to</span>
                <input type="time" value={h.to} onChange={e => setHours(prev => ({ ...prev, [day]: { ...h, to: e.target.value } }))} disabled={!h.open} className="rounded bg-muted px-2 py-1 text-sm text-foreground outline-none disabled:opacity-40" />
              </div>
            );
          })}
        </div>
      </div>

      <div className="glass rounded-xl p-6 space-y-4">
        <h2 className="font-heading font-semibold text-foreground flex items-center gap-2"><Truck className="h-4 w-4 text-primary" /> Delivery Information</h2>
        <textarea value={form.delivery_info} onChange={e => setForm(f => ({ ...f, delivery_info: e.target.value }))} rows={3} className="w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary resize-none" />
      </div>

      <div className="glass rounded-xl p-6 space-y-4">
        <h2 className="font-heading font-semibold text-foreground flex items-center gap-2"><RotateCcw className="h-4 w-4 text-primary" /> Return Policy</h2>
        <textarea value={form.return_policy} onChange={e => setForm(f => ({ ...f, return_policy: e.target.value }))} rows={3} className="w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary resize-none" />
      </div>

      <button onClick={handleSave} disabled={updateStore.isPending}
        className="rounded-lg px-6 py-2.5 bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
        {updateStore.isPending ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  );
}
