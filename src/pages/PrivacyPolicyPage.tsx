import { useLanguage } from "@/contexts/LanguageContext";

const PrivacyPolicyPage = () => {
  const { t } = useLanguage();
  const sections = ["pp_s1", "pp_s2", "pp_s3", "pp_s4", "pp_s5", "pp_s6"];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-8">{t("privacy_policy")}</h1>
        <p className="text-muted-foreground mb-6">{t("last_updated")}</p>
        {sections.map((s) => (
          <section key={s} className="space-y-4 mb-8">
            <h2 className="text-xl font-semibold">{t(`${s}_title`)}</h2>
            <p className="text-muted-foreground leading-relaxed">{t(`${s}_text`)}</p>
          </section>
        ))}
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;
