import { useState } from "react";
import { motion } from "framer-motion";
import { Zap, ArrowRight, ArrowLeft, Upload, Check, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, Navigate } from "react-router-dom";

const steps = ['Account', 'Store Info', 'Review'];

export default function SignupPage() {
  const { signUp, session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Step 1
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [storeName, setStoreName] = useState("");

  // Step 2
  const [storeDescription, setStoreDescription] = useState("");
  const [storeCategory, setStoreCategory] = useState("");
  const [storeAddress, setStoreAddress] = useState("");

  if (authLoading) return null;
  if (session && !success) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    const { error } = await signUp(email, password, fullName, phone, storeName);
    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
    }
    setLoading(false);
  };

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="flex items-center gap-2 justify-center mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary"><Zap className="h-5 w-5 text-primary-foreground" /></div>
            <span className="font-heading text-2xl font-bold text-foreground">AISales</span>
          </div>
          <div className="glass rounded-2xl p-6 space-y-4">
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-success/20">
              <Check className="h-8 w-8 text-success" />
            </div>
            <h2 className="text-lg font-heading font-bold text-foreground">Account Created!</h2>
            <p className="text-sm text-muted-foreground">Please check your email to verify your account. Your store will be reviewed by our team.</p>
            <button onClick={() => navigate("/login")} className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 font-medium text-sm hover:bg-primary/90 transition-colors">
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
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

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {step === 0 && (
            <div className="space-y-3">
              <input placeholder="Full Name" value={fullName} onChange={e => setFullName(e.target.value)} className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
              <input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
              <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
              <input placeholder="Phone Number" value={phone} onChange={e => setPhone(e.target.value)} className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
              <input placeholder="Store Name" value={storeName} onChange={e => setStoreName(e.target.value)} className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <textarea placeholder="Store Description" rows={3} value={storeDescription} onChange={e => setStoreDescription(e.target.value)} className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none focus:ring-1 focus:ring-primary" />
              <select value={storeCategory} onChange={e => setStoreCategory(e.target.value)} className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground outline-none">
                <option value="">Select Category</option>
                <option value="clothing">Clothing & Fashion</option>
                <option value="electronics">Electronics</option>
                <option value="food">Food & Beverage</option>
                <option value="beauty">Health & Beauty</option>
              </select>
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center text-muted-foreground text-sm cursor-pointer hover:border-primary/50 transition-colors"><Upload className="h-6 w-6 mx-auto mb-2" />Upload Store Logo</div>
              <input placeholder="Store Address" value={storeAddress} onChange={e => setStoreAddress(e.target.value)} className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">Review your details and submit. Your account will be reviewed by our team.</p>
              <div className="glass rounded-lg p-4 space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="text-foreground">{fullName || '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="text-foreground">{email || '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Store</span><span className="text-foreground">{storeName || '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Category</span><span className="text-foreground">{storeCategory || 'Not set'}</span></div>
              </div>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Submit for Review
              </button>
            </div>
          )}

          {step < 2 && (
            <div className="flex justify-between pt-2">
              <button type="button" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowLeft className="h-4 w-4" /> Back</button>
              <button type="button" onClick={() => setStep(Math.min(2, step + 1))} className="flex items-center gap-1 text-sm bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors">Next <ArrowRight className="h-4 w-4" /></button>
            </div>
          )}
        </motion.div>

        <p className="text-center text-sm text-muted-foreground mt-4">Already have an account? <a href="/login" className="text-primary hover:underline">Log in</a></p>
      </div>
    </div>
  );
}
