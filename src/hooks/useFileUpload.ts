import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useFileUpload() {
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File, path: string): Promise<string | null> => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `${path}/${Date.now()}.${ext}`;

      const { error } = await supabase.storage
        .from("store-assets")
        .upload(fileName, file, { upsert: true });

      if (error) throw error;

      const { data } = supabase.storage
        .from("store-assets")
        .getPublicUrl(fileName);

      return data.publicUrl;
    } catch (err: any) {
      toast.error("Upload failed: " + err.message);
      return null;
    } finally {
      setUploading(false);
    }
  };

  return { upload, uploading };
}
