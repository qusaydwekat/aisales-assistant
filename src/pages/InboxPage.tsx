import { useState } from "react";
import { Search, Facebook, Instagram, MessageCircle, Send, Check, User, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useConversations, useMessages, useSendMessage, useUpdateConversationStatus, useOrders } from "@/hooks/useSupabaseData";
import { platformColors } from "@/data/mock-data";
import type { Tables } from "@/integrations/supabase/types";

type Platform = "facebook" | "instagram" | "whatsapp";
const platformIcons: Record<Platform, typeof Facebook> = { facebook: Facebook, instagram: Instagram, whatsapp: MessageCircle };

export default function InboxPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<Platform | 'all'>('all');
  const [replyText, setReplyText] = useState('');
  const [searchText, setSearchText] = useState('');

  const { data: conversations = [], isLoading: loadingConvos } = useConversations();
  const { data: messages = [] } = useMessages(selectedId);
  const { data: orders = [] } = useOrders();
  const sendMessage = useSendMessage();
  const updateStatus = useUpdateConversationStatus();

  const filtered = conversations.filter(c =>
    (filterPlatform === 'all' || c.platform === filterPlatform) &&
    (searchText === '' || c.customer_name.toLowerCase().includes(searchText.toLowerCase()))
  );
  const selected = conversations.find(c => c.id === selectedId);

  const handleSend = async () => {
    if (!replyText.trim() || !selectedId) return;
    await sendMessage.mutateAsync({ conversation_id: selectedId, sender: 'owner', content: replyText });
    setReplyText('');
  };

  if (loadingConvos) return <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Left: Conversation List */}
      <div className="w-80 border-r border-border flex flex-col shrink-0">
        <div className="p-3 space-y-2 border-b border-border">
          <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Search conversations..." className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1" />
          </div>
          <div className="flex gap-1">
            {(['all', 'facebook', 'instagram', 'whatsapp'] as const).map(p => (
              <button key={p} onClick={() => setFilterPlatform(p)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${filterPlatform === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                {p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && <p className="p-4 text-sm text-muted-foreground text-center">No conversations yet</p>}
          {filtered.map(c => {
            const Icon = platformIcons[c.platform as Platform];
            return (
              <button key={c.id} onClick={() => setSelectedId(c.id)}
                className={`w-full text-left px-3 py-3 border-b border-border/50 transition-colors ${c.id === selectedId ? 'bg-muted/60' : 'hover:bg-muted/30'} ${c.unread ? 'border-l-2 border-l-primary' : ''}`}>
                <div className="flex items-center gap-2">
                  {Icon && <Icon className="h-4 w-4 shrink-0" style={{ color: platformColors[c.platform as Platform] }} />}
                  <span className="text-sm font-medium text-foreground truncate flex-1">{c.customer_name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {c.last_message_time && new Date(c.last_message_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate pl-6">{c.last_message}</p>
                {c.status !== 'open' && (
                  <div className="pl-6 mt-1.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.status === 'pending_order' ? 'bg-warning/20 text-warning' : 'bg-success/20 text-success'}`}>
                      {c.status === 'pending_order' ? 'Pending Order' : 'Resolved'}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Center: Chat Thread */}
      <div className="flex-1 flex flex-col min-w-0">
        {selected ? (
          <>
            <div className="h-14 px-4 flex items-center justify-between border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                {(() => { const Icon = platformIcons[selected.platform as Platform]; return Icon ? <Icon className="h-4 w-4" style={{ color: platformColors[selected.platform as Platform] }} /> : null; })()}
                <span className="font-medium text-foreground">{selected.customer_name}</span>
              </div>
              {selected.status !== 'resolved' && (
                <button onClick={() => updateStatus.mutate({ id: selected.id, status: 'resolved' })}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-success/20 text-success hover:bg-success/30 transition-colors flex items-center gap-1">
                  <Check className="h-3 w-3" /> Mark Resolved
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && <p className="text-sm text-muted-foreground text-center mt-12">No messages yet</p>}
              {messages.map(msg => (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.sender === 'customer' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm ${
                    msg.sender === 'customer' ? 'bg-muted text-foreground rounded-bl-md'
                    : msg.sender === 'ai' ? 'bg-accent/10 text-foreground rounded-br-md border border-accent/20 glow-accent'
                    : 'bg-primary/10 text-foreground rounded-br-md border border-primary/20'
                  }`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase">
                        {msg.sender === 'ai' ? '🤖 AI' : msg.sender === 'owner' ? '👤 You' : ''}
                      </span>
                    </div>
                    <p className="whitespace-pre-line">{msg.content}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1 text-right">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="p-3 border-t border-border">
              <div className="flex items-center gap-2 rounded-xl bg-muted px-4 py-2">
                <input value={replyText} onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder="Type a reply..." className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1" />
                <button onClick={handleSend} disabled={sendMessage.isPending} className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">Select a conversation</div>
        )}
      </div>

      {/* Right: Customer Panel */}
      {selected && (
        <div className="w-72 border-l border-border p-4 space-y-4 hidden xl:block overflow-y-auto">
          <div className="text-center">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mx-auto">
              <User className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-heading font-semibold text-foreground mt-2">{selected.customer_name}</h3>
            <p className="text-xs text-muted-foreground">{selected.customer_phone}</p>
            {selected.customer_address && <p className="text-xs text-muted-foreground mt-1">{selected.customer_address}</p>}
          </div>
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Past Orders</h4>
            {orders.filter(o => o.phone === selected.customer_phone).length === 0 && (
              <p className="text-xs text-muted-foreground">No orders found</p>
            )}
            {orders.filter(o => o.phone === selected.customer_phone).map(o => (
              <div key={o.id} className="glass rounded-lg p-2.5 mb-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-foreground font-medium">{o.order_number}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                    o.status === 'delivered' ? 'bg-success/20 text-success' :
                    o.status === 'shipped' ? 'bg-accent/20 text-accent' :
                    'bg-warning/20 text-warning'
                  }`}>{o.status}</span>
                </div>
                <p className="text-muted-foreground mt-1">${Number(o.total).toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
