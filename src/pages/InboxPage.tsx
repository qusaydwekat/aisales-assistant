import { useState, useRef, useEffect, useMemo } from "react";
import { Search, Facebook, Instagram, MessageCircle, Send, Check, User, Loader2, Image as ImageIcon, Filter, ArrowLeft, ArrowRight, Bot } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useConversations, useMessages, useSendMessage, useUpdateConversationStatus, useOrders, usePlatformConnections, useMarkConversationRead, useToggleAIAutoReply } from "@/hooks/useSupabaseData";
import { useRealtimeMessages, useRealtimeConversations, useRealtimeOrders } from "@/hooks/useRealtimeMessages";
import { useNavigate } from "react-router-dom";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { platformColors } from "@/data/mock-data";
import type { Tables } from "@/integrations/supabase/types";

type Platform = "facebook" | "instagram" | "whatsapp";
const platformIcons: Record<Platform, typeof Facebook> = { facebook: Facebook, instagram: Instagram, whatsapp: MessageCircle };
const platformLabels: Record<Platform, string> = { facebook: "Messenger", instagram: "Instagram", whatsapp: "WhatsApp" };

const stripMessageContext = (content: string | null | undefined) =>
  typeof content === "string" ? content.split("\n\n[CTX]")[0] : "";

const getImageUrlFromContent = (content: string | null | undefined) => {
  const visibleContent = stripMessageContext(content);
  return visibleContent.startsWith("📷 ") ? visibleContent.replace("📷 ", "").trim() : null;
};

const getCtxField = (content: string | null | undefined, field: string): string | null => {
  if (typeof content !== "string") return null;
  const ctxIdx = content.indexOf("\n\n[CTX]");
  if (ctxIdx === -1) return null;
  const ctx = content.slice(ctxIdx + 7);
  const re = new RegExp(`${field}=([^|]+?)(?:\\s\\||$)`);
  const m = ctx.match(re);
  return m ? m[1].trim() : null;
};

