// Browser bundle for scripts/certificates/pdf-preview.ts: every design as one PDF, through the
// same export code the website uses.
import { downloadPdf } from "@/lib/certificates/export";
import { defaultConfig, TEMPLATES } from "@/lib/certificates/config";

const data = {
  name: "Nusrat Jahan Mim", role: "General Secretary", event: "CSE Carnival 2026", rank: "1st place", team: "Null Pointers",
  date: "12 October 2026", code: "GUCC-7K3M-Q9TB-X2HD-PV4E", verifyUrl: "https://gucc.green.edu.bd/c/7K3MQ9TBX2HDPV4E",
};
(window as unknown as { makePdf: () => Promise<void> }).makePdf = () =>
  downloadPdf(TEMPLATES.map((template) => ({ template, config: defaultConfig("EXECUTIVE"), data })), "designs.pdf");
