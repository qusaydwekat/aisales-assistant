import LegalPageLayout from "@/components/LegalPageLayout";

const TermsOfUsePage = () => {
  const sections = ["tou_s1", "tou_s2", "tou_s3", "tou_s4", "tou_s5", "tou_s6", "tou_s7"];

  return <LegalPageLayout titleKey="terms_of_use" sections={sections} />;
};

export default TermsOfUsePage;
