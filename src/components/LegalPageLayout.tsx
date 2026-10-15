import { Link, NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicSiteHeader, PublicSiteFooter } from "@/components/PublicSiteLayout";
import { useLanguage } from "@/contexts/LanguageContext";

const legalPages = [
  { url: "/privacy-policy", key: "privacy_policy" },
  { url: "/terms-of-use", key: "terms_of_use" },
  { url: "/disclaimer", key: "disclaimer" },
];

export default function LegalPageLayout({ titleKey, sections }: { titleKey: string; sections: string[] }) {
  const { language, dir, t } = useLanguage();
  const ar = language === "ar";
  return (
    <div className="home-page min-h-screen bg-background text-foreground" dir={dir}>
      <PublicSiteHeader />
      <main>
        <section className="border-b border-border bg-secondary/50">
          <div className="home-container py-10 sm:py-14">
            <Button asChild variant="link" className="mb-8 h-auto p-0"><Link to="/"><ArrowLeft className="rtl:-scale-x-100" />{ar ? "العودة للرئيسية" : "Back to home"}</Link></Button>
            <div className="mb-4 flex items-center gap-2 text-primary"><ShieldCheck className="h-5 w-5" /><p className="home-eyebrow">{ar ? "AISales · السياسات والشروط" : "AISales · Legal"}</p></div>
            <h1 className="font-heading text-4xl font-semibold leading-tight sm:text-5xl">{t(titleKey)}</h1>
            <p className="mt-5 text-sm text-muted-foreground">{t("last_updated")}</p>
          </div>
        </section>
        <div className="home-container grid gap-10 py-10 sm:py-16 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-20">
          <aside>
            <nav className="flex flex-wrap gap-2 lg:sticky lg:top-28 lg:flex-col" aria-label={ar ? "الصفحات القانونية" : "Legal pages"}>
              {legalPages.map(page => <Button key={page.key} asChild variant="ghost" className="h-auto justify-start whitespace-normal px-4 py-3 text-start"><NavLink to={page.url} className={({ isActive }) => isActive ? "bg-secondary text-primary" : "text-muted-foreground"}>{t(page.key)}</NavLink></Button>)}
            </nav>
          </aside>
          <motion.article key={`${titleKey}-${language}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="min-w-0 max-w-3xl">
            {sections.map(section => <section key={section} className="mb-8 border-b border-border pb-8 last:mb-0 last:border-0 last:pb-0"><h2 className="font-heading text-xl font-semibold leading-relaxed">{t(`${section}_title`)}</h2><p className="mt-4 text-base leading-8 text-muted-foreground">{t(`${section}_text`)}</p></section>)}
          </motion.article>
        </div>
      </main>
      <div className="border-t border-border"><PublicSiteFooter /></div>
    </div>
  );
}