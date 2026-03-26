import { Facebook, Instagram, MessageCircle, Check, Loader2, Copy, ExternalLink, Link2, Unlink, RefreshCw } from "lucide-react";
import { usePlatformConnections } from "@/hooks/useSupabaseData";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { platformColors } from "@/data/mock-data";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";

type Platform = "facebook" | "instagram" | "whatsapp";
const platformIcons: Record<Platform, typeof Facebook> = { facebook: Facebook, instagram: Instagram, whatsapp: MessageCircle };
const platformLabels: Record<Platform, string> = { facebook: "Facebook Messenger", instagram: "Instagram Direct", whatsapp: "WhatsApp Business" };

export default function PlatformsPage() {
  const { data: connections = [], isLoading } = usePlatformConnections();
  const { store } = useAuth();
  const { t, dir } = useLanguage();
  const qc = useQueryClient();

  const [connectDialog, setConnectDialog] = useState<Platform | null>(null);
  const [pageId, setPageId] = useState("");
  const [pageName, setPageName] = useState("");
  const [connecting, setConnecting] = useState(false);

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
      connectionId: conn?.id,
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

  const handleConnect = async () => {
    if (!store?.id || !connectDialog || !pageId.trim()) return;
    setConnecting(true);
    try {
      const existing = connections.find(c => c.platform === connectDialog);
      if (existing) {
        const { error } = await supabase
          .from("platform_connections")
          .update({ page_id: pageId.trim(), page_name: pageName.trim() || pageId.trim(), status: "connected", last_synced_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("platform_connections")
          .insert({ store_id: store.id, platform: connectDialog, page_id: pageId.trim(), page_name: pageName.trim() || pageId.trim(), status: "connected", last_synced_at: new Date().toISOString() });
        if (error) throw error;
      }
      toast.success(`${platformLabels[connectDialog]} connected!`);
      qc.invalidateQueries({ queryKey: ["platform_connections"] });
      setConnectDialog(null);
      setPageId("");
      setPageName("");
    } catch (err: any) {
      toast.error(err.message || "Failed to connect");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (connectionId: string, name: string) => {
    try {
      const { error } = await supabase
        .from("platform_connections")
        .update({ status: "disconnected" })
        .eq("id", connectionId);
      if (error) throw error;
      toast.success(`${name} disconnected`);
      qc.invalidateQueries({ queryKey: ["platform_connections"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to disconnect");
    }
  };

  const pageIdLabels: Record<Platform, { label: string; placeholder: string; help: string }> = {
    facebook: { label: "Facebook Page ID", placeholder: "e.g. 123456789012345", help: "Find it in your Facebook Page → About → Page ID" },
    instagram: { label: "Instagram Business Account ID", placeholder: "e.g. 17841400000000000", help: "Find it in Meta Business Suite → Instagram account settings" },
    whatsapp: { label: "WhatsApp Phone Number ID", placeholder: "e.g. 100000000000000", help: "Find it in Meta Developer Portal → WhatsApp → Getting Started" },
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
                  <>
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-success/20 text-success">
                      <Check className="h-3 w-3" /> {t("connected")}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => handleDisconnect(p.connectionId!, p.name)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10">
                      <Unlink className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={() => setConnectDialog(p.id)}
                    className="gap-1.5">
                    <Link2 className="h-4 w-4" /> Connect
                  </Button>
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
          <p>1. Click <strong>Connect</strong> on the platform and enter your Page/Account ID</p>
          <p>2. Copy the webhook URL and paste it in your Meta Developer Dashboard</p>
          <p>3. Set the verify token to: <code className="bg-muted px-1.5 py-0.5 rounded text-xs text-foreground">aisales_verify_2024</code></p>
          <p>4. Subscribe to <code className="bg-muted px-1.5 py-0.5 rounded text-xs text-foreground">messages</code> events</p>
          <p>5. Messages will appear in your Inbox automatically</p>
        </div>
      </div>

      {/* Connect Dialog */}
      <Dialog open={!!connectDialog} onOpenChange={(open) => !open && setConnectDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {connectDialog && (() => { const Icon = platformIcons[connectDialog]; return <Icon className="h-5 w-5" style={{ color: platformColors[connectDialog] }} />; })()}
              Connect {connectDialog ? platformLabels[connectDialog] : ''}
            </DialogTitle>
            <DialogDescription>
              Enter your {connectDialog ? pageIdLabels[connectDialog].help : 'platform ID'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {connectDialog ? pageIdLabels[connectDialog].label : 'Page ID'}
              </label>
              <Input
                placeholder={connectDialog ? pageIdLabels[connectDialog].placeholder : ''}
                value={pageId}
                onChange={(e) => setPageId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Display Name (optional)</label>
              <Input
                placeholder="e.g. My Store Page"
                value={pageName}
                onChange={(e) => setPageName(e.target.value)}
              />
            </div>
            <Button className="w-full" onClick={handleConnect} disabled={!pageId.trim() || connecting}>
              {connecting ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : <Link2 className="h-4 w-4 me-2" />}
              Connect Platform
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
