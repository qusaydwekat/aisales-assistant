import { Facebook, Instagram, MessageCircle, Check, X, ExternalLink } from "lucide-react";
import { platformColors } from "@/data/mock-data";

const platforms = [
  {
    id: 'facebook', name: 'Facebook Messenger', icon: Facebook, color: platformColors.facebook,
    connected: true, pageName: 'Urban Style Co.', followers: '12.4K', lastSync: '2 mins ago', messagesThisWeek: 45,
  },
  {
    id: 'instagram', name: 'Instagram Direct', icon: Instagram, color: platformColors.instagram,
    connected: true, pageName: '@urbanstyleco', followers: '8.2K', lastSync: '5 mins ago', messagesThisWeek: 38,
  },
  {
    id: 'whatsapp', name: 'WhatsApp Business', icon: MessageCircle, color: platformColors.whatsapp,
    connected: true, pageName: '+20 101 234 5678', followers: null, lastSync: '1 min ago', messagesThisWeek: 72,
  },
];

export default function PlatformsPage() {
  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Connected Platforms</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your messaging platform connections</p>
      </div>

      <div className="grid gap-4">
        {platforms.map(p => (
          <div key={p.id} className="glass rounded-xl p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: p.color + '20' }}>
                  <p.icon className="h-6 w-6" style={{ color: p.color }} />
                </div>
                <div>
                  <h3 className="font-heading font-semibold text-foreground">{p.name}</h3>
                  <p className="text-sm text-muted-foreground">{p.pageName}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-success/20 text-success">
                  <Check className="h-3 w-3" /> Connected
                </span>
                <button className="px-3 py-1.5 rounded-lg text-xs text-destructive hover:bg-destructive/10 transition-colors">
                  Disconnect
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-border/50">
              {p.followers && (
                <div><p className="text-xs text-muted-foreground">Followers</p><p className="text-sm font-medium text-foreground">{p.followers}</p></div>
              )}
              <div><p className="text-xs text-muted-foreground">Messages This Week</p><p className="text-sm font-medium text-foreground">{p.messagesThisWeek}</p></div>
              <div><p className="text-xs text-muted-foreground">Last Synced</p><p className="text-sm font-medium text-foreground">{p.lastSync}</p></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
