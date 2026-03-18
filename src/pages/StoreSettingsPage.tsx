import { Store, Clock, Truck, CreditCard, RotateCcw } from "lucide-react";

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function StoreSettingsPage() {
  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Store Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your store information</p>
      </div>

      {/* Basic Info */}
      <div className="glass rounded-xl p-6 space-y-4">
        <h2 className="font-heading font-semibold text-foreground flex items-center gap-2"><Store className="h-4 w-4 text-primary" /> Store Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className="text-xs text-muted-foreground">Store Name</label><input defaultValue="Urban Style Co." className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" /></div>
          <div><label className="text-xs text-muted-foreground">Category</label><select className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"><option>Clothing & Fashion</option><option>Electronics</option><option>Food & Beverage</option></select></div>
        </div>
        <div><label className="text-xs text-muted-foreground">Description</label><textarea defaultValue="Premium urban fashion and streetwear for the modern individual." rows={3} className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary resize-none" /></div>
        <div><label className="text-xs text-muted-foreground">Store Logo</label><div className="mt-1 border-2 border-dashed border-border rounded-lg p-6 text-center text-muted-foreground text-sm cursor-pointer hover:border-primary/50 transition-colors">Click to upload logo</div></div>
      </div>

      {/* Business Hours */}
      <div className="glass rounded-xl p-6 space-y-4">
        <h2 className="font-heading font-semibold text-foreground flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Business Hours</h2>
        <div className="space-y-2">
          {days.map(day => (
            <div key={day} className="flex items-center gap-3">
              <label className="w-28 text-sm text-foreground">{day}</label>
              <input type="checkbox" defaultChecked={day !== 'Friday'} className="accent-primary" />
              <input type="time" defaultValue="09:00" className="rounded bg-muted px-2 py-1 text-sm text-foreground outline-none" />
              <span className="text-muted-foreground text-sm">to</span>
              <input type="time" defaultValue="18:00" className="rounded bg-muted px-2 py-1 text-sm text-foreground outline-none" />
            </div>
          ))}
        </div>
      </div>

      {/* Delivery & Returns */}
      <div className="glass rounded-xl p-6 space-y-4">
        <h2 className="font-heading font-semibold text-foreground flex items-center gap-2"><Truck className="h-4 w-4 text-primary" /> Delivery Information</h2>
        <textarea defaultValue="Free delivery on orders over $50. Standard delivery 3-5 business days." rows={3} className="w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary resize-none" />
      </div>

      <div className="glass rounded-xl p-6 space-y-4">
        <h2 className="font-heading font-semibold text-foreground flex items-center gap-2"><RotateCcw className="h-4 w-4 text-primary" /> Return Policy</h2>
        <textarea defaultValue="14-day return policy on all unused items with original tags." rows={3} className="w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary resize-none" />
      </div>

      <button className="rounded-lg px-6 py-2.5 bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors">
        Save Changes
      </button>
    </div>
  );
}
