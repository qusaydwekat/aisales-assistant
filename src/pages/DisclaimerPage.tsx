import LegalPageLayout from "@/components/LegalPageLayout";

const DisclaimerPage = () => {
  const sections = ["disc_s1", "disc_s2", "disc_s3", "disc_s4", "disc_s5"];

  return <LegalPageLayout titleKey="disclaimer" sections={sections} />;
};

export default DisclaimerPage;
