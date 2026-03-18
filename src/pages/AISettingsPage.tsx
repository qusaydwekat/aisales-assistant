import { useState } from "react";
import { Bot, Globe, Volume2, Clock, MessageSquare, AlertTriangle, Send } from "lucide-react";
import { motion } from "framer-motion";

export default function AISettingsPage() {
  const [personaName, setPersonaName] = useState('Sara');
  const [language, setLanguage] = useState('both');
  const [tone, setTone] = useState(50);
  const [autoReply, setAutoReply] = useState(true);
  const [delay, setDelay] = useState(3);
  const [escalationThreshold, setEscalationThreshold] = useState(5);
  const [fallbackMessage, setFallbackMessage] = useState("I'm not sure about that. Let me connect you with our team!");
  const [testMessage, setTestMessage] = useState('');
  const [testChat, setTestChat] = useState<{ role: string; text: string }[]>([]);

  const handleTestSend = () => {
    if (!testMessage.trim()) return;
    setTestChat(prev => [...prev, { role: 'user', text: testMessage }, { role: 'ai', text: `Hi! I'm ${personaName}, your AI assistant. Let me help you with that. We have several great products available. Would you like me to show you our collection?` }]);
    setTestMessage('');
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">AI Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure your AI sales assistant</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Settings */}
        <div className="space-y-4">
          <div className="glass rounded-xl p-6 space-y-4">
            <h2 className="font-heading font-semibold text-foreground flex items-center gap-2"><Bot className="h-4 w-4 text-primary" /> Persona</h2>
            <div><label className="text-xs text-muted-foreground">AI Name</label><input value={personaName} onChange={e => setPersonaName(e.target.value)} className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" /></div>
            <div><label className="text-xs text-muted-foreground">Language</label>
              <select value={language} onChange={e => setLanguage(e.target.value)} className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none">
                <option value="en">English</option><option value="ar">Arabic</option><option value="both">Auto-detect (Both)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Tone: {tone < 33 ? 'Professional' : tone < 66 ? 'Friendly' : 'Casual'}</label>
              <input type="range" min={0} max={100} value={tone} onChange={e => setTone(Number(e.target.value))} className="w-full mt-1 accent-primary" />
              <div className="flex justify-between text-[10px] text-muted-foreground"><span>Professional</span><span>Casual</span></div>
            </div>
          </div>

          <div className="glass rounded-xl p-6 space-y-4">
            <h2 className="font-heading font-semibold text-foreground flex items-center gap-2"><Volume2 className="h-4 w-4 text-primary" /> Behavior</h2>
            <div className="flex items-center justify-between">
              <div><p className="text-sm text-foreground">Auto-reply</p><p className="text-xs text-muted-foreground">AI responds automatically to messages</p></div>
              <button onClick={() => setAutoReply(!autoReply)} className={`w-11 h-6 rounded-full transition-colors ${autoReply ? 'bg-primary' : 'bg-muted'}`}>
                <div className={`h-5 w-5 rounded-full bg-foreground transition-transform ${autoReply ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <div><label className="text-xs text-muted-foreground">Response delay: {delay}s</label><input type="range" min={0} max={10} value={delay} onChange={e => setDelay(Number(e.target.value))} className="w-full mt-1 accent-primary" /></div>
            <div><label className="text-xs text-muted-foreground">Escalation after {escalationThreshold} messages</label><input type="range" min={2} max={10} value={escalationThreshold} onChange={e => setEscalationThreshold(Number(e.target.value))} className="w-full mt-1 accent-primary" /></div>
          </div>

          <div className="glass rounded-xl p-6 space-y-4">
            <h2 className="font-heading font-semibold text-foreground flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /> Fallback</h2>
            <textarea value={fallbackMessage} onChange={e => setFallbackMessage(e.target.value)} rows={3} className="w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none resize-none focus:ring-1 focus:ring-primary" />
          </div>

          <button className="rounded-lg px-6 py-2.5 bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors">Save Settings</button>
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
                  <p>{msg.text}</p>
                </div>
              </motion.div>
            ))}
          </div>
          <div className="p-3 border-t border-border">
            <div className="flex gap-2">
              <input value={testMessage} onChange={e => setTestMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleTestSend()} placeholder="Type a test message..." className="flex-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none" />
              <button onClick={handleTestSend} className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"><Send className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
