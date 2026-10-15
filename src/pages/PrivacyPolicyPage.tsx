import LegalPageLayout from "@/components/LegalPageLayout";

const PrivacyPolicyPage = () => {
  const sections = ["pp_s1", "pp_s2", "pp_s3", "pp_s4", "pp_s5", "pp_s6"];

  return <LegalPageLayout titleKey="privacy_policy" sections={sections} />;
};

export default PrivacyPolicyPage;
