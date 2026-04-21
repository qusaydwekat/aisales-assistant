import { useCallback, useRef, useState } from "react";
import { Upload, X, Loader2, GripVertical, Star } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useFileUpload } from "@/hooks/useFileUpload";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props {
  images: string[];
  onChange: (next: string[]) => void;
}

function SortableImage({ url, index, onRemove, coverLabel }: { url: string; index: number; onRemove: () => void; coverLabel: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: url });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative h-24 w-24 rounded-lg overflow-hidden group bg-muted shrink-0"
    >
      <img src={url} alt="" className="h-full w-full object-cover pointer-events-none" />
      {index === 0 && (
        <span className="absolute top-1 start-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary text-primary-foreground flex items-center gap-0.5">
          <Star className="h-2.5 w-2.5" /> {coverLabel}
        </span>
      )}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="absolute bottom-1 start-1 p-1 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1 end-1 p-1 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export function ImageDropzone({ images, onChange }: Props) {
  const { upload } = useFileUpload();
  const { t } = useLanguage();
  const [uploadingCount, setUploadingCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (arr.length === 0) return;
      setUploadingCount((c) => c + arr.length);
      try {
        const urls = await Promise.all(arr.map((f) => upload(f, "products")));
        const ok = urls.filter((u): u is string => !!u);
        if (ok.length) onChange([...images, ...ok]);
      } catch (e: any) {
        toast.error(e.message);
      } finally {
        setUploadingCount((c) => Math.max(0, c - arr.length));
      }
    },
    [images, onChange, upload],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const files = e.clipboardData?.files;
    if (files?.length) handleFiles(files);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = images.indexOf(active.id as string);
    const newIdx = images.indexOf(over.id as string);
    if (oldIdx < 0 || newIdx < 0) return;
    onChange(arrayMove(images, oldIdx, newIdx));
  };

  const removeAt = (i: number) => onChange(images.filter((_, idx) => idx !== i));

  return (
    <div onPaste={onPaste}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
        }`}
      >
        {uploadingCount > 0 ? (
          <Loader2 className="h-8 w-8 mx-auto text-primary animate-spin" />
        ) : (
          <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
        )}
        <p className="text-sm text-foreground mt-2 font-medium">
          {uploadingCount > 0 ? `${t("uploading_n")} ${uploadingCount}...` : t("drop_images_hint")}
        </p>
        <p className="text-xs text-muted-foreground mt-1">{t("multiple_images_hint")}</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          className="hidden"
        />
      </div>

      {images.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={images} strategy={rectSortingStrategy}>
            <div className="flex flex-wrap gap-2 mt-3">
              {images.map((url, i) => (
                <SortableImage key={url} url={url} index={i} onRemove={() => removeAt(i)} coverLabel={t("cover_badge")} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
