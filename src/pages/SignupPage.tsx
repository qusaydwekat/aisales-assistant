import { useState } from "react";
import { motion } from "framer-motion";
import { Zap, Upload, Check, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, Navigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";

export default function SignupPage() {
  const { signUp, session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { t, dir } = useLanguage();
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

  const steps = [t("step_account"), t("step_store_info"), t("step_review")];

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
      <div className="min-h-screen bg-background flex items-center justify-center p-4" dir={dir}>
        <div className="w-full max-w-sm text-center">
          <div className="flex items-center gap-2 justify-center mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary"><Zap className="h-5 w-5 text-primary-foreground" /></div>
            <span className="font-heading text-2xl font-bold text-foreground">AISales</span>
          </div>
          <div className="glass rounded-2xl p-6 space-y-4">
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-success/20">
              <Check className="h-8 w-8 text-success" />
            </div>
            <h2 className="text-lg font-heading font-bold text-foreground">{t("account_created")}</h2>
            <p className="text-sm text-muted-foreground">{t("check_email")}</p>
            <button onClick={() => navigate("/login")} className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 font-medium text-sm hover:bg-primary/90 transition-colors">
              {t("go_to_login")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4" dir={dir}>
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

        <motion.div key={step} initial={{ opacity: 0, x: dir === 'rtl' ? -20 : 20 }} animate={{ opacity: 1, x: 0 }} className="glass rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-heading font-bold text-foreground">{steps[step]}</h2>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {step === 0 && (
            <div className="space-y-3">
              <input placeholder={t("full_name")} value={fullName} onChange={e => setFullName(e.target.value)} className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
              <input placeholder={t("email")} type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
              <input placeholder={t("password")} type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
              <input placeholder={t("phone_number")} value={phone} onChange={e => setPhone(e.target.value)} className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
              <input placeholder={t("store_name")} value={storeName} onChange={e => setStoreName(e.target.value)} className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <textarea placeholder={t("store_description")} rows={3} value={storeDescription} onChange={e => setStoreDescription(e.target.value)} className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none focus:ring-1 focus:ring-primary" />
              <select value={storeCategory} onChange={e => setStoreCategory(e.target.value)} className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground outline-none">
                <option value="">{t("select_category")}</option>
                <option value="clothing">{t("clothing_fashion")}</option>
                <option value="electronics">{t("electronics")}</option>
                <option value="food">{t("food_beverage")}</option>
                <option value="beauty">{t("health_beauty")}</option>
              </select>
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center text-muted-foreground text-sm cursor-pointer hover:border-primary/50 transition-colors">
                <Upload className="h-6 w-6 mx-auto mb-2" />{t("upload_store_logo")}
              </div>
              <input placeholder={t("store_address")} value={storeAddress} onChange={e => setStoreAddress(e.target.value)} className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">{t("review_details")}</p>
              <div className="glass rounded-lg p-4 space-y-2">
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">{t("name_field")}</span><span className="text-foreground">{fullName || '—'}</span></div>
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">{t("email")}</span><span className="text-foreground">{email || '—'}</span></div>
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">{t("store")}</span><span className="text-foreground">{storeName || '—'}</span></div>
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">{t("category_field")}</span><span className="text-foreground">{storeCategory || '—'}</span></div>
              </div>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("submit_review")}
              </button>
            </div>
          )}

          {step < 2 && (
            <div className="flex justify-between pt-2">
              <button type="button" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-30">
                {dir === 'rtl' ? '→' : '←'} {t("back")}
              </button>
              <button type="button" onClick={() => setStep(Math.min(2, step + 1))}
                className="flex items-center gap-1 text-sm bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors">
                {t("next")} {dir === 'rtl' ? '←' : '→'}
              </button>
            </div>
          )}
        </motion.div>

        <p className="text-center text-sm text-muted-foreground mt-4">
          {t("already_have_account")} <a href="/login" className="text-primary hover:underline">{t("log_in")}</a>
        </p>
      </div>
    </div>
  );
}
