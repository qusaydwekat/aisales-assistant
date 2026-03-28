import { useState, useEffect } from "react";
import { Store, Clock, Truck, RotateCcw, Loader2, Upload, Image as ImageIcon } from "lucide-react";
import { useStore, useUpdateStore } from "@/hooks/useSupabaseData";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface WorkingHours {
  [day: string]: { open: boolean; from: string; to: string };
}

export default function StoreSettingsPage() {
  const { data: store, isLoading } = useStore();
  const updateStore = useUpdateStore();
  const { upload, uploading } = useFileUpload();
  const { t, dir } = useLanguage();

  const [form, setForm] = useState({
    name: '', description: '', category: '', address: '', phone: '', email: '',
    delivery_info: '', return_policy: '', logo_url: '', cover_image_url: '',
  });
  const [hours, setHours] = useState<WorkingHours>({});

  useEffect(() => {
    if (store) {
      setForm({
        name: store.name || '', description: store.description || '', category: store.category || '',
        address: store.address || '', phone: store.phone || '', email: store.email || '',
        delivery_info: store.delivery_info || '', return_policy: store.return_policy || '',
        logo_url: store.logo_url || '', cover_image_url: store.cover_image_url || '',
      });
      setHours((store.working_hours as WorkingHours) || days.reduce((acc, d) => ({ ...acc, [d]: { open: d !== 'Friday', from: '09:00', to: '18:00' } }), {}));
    }
  }, [store]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await upload(file, "logos");
    if (url) setForm(f => ({ ...f, logo_url: url }));
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await upload(file, "covers");
    if (url) setForm(f => ({ ...f, cover_image_url: url }));
  };

  const handleSave = async () => {
    if (!store) return;
    await updateStore.mutateAsync({ id: store.id, ...form, working_hours: hours });
  };

  if (isLoading) return <div className="p-6 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-3xl pb-20 md:pb-6" dir={dir}>
      <div>
        <h1 className="text-xl md:text-2xl font-heading font-bold text-foreground">{t("store_settings")}</h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">Manage your store information</p>
      </div>

      {/* Logo & Cover */}
      <div className="glass rounded-xl p-6 space-y-4">
        <h2 className="font-heading font-semibold text-foreground flex items-center gap-2"><ImageIcon className="h-4 w-4 text-primary" /> Branding</h2>
        <div className="flex gap-6 flex-wrap">
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-2">Logo</p>
            <label className="relative cursor-pointer group">
              <div className="h-24 w-24 rounded-xl border-2 border-dashed border-border hover:border-primary/50 flex items-center justify-center overflow-hidden transition-colors">
                {form.logo_url ? (
                  <img src={form.logo_url} alt="Logo" className="h-full w-full object-cover" />
                ) : (
                  <Upload className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={uploading} />
            </label>
          </div>
          <div className="flex-1 min-w-[200px]">
            <p className="text-xs text-muted-foreground mb-2">Cover Image</p>
            <label className="relative cursor-pointer group block">
              <div className="h-24 w-full rounded-xl border-2 border-dashed border-border hover:border-primary/50 flex items-center justify-center overflow-hidden transition-colors">
                {form.cover_image_url ? (
                  <img src={form.cover_image_url} alt="Cover" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center">
                    <Upload className="h-6 w-6 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground mt-1">Upload cover</span>
                  </div>
                )}
              </div>
              <input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" disabled={uploading} />
            </label>
          </div>
        </div>
      </div>

      <div className="glass rounded-xl p-6 space-y-4">
        <h2 className="font-heading font-semibold text-foreground flex items-center gap-2"><Store className="h-4 w-4 text-primary" /> {t("store_information")}</h2>
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
        <h2 className="font-heading font-semibold text-foreground flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> {t("business_hours")}</h2>
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
        <h2 className="font-heading font-semibold text-foreground flex items-center gap-2"><Truck className="h-4 w-4 text-primary" /> {t("delivery_information")}</h2>
        <textarea value={form.delivery_info} onChange={e => setForm(f => ({ ...f, delivery_info: e.target.value }))} rows={3} className="w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary resize-none" />
      </div>

      <div className="glass rounded-xl p-6 space-y-4">
        <h2 className="font-heading font-semibold text-foreground flex items-center gap-2"><RotateCcw className="h-4 w-4 text-primary" /> {t("return_policy")}</h2>
        <textarea value={form.return_policy} onChange={e => setForm(f => ({ ...f, return_policy: e.target.value }))} rows={3} className="w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary resize-none" />
      </div>

      <button onClick={handleSave} disabled={updateStore.isPending}
        className="rounded-lg px-6 py-2.5 bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
        {updateStore.isPending ? t('saving') : t('save_changes')}
      </button>
    </div>
  );
}
