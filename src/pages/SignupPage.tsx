import { useState } from "react";
import { motion } from "framer-motion";
import { Zap, ArrowRight, ArrowLeft, Upload, Facebook, Instagram, MessageCircle, Check } from "lucide-react";

const steps = ['Account', 'Store Info', 'Products', 'Platforms', 'Review'];

export default function SignupPage() {
  const [step, setStep] = useState(0);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary"><Zap className="h-5 w-5 text-primary-foreground" /></div>
          <span className="font-heading text-2xl font-bold text-foreground">AISales</span>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-1 mb-8">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${i <= step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              {i < steps.length - 1 && <div className={`w-8 h-0.5 ${i < step ? 'bg-primary' : 'bg-muted'}`} />}
            </div>
          ))}
        </div>

        <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="glass rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-heading font-bold text-foreground">{steps[step]}</h2>

          {step === 0 && (
            <div className="space-y-3">
              <input placeholder="Full Name" className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
              <input placeholder="Email" type="email" className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
              <input placeholder="Password" type="password" className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
              <input placeholder="Phone Number" className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
              <input placeholder="Store Name" className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <textarea placeholder="Store Description" rows={3} className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none focus:ring-1 focus:ring-primary" />
              <select className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground outline-none"><option>Select Category</option><option>Clothing & Fashion</option><option>Electronics</option><option>Food & Beverage</option><option>Health & Beauty</option></select>
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center text-muted-foreground text-sm cursor-pointer hover:border-primary/50 transition-colors"><Upload className="h-6 w-6 mx-auto mb-2" />Upload Store Logo</div>
              <input placeholder="Store Address" className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Add your products or import via CSV</p>
              <div className="glass rounded-lg p-4 space-y-3">
                <input placeholder="Product Name" className="w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none" />
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Price" type="number" className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none" />
                  <input placeholder="Stock" type="number" className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none" />
                </div>
                <button className="w-full rounded-lg bg-primary/10 text-primary py-2 text-sm font-medium">+ Add Product</button>
              </div>
              <button className="w-full rounded-lg border border-dashed border-border py-3 text-sm text-muted-foreground hover:border-primary/50 transition-colors">📄 Import CSV</button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Connect your messaging platforms (optional)</p>
              {[{ name: 'Facebook', icon: Facebook, color: '#1877F2' }, { name: 'Instagram', icon: Instagram, color: '#E4405F' }, { name: 'WhatsApp', icon: MessageCircle, color: '#25D366' }].map(p => (
                <div key={p.name} className="glass rounded-lg p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <p.icon className="h-5 w-5" style={{ color: p.color }} />
                    <span className="text-sm text-foreground">{p.name}</span>
                  </div>
                  <button className="px-3 py-1.5 rounded-lg text-xs bg-muted text-foreground hover:bg-primary hover:text-primary-foreground transition-colors">Connect</button>
                </div>
              ))}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">Review your details and submit. Your account will be reviewed by our team.</p>
              <div className="glass rounded-lg p-4 space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground">Store</span><span className="text-foreground">My Store</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Products</span><span className="text-foreground">0 added</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Platforms</span><span className="text-foreground">None connected</span></div>
              </div>
              <button className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 font-medium hover:bg-primary/90 transition-colors">Submit for Review</button>
            </div>
          )}

          {step < 4 && (
            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowLeft className="h-4 w-4" /> Back</button>
              <button onClick={() => setStep(Math.min(4, step + 1))} className="flex items-center gap-1 text-sm bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors">Next <ArrowRight className="h-4 w-4" /></button>
            </div>
          )}
        </motion.div>

        <p className="text-center text-sm text-muted-foreground mt-4">Already have an account? <a href="/login" className="text-primary hover:underline">Log in</a></p>
      </div>
    </div>
  );
}
