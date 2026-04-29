import { Facebook, Instagram, MessageCircle, Check, Loader2, Copy, Link2, Unlink, CheckSquare, Square, Sparkles, Shield, Zap, Wrench } from "lucide-react";
import { usePlatformConnections } from "@/hooks/useSupabaseData";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { platformColors } from "@/data/mock-data";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

type Platform = "facebook" | "instagram" | "whatsapp";
type PageOption = { id: string; name: string; instagram_business_account?: string | null };

const platformIcons: Record<Platform, typeof Facebook> = { facebook: Facebook, instagram: Instagram, whatsapp: MessageCircle };
const platformLabels: Record<Platform, string> = { facebook: "Messenger", instagram: "Instagram", whatsapp: "WhatsApp" };

export default function PlatformsPage() {
  const { data: connections = [], isLoading } = usePlatformConnections();
  const { store } = useAuth();
  const { t, dir } = useLanguage();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [pages, setPages] = useState<PageOption[]>([]);
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [selectingPage, setSelectingPage] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectPlatform, setSelectPlatform] = useState<Platform | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [connectingPlatform, setConnectingPlatform] = useState<Platform | null>(null);

  const oauthBaseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-oauth`;

  // Handle OAuth callback redirect — wait for store to be ready so RLS works
  useEffect(() => {
    const sid = searchParams.get("session_id");
    const platform = searchParams.get("platform") as Platform | null;
    const error = searchParams.get("error");

    if (error) {
      const errorMessages: Record<string, string> = {
        no_pages_found: "No Facebook pages found. Make sure you have a Facebook Page.",
        no_whatsapp_numbers_found: "No WhatsApp Business phone numbers found. Make sure you have a WhatsApp Business Account with a registered phone number.",
        token_exchange_failed: "Failed to authenticate with Meta. Please try again.",
        callback_failed: "Connection failed. Please try again.",
      };
      toast.error(errorMessages[error] || `Connection error: ${error}`);
      setSearchParams({}, { replace: true });
      return;
    }

    if (sid && platform && store?.id) {
      setSessionId(sid);
      setSelectPlatform(platform);
      fetchPendingPages(sid, store.id);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, store?.id]);

  const fetchPendingPages = async (sid: string, storeId: string) => {
    const { data } = await supabase
      .from("platform_connections")
      .select("credentials")
      .eq("store_id", storeId)
      .eq("status", "pending_selection")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      const creds = data.credentials as any;
      if (creds?.session_id === sid && creds?.pages) {
        setPages(creds.pages);
        setSelectedPageIds(new Set(creds.pages.map((p: PageOption) => p.id)));
        setSelectingPage(true);
      }
    }
  };

  const togglePage = (pageId: string) => {
    setSelectedPageIds(prev => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedPageIds.size === pages.length) {
      setSelectedPageIds(new Set());
    } else {
      setSelectedPageIds(new Set(pages.map(p => p.id)));
    }
  };

  const handleConnectSelected = async () => {
    if (!sessionId || selectedPageIds.size === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${oauthBaseUrl}/select-pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, page_ids: Array.from(selectedPageIds) }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to connect pages");

      const count = result.connected?.length || 0;
      const conflictCount = result.conflicts?.length || 0;
      const failedCount = result.failed?.length || 0;

      if (count > 0) {
        toast.success(`🎉 Connected ${count} ${count !== 1 ? "accounts" : "account"} successfully!`);
      }

      if (conflictCount > 0) {
        const preview = result.conflicts.slice(0, 2).join(", ");
        toast.error(`${conflictCount} ${conflictCount !== 1 ? "are" : "is"} already linked to another store${preview ? `: ${preview}` : ""}`);
      }

      if (!count && !conflictCount && failedCount > 0) {
        throw new Error("Failed to connect the selected accounts");
      }

      qc.invalidateQueries({ queryKey: ["platform_connections"] });
      setSelectingPage(false);
      setPages([]);
      setSessionId(null);
      setSelectPlatform(null);
      setSelectedPageIds(new Set());
    } catch (err: any) {
      toast.error(err.message || "Failed to connect");
    } finally {
      setSubmitting(false);
    }
  };

  const startOAuth = (platform: Platform) => {
    if (!store?.id) {
      toast.error("Store not found. Please set up your store first.");
      return;
    }
    setConnectingPlatform(platform);
    const redirectUrl = window.location.origin + "/platforms";
    const oauthUrl = `${oauthBaseUrl}/start?platform=${platform}&store_id=${store.id}&redirect_url=${encodeURIComponent(redirectUrl)}`;
    window.location.href = oauthUrl;
  };

  const handleDisconnect = async (connectionId: string, name: string) => {
    try {
      const { error } = await supabase
        .from("platform_connections")
        .delete()
        .eq("id", connectionId);
      if (error) throw error;
      toast.success(`${name} disconnected`);
      qc.invalidateQueries({ queryKey: ["platform_connections"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to disconnect");
    }
  };

  const allPlatforms: Platform[] = ["facebook", "instagram", "whatsapp"];
  const totalConnected = connections.filter(c => c.status === "connected").length;
  const platformStatus = allPlatforms.map(p => ({
    platform: p,
    connections: connections.filter(c => c.platform === p && c.status === "connected"),
  }));

  if (isLoading) return <div className="p-6 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl pb-20 md:pb-6 mx-auto" dir={dir}>
      {/* Hero header */}
      <div className="text-center md:text-start space-y-2">
        <h1 className="text-2xl md:text-3xl font-heading font-bold text-foreground">{t("connected_platforms")}</h1>
        <p className="text-sm text-muted-foreground">{t("manage_platforms")}</p>
      </div>

      {/* Unified Meta connect hero card */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 via-background to-accent/10 p-5 md:p-8">
        <div className="absolute -top-12 -end-12 h-40 w-40 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -start-12 h-40 w-40 rounded-full bg-accent/20 blur-3xl pointer-events-none" />

        <div className="relative space-y-5">
          {/* Top row: brand + status */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                <span className="font-heading font-bold text-white text-2xl">M</span>
                <Sparkles className="absolute -top-1 -end-1 h-4 w-4 text-yellow-300" />
              </div>
              <div>
                <h2 className="text-lg md:text-xl font-heading font-bold text-foreground">Connect with Meta</h2>
                <p className="text-xs md:text-sm text-muted-foreground">One login • Messenger, Instagram & WhatsApp</p>
              </div>
            </div>
            {totalConnected > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-success/15 text-success text-xs font-semibold">
                <Check className="h-3.5 w-3.5" />
                {totalConnected} {t("pages_connected")}
              </span>
            )}
          </div>

          {/* Channel pills */}
          <div className="grid grid-cols-3 gap-2 md:gap-3">
            {platformStatus.map(({ platform, connections: conns }) => {
              const Icon = platformIcons[platform];
              const color = platformColors[platform];
              const isConnected = conns.length > 0;
              const isConnecting = connectingPlatform === platform;
              return (
                <button
                  key={platform}
                  onClick={() => startOAuth(platform)}
                  disabled={isConnecting}
                  className={`group relative rounded-xl border p-3 md:p-4 text-start transition-all hover:scale-[1.02] hover:shadow-md disabled:opacity-50 ${
                    isConnected
                      ? "border-success/40 bg-success/5"
                      : "border-border bg-card/50 hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + "20" }}>
                      {isConnecting ? (
                        <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin" style={{ color }} />
                      ) : (
                        <Icon className="h-4 w-4 md:h-5 md:w-5" style={{ color }} />
                      )}
                    </div>
                    {isConnected && (
                      <div className="h-5 w-5 rounded-full bg-success flex items-center justify-center shrink-0">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </div>
                  <p className="font-heading font-semibold text-sm text-foreground">{platformLabels[platform]}</p>
                  <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5">
                    {isConnected ? `${conns.length} ${conns.length === 1 ? "account" : "accounts"}` : t("connect")}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Trust badges */}
          <div className="flex items-center justify-center md:justify-start gap-4 text-xs text-muted-foreground pt-2 border-t border-border/40 flex-wrap">
            <span className="inline-flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-primary" /> Secure OAuth</span>
            <span className="inline-flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-primary" /> Instant AI replies</span>
            <span className="inline-flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-primary" /> No code needed</span>
          </div>
        </div>
      </div>

      {/* Connected accounts list */}
      {totalConnected > 0 && (
        <div className="space-y-3">
          <h3 className="font-heading font-semibold text-foreground text-sm md:text-base px-1">Your connected accounts</h3>
          <div className="space-y-2">
            {platformStatus.flatMap(({ platform, connections: conns }) =>
              conns.map(conn => {
                const Icon = platformIcons[platform];
                const color = platformColors[platform];
                return (
                  <div key={conn.id} className="glass rounded-xl p-3 md:p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: color + "20" }}>
                        <Icon className="h-5 w-5" style={{ color }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-foreground truncate">{conn.page_name || "Unknown"}</p>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-success/20 text-success shrink-0">
                            <Check className="h-2.5 w-2.5" /> Live
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {platformLabels[platform]} • {conn.message_count || 0} messages
                          {conn.last_synced_at && ` • Last sync ${new Date(conn.last_synced_at).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDisconnect(conn.id, conn.page_name || "Account")}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                    >
                      <Unlink className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Empty state helper */}
      {totalConnected === 0 && (
        <div className="text-center py-6 text-sm text-muted-foreground">
          <p>👆 Pick a channel above to start connecting. You'll be guided by Meta's secure login.</p>
        </div>
      )}

      {/* Multi-Page Selection Dialog */}
      <Dialog open={selectingPage} onOpenChange={(open) => { if (!open) { setSelectingPage(false); setPages([]); setSessionId(null); setSelectedPageIds(new Set()); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectPlatform && (() => { const Icon = platformIcons[selectPlatform]; return <Icon className="h-5 w-5" style={{ color: platformColors[selectPlatform] }} />; })()}
              {t("select_pages_title")}
            </DialogTitle>
            <DialogDescription>
              {t("select_pages_desc")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 pt-2 max-h-80 overflow-y-auto">
            {pages.length > 1 && (
              <button onClick={toggleAll} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors text-start">
                {selectedPageIds.size === pages.length
                  ? <CheckSquare className="h-4 w-4 text-primary shrink-0" />
                  : <Square className="h-4 w-4 text-muted-foreground shrink-0" />}
                <span className="text-sm font-medium text-foreground">{t("select_all")} ({pages.length})</span>
              </button>
            )}
            {pages.map(page => (
              <button
                key={page.id}
                onClick={() => togglePage(page.id)}
                disabled={submitting}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors text-start disabled:opacity-50"
              >
                {selectedPageIds.has(page.id)
                  ? <CheckSquare className="h-5 w-5 text-primary shrink-0" />
                  : <Square className="h-5 w-5 text-muted-foreground shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{page.name}</p>
                  <p className="text-xs text-muted-foreground">ID: {page.id}</p>
                </div>
              </button>
            ))}
            {pages.length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-sm">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                {t("loading_pages")}
              </div>
            )}
          </div>

          {pages.length > 0 && (
            <div className="pt-3 border-t border-border/50">
              <Button onClick={handleConnectSelected} disabled={submitting || selectedPageIds.size === 0} className="w-full gap-2">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                {t("connect")} {selectedPageIds.size} {selectedPageIds.size === 1 ? "account" : "accounts"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
