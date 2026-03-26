import { Facebook, Instagram, MessageCircle, Check, Loader2 } from "lucide-react";
import { usePlatformConnections } from "@/hooks/useSupabaseData";
import { platformColors } from "@/data/mock-data";

type Platform = "facebook" | "instagram" | "whatsapp";
const platformIcons: Record<Platform, typeof Facebook> = { facebook: Facebook, instagram: Instagram, whatsapp: MessageCircle };
const platformLabels: Record<Platform, string> = { facebook: "Facebook Messenger", instagram: "Instagram Direct", whatsapp: "WhatsApp Business" };

export default function PlatformsPage() {
  const { data: connections = [], isLoading } = usePlatformConnections();

  // Show all 3 platforms, merging with connection data
  const allPlatforms: Platform[] = ['facebook', 'instagram', 'whatsapp'];
  const platformData = allPlatforms.map(p => {
    const conn = connections.find(c => c.platform === p);
    return {
      id: p,
      name: platformLabels[p],
      icon: platformIcons[p],
      color: platformColors[p],
      connected: conn?.status === 'connected',
      pageName: conn?.page_name || '—',
      lastSync: conn?.last_synced_at ? new Date(conn.last_synced_at).toLocaleString() : '—',
      messagesThisWeek: conn?.message_count || 0,
    };
  });

  if (isLoading) return <div className="p-6 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Connected Platforms</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your messaging platform connections</p>
      </div>

      <div className="grid gap-4">
        {platformData.map(p => (
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
                {p.connected ? (
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-success/20 text-success">
                    <Check className="h-3 w-3" /> Connected
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-muted text-muted-foreground">Not Connected</span>
                )}
              </div>
            </div>
            {p.connected && (
              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-border/50">
                <div><p className="text-xs text-muted-foreground">Messages</p><p className="text-sm font-medium text-foreground">{p.messagesThisWeek}</p></div>
                <div><p className="text-xs text-muted-foreground">Last Synced</p><p className="text-sm font-medium text-foreground">{p.lastSync}</p></div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
