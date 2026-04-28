import { useState, useEffect } from "react";
import { Bot, Globe, Volume2, Clock, MessageSquare, AlertTriangle, Send, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useAISettings, useUpsertAISettings } from "@/hooks/useSupabaseData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";

export default function AISettingsPage() {
  const { dir } = useLanguage();
  const { data: settings, isLoading } = useAISettings();
  const upsert = useUpsertAISettings();

  const [personaName, setPersonaName] = useState('Sara');
  const [language, setLanguage] = useState('both');
  const [tone, setTone] = useState('friendly');
  const [autoReply, setAutoReply] = useState(true);
  const [delay, setDelay] = useState(2);
  const [escalationThreshold, setEscalationThreshold] = useState(5);
  const [collectionWindow, setCollectionWindow] = useState(5);
  const [silenceFollowup, setSilenceFollowup] = useState(false);
  const [fallbackMessage, setFallbackMessage] = useState("I'm not sure about that. Let me connect you with our team!");
  const [aiInstructions, setAiInstructions] = useState('You are a helpful sales assistant. Help customers find products, answer questions about the store, and assist with placing orders. Be polite, concise, and always try to help the customer find what they need.');
  const [testMessage, setTestMessage] = useState('');
  const [testChat, setTestChat] = useState<{ role: string; text: string }[]>([]);
  const [isTestLoading, setIsTestLoading] = useState(false);

  useEffect(() => {
    if (settings) {
      setPersonaName(settings.persona_name);
      setLanguage(settings.language);
      setTone(settings.tone);
      setAutoReply(settings.auto_reply);
      setDelay(settings.response_delay);
      setEscalationThreshold(settings.escalation_threshold);
      setCollectionWindow((settings as any).collection_window_seconds ?? 5);
      setSilenceFollowup((settings as any).silence_followup_enabled ?? false);
      setFallbackMessage(settings.fallback_message || '');
      setAiInstructions((settings as any).ai_instructions || 'You are a helpful sales assistant. Help customers find products, answer questions about the store, and assist with placing orders. Be polite, concise, and always try to help the customer find what they need.');
    }
  }, [settings]);

  const handleSave = () => {
    upsert.mutate({
      persona_name: personaName, language, tone, auto_reply: autoReply,
      response_delay: delay, escalation_threshold: escalationThreshold,
      fallback_message: fallbackMessage, ai_instructions: aiInstructions,
      collection_window_seconds: collectionWindow,
      silence_followup_enabled: silenceFollowup,
    } as any);
  };

  const handleTestSend = async () => {
    if (!testMessage.trim()) return;
    const userMsg = testMessage;
    setTestChat(prev => [...prev, { role: 'user', text: userMsg }]);
    setTestMessage('');
    setIsTestLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('ai-chat-test', {
        body: {
          message: userMsg,
          personaName, tone, language,
        },
      });
      if (error) throw error;
      setTestChat(prev => [...prev, { role: 'ai', text: data?.reply || fallbackMessage }]);
    } catch (e: any) {
      toast.error("AI test failed");
      setTestChat(prev => [...prev, { role: 'ai', text: fallbackMessage }]);
    } finally {
      setIsTestLoading(false);
    }
  };

  if (isLoading) return <div className="p-6 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="p-6 space-y-6 pb-20 md:pb-6" dir={dir}>
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">AI Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure your AI sales assistant</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="glass rounded-xl p-6 space-y-4">
            <h2 className="font-heading font-semibold text-foreground flex items-center gap-2"><Bot className="h-4 w-4 text-primary" /> Persona</h2>
            <div><label className="text-xs text-muted-foreground">AI Name</label><input value={personaName} onChange={e => setPersonaName(e.target.value)} className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" /></div>
            <div><label className="text-xs text-muted-foreground">Language</label>
              <select value={language} onChange={e => setLanguage(e.target.value)} className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none">
                <option value="en">English</option><option value="ar">Arabic</option><option value="both">Auto-detect (Both)</option>
              </select>
            </div>
            <div><label className="text-xs text-muted-foreground">Tone</label>
              <select value={tone} onChange={e => setTone(e.target.value)} className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none">
                <option value="professional">Professional</option><option value="friendly">Friendly</option><option value="casual">Casual</option>
              </select>
            </div>
          </div>

          <div className="glass rounded-xl p-6 space-y-4">
            <h2 className="font-heading font-semibold text-foreground flex items-center gap-2"><Volume2 className="h-4 w-4 text-primary" /> Behavior</h2>
            <div className="flex items-center justify-between">
              <div><p className="text-sm text-foreground">Auto-reply</p><p className="text-xs text-muted-foreground">AI responds automatically</p></div>
              <button onClick={() => setAutoReply(!autoReply)} className={`w-11 h-6 rounded-full transition-colors ${autoReply ? 'bg-primary' : 'bg-muted'}`}>
                <div className={`h-5 w-5 rounded-full bg-foreground transition-transform ${autoReply ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <div><label className="text-xs text-muted-foreground">Response delay: {delay}s</label><input type="range" min={0} max={10} value={delay} onChange={e => setDelay(Number(e.target.value))} className="w-full mt-1 accent-primary" /></div>
            <div><label className="text-xs text-muted-foreground">Escalation after {escalationThreshold} messages</label><input type="range" min={2} max={10} value={escalationThreshold} onChange={e => setEscalationThreshold(Number(e.target.value))} className="w-full mt-1 accent-primary" /></div>
            <div>
              <label className="text-xs text-muted-foreground">Message batching window: {collectionWindow}s</label>
              <input type="range" min={3} max={10} value={collectionWindow} onChange={e => setCollectionWindow(Number(e.target.value))} className="w-full mt-1 accent-primary" />
              <p className="text-[11px] text-muted-foreground mt-1">AI waits this long after the customer's last message (timer resets on each new message) before replying.</p>
            </div>
            <div className="flex items-center justify-between pt-2">
              <div><p className="text-sm text-foreground">Silence follow-up</p><p className="text-xs text-muted-foreground">Send a soft check-in if the customer goes quiet for 10+ minutes</p></div>
              <button onClick={() => setSilenceFollowup(!silenceFollowup)} className={`w-11 h-6 rounded-full transition-colors ${silenceFollowup ? 'bg-primary' : 'bg-muted'}`}>
                <div className={`h-5 w-5 rounded-full bg-foreground transition-transform ${silenceFollowup ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>

          <div className="glass rounded-xl p-6 space-y-4">
            <h2 className="font-heading font-semibold text-foreground flex items-center gap-2"><Bot className="h-4 w-4 text-primary" /> AI Instructions</h2>
            <p className="text-xs text-muted-foreground">Custom instructions that guide how the AI behaves with your customers</p>
            <textarea value={aiInstructions} onChange={e => setAiInstructions(e.target.value)} rows={5} className="w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none resize-none focus:ring-1 focus:ring-primary" placeholder="Enter custom AI instructions..." />
          </div>

          <div className="glass rounded-xl p-6 space-y-4">
            <h2 className="font-heading font-semibold text-foreground flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /> Fallback</h2>
            <textarea value={fallbackMessage} onChange={e => setFallbackMessage(e.target.value)} rows={3} className="w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none resize-none focus:ring-1 focus:ring-primary" />
          </div>

          <button onClick={handleSave} disabled={upsert.isPending}
            className="rounded-lg px-6 py-2.5 bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
            {upsert.isPending ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        {/* AI Chat Simulator */}
        <div className="glass rounded-xl flex flex-col h-[600px]">
          <div className="p-4 border-b border-border">
            <h2 className="font-heading font-semibold text-foreground flex items-center gap-2"><MessageSquare className="h-4 w-4 text-accent" /> AI Chat Simulator</h2>
            <p className="text-xs text-muted-foreground">Test how your AI responds to messages</p>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {testChat.length === 0 && <p className="text-sm text-muted-foreground text-center mt-12">Send a test message to see how your AI responds</p>}
            {testChat.map((msg, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${msg.role === 'user' ? 'bg-primary/20 text-foreground rounded-br-md' : 'bg-accent/10 text-foreground rounded-bl-md border border-accent/20 glow-accent'}`}>
                  {msg.role === 'ai' && <p className="text-[10px] font-medium text-accent mb-1">🤖 {personaName}</p>}
                  <p className="whitespace-pre-line">{msg.text}</p>
                </div>
              </motion.div>
            ))}
            {isTestLoading && (
              <div className="flex justify-start">
                <div className="bg-accent/10 rounded-2xl px-4 py-2.5 text-sm border border-accent/20 rounded-bl-md">
                  <Loader2 className="h-4 w-4 animate-spin text-accent" />
                </div>
              </div>
            )}
          </div>
          <div className="p-3 border-t border-border">
            <div className="flex gap-2">
              <input value={testMessage} onChange={e => setTestMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleTestSend()} placeholder="Type a test message..." className="flex-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none" />
              <button onClick={handleTestSend} disabled={isTestLoading} className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"><Send className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
