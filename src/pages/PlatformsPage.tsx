import { Facebook, Instagram, MessageCircle, Check, Loader2, Copy, ExternalLink } from "lucide-react";
import { usePlatformConnections } from "@/hooks/useSupabaseData";
import { useLanguage } from "@/contexts/LanguageContext";
import { platformColors } from "@/data/mock-data";
import { toast } from "sonner";

type Platform = "facebook" | "instagram" | "whatsapp";
const platformIcons: Record<Platform, typeof Facebook> = { facebook: Facebook, instagram: Instagram, whatsapp: MessageCircle };
const platformLabels: Record<Platform, string> = { facebook: "Facebook Messenger", instagram: "Instagram Direct", whatsapp: "WhatsApp Business" };

export default function PlatformsPage() {
  const { data: connections = [], isLoading } = usePlatformConnections();
  const { t, dir } = useLanguage();

  const webhookBaseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/platform-webhook`;

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
      webhookUrl: `${webhookBaseUrl}?platform=${p}`,
    };
  });

  const copyWebhook = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("Webhook URL copied!");
  };

  if (isLoading) return <div className="p-6 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="p-6 space-y-6 max-w-4xl" dir={dir}>
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">{t("connected_platforms")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("manage_platforms")}</p>
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
                    <Check className="h-3 w-3" /> {t("connected")}
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-muted text-muted-foreground">{t("not_connected")}</span>
                )}
              </div>
            </div>

            {/* Webhook URL */}
            <div className="mt-4 pt-4 border-t border-border/50">
              <p className="text-xs text-muted-foreground mb-1.5">Webhook URL</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted rounded-lg px-3 py-2 text-foreground/80 truncate font-mono">
                  {p.webhookUrl}
                </code>
                <button onClick={() => copyWebhook(p.webhookUrl)}
                  className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>

            {p.connected && (
              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-border/50">
                <div><p className="text-xs text-muted-foreground">{t("messages")}</p><p className="text-sm font-medium text-foreground">{p.messagesThisWeek}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("last_synced")}</p><p className="text-sm font-medium text-foreground">{p.lastSync}</p></div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="glass rounded-xl p-6">
        <h3 className="font-heading font-semibold text-foreground flex items-center gap-2">
          <ExternalLink className="h-4 w-4 text-primary" /> Setup Guide
        </h3>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <p>1. Copy the webhook URL for your platform above</p>
          <p>2. Go to your Meta/WhatsApp developer dashboard</p>
          <p>3. Paste the webhook URL in the webhook configuration</p>
          <p>4. Set the verify token to: <code className="bg-muted px-1.5 py-0.5 rounded text-xs text-foreground">aisales_verify_2024</code></p>
          <p>5. Subscribe to <code className="bg-muted px-1.5 py-0.5 rounded text-xs text-foreground">messages</code> events</p>
        </div>
      </div>
    </div>
  );
}