export default function InboxPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<Platform | 'all'>('all');
  const [filterPageId, setFilterPageId] = useState<string>('all');
  const [replyText, setReplyText] = useState('');
  const [searchText, setSearchText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { store } = useAuth();
  const { t, dir } = useLanguage();
  const navigate = useNavigate();

  const { data: conversations = [], isLoading: loadingConvos } = useConversations();
  const { data: messages = [] } = useMessages(selectedId);
  const { data: orders = [] } = useOrders();
  const { data: connections = [] } = usePlatformConnections();
  const sendMessage = useSendMessage();
  const updateStatus = useUpdateConversationStatus();
  const markRead = useMarkConversationRead();
  const { upload, uploading } = useFileUpload();
  const toggleAI = useToggleAIAutoReply();

  useEffect(() => {
    if (selectedId) {
      const convo = conversations.find(c => c.id === selectedId);
      if (convo?.unread) {
        markRead.mutate(selectedId);
      }
    }
  }, [selectedId, conversations]);

  // Latest image-match confidence for the selected conversation (nameless-product mode)
  const [matchConfidence, setMatchConfidence] = useState<{ confidence: number; emotion: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const fetchConfidence = async () => {
      if (!selectedId) { setMatchConfidence(null); return; }
      const { data } = await supabase
        .from("ai_message_batch_log")
        .select("image_confidence, detected_emotion")
        .eq("conversation_id", selectedId)
        .not("image_confidence", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        setMatchConfidence(
          data && typeof (data as any).image_confidence === "number"
            ? { confidence: (data as any).image_confidence, emotion: (data as any).detected_emotion || null }
            : null
        );
      }
    };
    fetchConfidence();
    return () => { cancelled = true; };
  }, [selectedId, messages.length]);


  const pagesByPlatform = useMemo(() => {
    const grouped: Record<Platform, typeof connections> = { facebook: [], instagram: [], whatsapp: [] };
    connections.filter(c => c.status === 'connected' && c.page_name).forEach(c => {
      if (grouped[c.platform as Platform]) grouped[c.platform as Platform].push(c);
    });
    return grouped;
  }, [connections]);

  const filteredPages = useMemo(() => {
    if (filterPlatform === 'all') return connections.filter(c => c.status === 'connected' && c.page_name);
    return pagesByPlatform[filterPlatform] || [];
  }, [filterPlatform, pagesByPlatform, connections]);

  const unreadCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    conversations.forEach(c => {
      if (c.unread) {
        counts.all = (counts.all || 0) + 1;
        counts[c.platform] = (counts[c.platform] || 0) + 1;
      }
    });
    return counts;
  }, [conversations]);

  useRealtimeMessages(selectedId);
  useRealtimeConversations(store?.id);
  useRealtimeOrders(store?.id);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    setFilterPageId('all');
  }, [filterPlatform]);

  const filtered = conversations.filter(c =>
    (filterPlatform === 'all' || c.platform === filterPlatform) &&
    (filterPageId === 'all' || c.page_id === filterPageId) &&
    (searchText === '' || c.customer_name.toLowerCase().includes(searchText.toLowerCase()))
  );
  const selected = conversations.find(c => c.id === selectedId);
  const messageByPlatformId = useMemo(() => {
    const map = new Map<string, typeof messages[number]>();
    messages.forEach((message) => {
      if (message.platform_message_id) {
        map.set(message.platform_message_id, message);
      }
    });
    return map;
  }, [messages]);

  const getPageName = (convo: typeof conversations[0]) => {
    const conn = connections.find(c => c.page_id === convo.page_id && c.status === 'connected');
    return conn?.page_name || null;
  };

  const handleSend = async () => {
    if (!replyText.trim() || !selectedId) return;
    await sendMessage.mutateAsync({ conversation_id: selectedId, sender: 'owner', content: replyText });
    setReplyText('');
  };

  const handleImageSend = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    const url = await upload(file, `chat/${selectedId}`);
    if (url) {
      await sendMessage.mutateAsync({ conversation_id: selectedId, sender: 'owner', content: `📷 ${url}` });
    }
  };

  const handleBack = () => setSelectedId(null);

  if (loadingConvos) return <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  // Conversation list panel
  const conversationList = (
    <div className={`${selectedId ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-e border-border flex-col shrink-0 h-full`}>
      <div className="p-3 space-y-2 border-b border-border">
        <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder={t("search")} className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1" />
        </div>

        <div className="flex gap-0.5 bg-muted/50 rounded-lg p-0.5">
          {(['all', 'facebook', 'instagram', 'whatsapp'] as const).map(p => {
            const Icon = p !== 'all' ? platformIcons[p] : null;
            const count = unreadCounts[p] || 0;
            const isActive = filterPlatform === p;
            return (
              <button key={p} onClick={() => setFilterPlatform(p)}
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                  isActive ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}>
                {Icon ? (
                  <Icon className="h-3.5 w-3.5" style={isActive ? { color: platformColors[p as Platform] } : undefined} />
                ) : (
                  <span>{t('all')}</span>
                )}
                {count > 0 && (
                  <span className={`min-w-[16px] h-4 flex items-center justify-center rounded-full text-[10px] font-bold px-1 ${
                    isActive ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/20 text-muted-foreground'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {filteredPages.length > 1 && (
          <div className="flex items-center gap-1.5">
            <Filter className="h-3 w-3 text-muted-foreground shrink-0" />
            <select value={filterPageId} onChange={e => setFilterPageId(e.target.value)}
              className="flex-1 text-xs bg-muted rounded-md px-2 py-1.5 text-foreground border-none outline-none">
              <option value="all">All Pages ({filteredPages.length})</option>
              {filteredPages.map(p => (
                <option key={p.id} value={p.page_id || ''}>
                  {p.platform === 'instagram' ? '📸 ' : p.platform === 'facebook' ? '💬 ' : '📱 '}{p.page_name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="p-6 text-center">
            <p className="text-sm text-muted-foreground">{t("no_conversations")}</p>
            {filterPlatform !== 'all' && (
              <p className="text-xs text-muted-foreground/60 mt-1">{t("no_conversations")}</p>
            )}
          </div>
        )}
        {filtered.map(c => {
          const Icon = platformIcons[c.platform as Platform];
          const pageName = getPageName(c);
          const lastMessageText = stripMessageContext(c.last_message);
          const lastImageUrl = getImageUrlFromContent(c.last_message);
          const isLastImage = !!lastImageUrl;
          return (
            <button key={c.id} onClick={() => setSelectedId(c.id)}
              className={`w-full text-start px-3 py-3 border-b border-border/50 transition-colors ${c.id === selectedId ? 'bg-muted/60' : 'hover:bg-muted/30'} ${c.unread ? 'border-s-2 border-s-primary' : ''}`}>
              <div className="flex items-center gap-2">
                <div className="relative shrink-0">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="absolute -bottom-0.5 -end-0.5 h-4 w-4 rounded-full flex items-center justify-center border-2 border-background"
                    style={{ backgroundColor: platformColors[c.platform as Platform] }}>
                    {Icon && <Icon className="h-2.5 w-2.5 text-white" />}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-sm font-medium text-foreground truncate">{c.customer_name}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {c.last_message_time && new Date(c.last_message_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {pageName && <span className="text-[10px] text-muted-foreground/70 truncate block">{pageName}</span>}
                </div>
              </div>
              <div className="mt-1 ps-10 flex items-center gap-2 min-w-0">
                {isLastImage && lastImageUrl ? (
                  <>
                    <img
                      src={lastImageUrl}
                      alt="Last message"
                      className="h-6 w-6 rounded object-cover border border-border/40 shrink-0"
                    />
                    <p className="text-xs text-muted-foreground truncate">📷 Image</p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground truncate">{lastMessageText}</p>
                )}
              </div>
              {c.status !== 'open' && (
                <div className="ps-10 mt-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.status === 'pending_order' ? 'bg-warning/20 text-warning' : 'bg-success/20 text-success'}`}>
                    {c.status === 'pending_order' ? t("pending_order") : t("resolved_status")}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  // Chat thread panel
  const chatThread = (
    <div className={`${!selectedId ? 'hidden md:flex' : 'flex'} flex-1 flex-col min-w-0 h-full`}>
      {selected ? (
        <>
          <div className="h-14 px-3 md:px-4 flex items-center justify-between border-b border-border shrink-0">
            <div className="flex items-center gap-2 md:gap-3">
              {/* Back button for mobile */}
              <button onClick={handleBack} className="md:hidden p-1.5 -ms-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                {dir === 'rtl' ? <ArrowRight className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}
              </button>
              <div className="relative">
                <div className="h-8 w-8 md:h-9 md:w-9 rounded-full bg-muted flex items-center justify-center">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="absolute -bottom-0.5 -end-0.5 h-4 w-4 rounded-full flex items-center justify-center border-2 border-background"
                  style={{ backgroundColor: platformColors[selected.platform as Platform] }}>
                  {(() => { const Icon = platformIcons[selected.platform as Platform]; return Icon ? <Icon className="h-2.5 w-2.5 text-white" /> : null; })()}
                </div>
              </div>
              <div className="min-w-0">
                <span className="font-medium text-foreground block text-sm truncate">{selected.customer_name}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{
                    backgroundColor: platformColors[selected.platform as Platform] + '20',
                    color: platformColors[selected.platform as Platform],
                  }}>
                    {platformLabels[selected.platform as Platform]}
                  </span>
                  {getPageName(selected) && (
                    <span className="text-[10px] text-muted-foreground hidden sm:inline">• {getPageName(selected)}</span>
                  )}
                  <span className="flex h-2 w-2 rounded-full bg-success animate-pulse" title="Real-time" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => toggleAI.mutate({ id: selected.id, ai_auto_reply: !(selected as any).ai_auto_reply })}
                className={`px-2 md:px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
                  (selected as any).ai_auto_reply !== false
                    ? 'bg-accent/20 text-accent-foreground hover:bg-accent/30'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
                title={(selected as any).ai_auto_reply !== false ? 'AI auto-reply is ON — click to disable' : 'AI auto-reply is OFF — click to enable'}
              >
                <Bot className="h-3 w-3" />
                <span className="hidden sm:inline">{(selected as any).ai_auto_reply !== false ? t("ai_on") : t("ai_off")}</span>
              </button>
              {selected.status !== 'resolved' && (
                <button onClick={() => updateStatus.mutate({ id: selected.id, status: 'resolved' })}
                  className="px-2 md:px-3 py-1.5 rounded-lg text-xs font-medium bg-success/20 text-success hover:bg-success/30 transition-colors flex items-center gap-1 shrink-0">
                  <Check className="h-3 w-3" /> <span className="hidden sm:inline">{t("mark_resolved")}</span>
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3">
            {messages.length === 0 && <p className="text-sm text-muted-foreground text-center mt-12">{t("no_messages")}</p>}
            {messages.map(msg => {
              const visibleContent = stripMessageContext(msg.content);
              const imageUrl = getImageUrlFromContent(msg.content);
              const replyToMid = getCtxField(msg.content, 'reply_to_mid');
              const repliedMessage = replyToMid ? messageByPlatformId.get(replyToMid) : null;
              const replyImageUrl = getCtxField(msg.content, 'context_image') || getImageUrlFromContent(repliedMessage?.content);
              const replyText = getCtxField(msg.content, 'reply_to_text') || stripMessageContext(repliedMessage?.content);
              const adTitle = getCtxField(msg.content, 'ad_title');
              const hasReplyContext = !!(replyToMid || replyImageUrl || replyText || adTitle);

              return (
              <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className={`flex ${msg.sender === 'customer' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3 md:px-4 py-2.5 text-sm ${
                  msg.sender === 'customer' ? 'bg-muted text-foreground rounded-bl-md'
                  : msg.sender === 'ai' ? 'bg-accent/10 text-foreground rounded-br-md border border-accent/20 glow-accent'
                  : 'bg-primary/10 text-foreground rounded-br-md border border-primary/20'
                }`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase">
                      {msg.sender === 'ai' ? '🤖 AI' : msg.sender === 'owner' ? '👤 You' : ''}
                    </span>
                  </div>
                  {hasReplyContext && (
                    <div className="mb-2 ps-2 border-s-2 border-primary/40 bg-background/40 rounded-md p-1.5 flex items-center gap-2">
                      {replyImageUrl && (
                        <img src={replyImageUrl} alt="Replying to" className="h-10 w-10 rounded object-cover shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("replying_to") || "Replying to"}</p>
                        <p className="text-xs text-foreground/80 truncate">
                           {replyText || (adTitle ? `📢 ${adTitle}` : (replyImageUrl ? '📷 Image' : '↩ Previous message'))}
                        </p>
                      </div>
                    </div>
                  )}
                  {imageUrl ? (
                    <img src={imageUrl} alt="Shared image" className="rounded-lg max-w-full max-h-48 object-cover" />
                  ) : (
                    <p className="whitespace-pre-line break-words">{visibleContent}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground/60 mt-1 text-end">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </motion.div>
            )})}
            <div ref={messagesEndRef} />
          </div>
          <div className="p-2 md:p-3 border-t border-border">
            <div className="flex items-center gap-2 rounded-xl bg-muted px-3 md:px-4 py-2">
              <label className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer hover:bg-background/50 transition-colors">
                <ImageIcon className="h-4 w-4" />
                <input type="file" accept="image/*" onChange={handleImageSend} className="hidden" />
              </label>
              <input value={replyText} onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder={t("type_reply")} className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1" />
              <button onClick={handleSend} disabled={sendMessage.isPending || uploading} className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">{t("select_conversation")}</div>
      )}
    </div>
  );

  // Customer info panel (desktop only)
  const customerPanel = selected && (
    <div className="w-72 border-s border-border p-4 space-y-4 hidden xl:block overflow-y-auto">
      <div className="text-center">
        <div className="relative inline-block">
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mx-auto">
            <User className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="absolute -bottom-1 -end-1 h-5 w-5 rounded-full flex items-center justify-center border-2 border-background"
            style={{ backgroundColor: platformColors[selected.platform as Platform] }}>
            {(() => { const Icon = platformIcons[selected.platform as Platform]; return Icon ? <Icon className="h-3 w-3 text-white" /> : null; })()}
          </div>
        </div>
        <h3 className="font-heading font-semibold text-foreground mt-2">{selected.customer_name}</h3>
        <p className="text-xs text-muted-foreground">{selected.customer_phone}</p>
        {selected.customer_address && <p className="text-xs text-muted-foreground mt-1">{selected.customer_address}</p>}
        <div className="mt-2 flex items-center justify-center gap-1.5">
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{
            backgroundColor: platformColors[selected.platform as Platform] + '20',
            color: platformColors[selected.platform as Platform],
          }}>
            {platformLabels[selected.platform as Platform]}
          </span>
          {getPageName(selected) && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {getPageName(selected)}
            </span>
          )}
        </div>
      </div>
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">{t("past_orders")}</h4>
        {orders.filter(o => o.phone === selected.customer_phone).length === 0 && (
          <p className="text-xs text-muted-foreground">{t("no_orders_found")}</p>
        )}
        {orders.filter(o => o.phone === selected.customer_phone).map(o => (
          <div key={o.id} className="glass rounded-lg p-2.5 mb-2 text-xs cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => navigate(`/orders?order=${o.id}`)}>
            <div className="flex justify-between">
              <span className="text-foreground font-medium">{o.order_number}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                o.status === 'delivered' ? 'bg-success/20 text-success' :
                o.status === 'shipped' ? 'bg-accent/20 text-accent' :
                o.status === 'cancelled' ? 'bg-destructive/20 text-destructive' :
                o.status === 'confirmed' ? 'bg-success/20 text-success' :
                'bg-warning/20 text-warning'
              }`}>{o.status}</span>
            </div>
            <p className="text-muted-foreground mt-1">${Number(o.total).toFixed(2)}</p>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem-4rem)] md:h-[calc(100vh-3.5rem)]" dir={dir}>
      {conversationList}
      {chatThread}
      {customerPanel}
    </div>
  );
}
