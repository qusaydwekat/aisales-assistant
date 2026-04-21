import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Upload, Download, FileText, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { parseProductsCsv, ParsedRow, buildTemplateCsv, downloadCsv } from "@/lib/csv";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (products: NonNullable<ParsedRow["product"]>[]) => Promise<void>;
}

export function CsvImportDialog({ open, onClose, onImport }: Props) {
  const { t, dir } = useLanguage();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [filename, setFilename] = useState("");
  const [importing, setImporting] = useState(false);

  if (!open) return null;

  const validRows = rows.filter((r) => r.product);
  const invalidCount = rows.length - validRows.length;

  const handleFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseProductsCsv(text);
    setRows(parsed);
    setFilename(file.name);
  };

  const reset = () => {
    setRows([]);
    setFilename("");
  };

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      await onImport(validRows.map((r) => r.product!));
      toast.success(`${t("imported_n_products")} ${validRows.length} ${t("products_imported_suffix")}`);
      reset();
      onClose();
    } catch (e: any) {
      toast.error(e.message || t("import_failed"));
    } finally {
      setImporting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-2 md:p-4"
        dir={dir}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.96 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0.96 }}
          onClick={(e) => e.stopPropagation()}
          className="glass rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col"
        >
          <div className="p-4 md:p-6 border-b border-border/50 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-heading font-bold text-foreground">{t("import_products_csv")}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{t("bulk_add_hint")}</p>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted">
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
            {rows.length === 0 ? (
              <>
                <button
                  onClick={() => downloadCsv("products-template.csv", buildTemplateCsv())}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm text-foreground hover:bg-muted transition-colors"
                >
                  <Download className="h-4 w-4" /> {t("download_template")}
                </button>
                <label className="block">
                  <div className="border-2 border-dashed border-border hover:border-primary/50 rounded-xl p-8 text-center cursor-pointer transition-colors">
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                    <p className="text-sm text-foreground mt-2 font-medium">{t("click_to_upload_csv")}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("csv_headers_hint")}
                    </p>
                  </div>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                    className="hidden"
                  />
                </label>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-foreground font-medium truncate flex-1">{filename}</span>
                  <button onClick={reset} className="text-xs text-muted-foreground hover:text-foreground underline">
                    {t("choose_different_file")}
                  </button>
                </div>
                <div className="flex gap-3 text-xs">
                  <span className="px-2 py-1 rounded bg-success/20 text-success flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> {validRows.length} {t("valid_label")}
                  </span>
                  {invalidCount > 0 && (
                    <span className="px-2 py-1 rounded bg-destructive/20 text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> {invalidCount} {t("invalid_label")}
                    </span>
                  )}
                </div>
                <div className="rounded-lg border border-border overflow-x-auto max-h-96">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="px-2 py-2 text-start font-medium text-muted-foreground">#</th>
                        <th className="px-2 py-2 text-start font-medium text-muted-foreground">{t("name_label")}</th>
                        <th className="px-2 py-2 text-start font-medium text-muted-foreground">{t("category_col_h")}</th>
                        <th className="px-2 py-2 text-start font-medium text-muted-foreground">{t("price_col_h")}</th>
                        <th className="px-2 py-2 text-start font-medium text-muted-foreground">{t("stock_col_h")}</th>
                        <th className="px-2 py-2 text-start font-medium text-muted-foreground">{t("status_col_h")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr
                          key={i}
                          className={`border-t border-border/50 ${
                            r.errors.length ? "bg-destructive/5" : ""
                          }`}
                        >
                          <td className="px-2 py-1.5 text-muted-foreground">{i + 1}</td>
                          <td className="px-2 py-1.5 text-foreground truncate max-w-[180px]">
                            {r.raw.name || "—"}
                          </td>
                          <td className="px-2 py-1.5 text-muted-foreground">{r.raw.category || "—"}</td>
                          <td className="px-2 py-1.5 text-foreground">{r.raw.price || "—"}</td>
                          <td className="px-2 py-1.5 text-foreground">{r.raw.stock || "0"}</td>
                          <td className="px-2 py-1.5">
                            {r.errors.length ? (
                              <span className="text-destructive">{r.errors.join(", ")}</span>
                            ) : (
                              <span className="text-success">{t("ok_label")}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {rows.length > 0 && (
            <div className="p-4 md:p-6 border-t border-border/50 flex items-center justify-end gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted"
              >
                {t("cancel")}
              </button>
              <button
                onClick={handleImport}
                disabled={importing || validRows.length === 0}
                className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5"
              >
                {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("importing_n_products")} {validRows.length} {t("products_imported_suffix")}
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
