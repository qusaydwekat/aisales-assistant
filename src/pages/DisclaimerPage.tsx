import { useLanguage } from "@/contexts/LanguageContext";

const DisclaimerPage = () => {
  const { t } = useLanguage();
  const sections = ["disc_s1", "disc_s2", "disc_s3", "disc_s4", "disc_s5"];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-8">{t("disclaimer")}</h1>
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

export default DisclaimerPage;
