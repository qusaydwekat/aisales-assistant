import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Globe, Menu, ShieldCheck, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

export function PublicSiteHeader() {
  const { language, setLanguage, t } = useLanguage();
  const { user, signOut, loading } = useAuth();
  const ar = language === "ar";
  const text = (en: string, arabic: string) => ar ? arabic : en;
  const accountUrl = "/dashboard";
  const primaryUrl = user ? accountUrl : "/signup";
  const workspaceLabel = text("Open workspace", "افتح مساحة العمل");
  const [menuOpen, setMenuOpen] = useState(false);
  const nav = [
    ["#capabilities", text("Platform", "المنصة")],
    ["#automation", text("AI automation", "الأتمتة الذكية")],
    ["#workspace", text("Workspace", "مساحة العمل")],
    ["#faq", text("FAQs", "الأسئلة الشائعة")],
  ];
  return (
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/95 backdrop-blur-xl">
        <div className="home-container flex h-20 items-center justify-between gap-4">
          <Link to="/" aria-label={text("AISales home", "الصفحة الرئيسية لـ AISales")} className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Zap className="h-5 w-5" fill="currentColor" /></span><span className="font-heading text-2xl font-bold">AI<span className="text-primary">Sales</span><span className="text-primary">.</span></span></Link>
          <nav className="hidden items-center gap-7 lg:flex" aria-label={text("Main navigation", "التنقل الرئيسي")}>{nav.map(([href, label]) => <a key={href} href={`/${href}`} className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">{label}</a>)}</nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" aria-label={ar ? "English" : "العربية"} title={ar ? "English" : "العربية"} onClick={() => setLanguage(ar ? "en" : "ar")}><Globe /><span>{ar ? "English" : "العربية"}</span></Button>
            {!loading && (user ? <Button variant="ghost" className="hidden sm:inline-flex" onClick={() => void signOut()}>{t("sign_out")}</Button> : <Button asChild variant="ghost" className="hidden sm:inline-flex"><Link to="/login">{text("Log in", "تسجيل الدخول")}</Link></Button>)}
            {!loading && <Button asChild className="hidden sm:inline-flex"><Link to={primaryUrl}>{user ? workspaceLabel : text("Get started", "ابدأ الآن")}<ArrowUpRight className="rtl:-scale-x-100" /></Link></Button>}
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label={text("Toggle menu", "فتح القائمة")} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</Button>
          </div>
        </div>
        {menuOpen && <nav className="home-container grid gap-1 border-t border-border py-4 lg:hidden">{nav.map(([href, label]) => <Button key={href} asChild variant="ghost" className="justify-start"><a href={`/${href}`} onClick={() => setMenuOpen(false)}>{label}</a></Button>)}{!loading && <>{user ? <Button variant="outline" onClick={() => { setMenuOpen(false); void signOut(); }}>{t("sign_out")}</Button> : <Button asChild variant="outline"><Link to="/login">{text("Log in", "تسجيل الدخول")}</Link></Button>}<Button asChild><Link to={primaryUrl}>{user ? workspaceLabel : text("Get started", "ابدأ الآن")}</Link></Button></>}</nav>}
      </header>
  );
}

export function PublicSiteFooter() {
  const { language, setLanguage, t } = useLanguage();
  const { user, signOut, loading } = useAuth();
  const ar = language === "ar";
  const text = (en: string, arabic: string) => ar ? arabic : en;
  const accountUrl = "/dashboard";
  const primaryUrl = user ? accountUrl : "/signup";
  const workspaceLabel = text("Open workspace", "افتح مساحة العمل");
  return (
      <footer className="home-container py-10"><div className="flex flex-col justify-between gap-8 sm:flex-row"><div><Link to="/" className="flex items-center gap-2 font-heading text-xl font-bold"><Zap className="h-5 w-5 text-primary" />AISales<span className="text-primary">.</span></Link><p className="mt-3 text-sm text-muted-foreground">{text("Intelligent conversations. Connected commerce.", "محادثات ذكية. تجارة مترابطة.")}</p></div><div className="flex flex-wrap gap-x-7 gap-y-3 text-sm text-muted-foreground"><Link to="/privacy-policy" className="hover:text-primary">{t("privacy_policy")}</Link><Link to="/terms-of-use" className="hover:text-primary">{t("terms_of_use")}</Link><Link to="/disclaimer" className="hover:text-primary">{t("disclaimer")}</Link><Link to={user ? accountUrl : "/login"} className="hover:text-primary">{user ? workspaceLabel : text("Log in", "تسجيل الدخول")}</Link></div></div><div className="mt-9 flex flex-wrap justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground"><span>© {new Date().getFullYear()} AISales. {text("All rights reserved.", "جميع الحقوق محفوظة.")}</span><span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />{text("AI-assisted. Human-led.", "بمساعدة الذكاء الاصطناعي. بقيادة الإنسان.")}</span></div></footer>
  );
}
