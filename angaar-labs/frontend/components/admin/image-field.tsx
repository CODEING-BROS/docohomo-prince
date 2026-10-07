"use client";

import { ImagePlus, Link2, Trash2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type UploadFolder as Folder, uploadImage } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/custom/loaders";

/**
 * An image input used by every admin form: upload a file from this device (or drop it on the box),
 * or paste a link instead. `value` is the image address, empty when there is none.
 */
export function ImageField({
  label, value, onChange, folder, hint = "JPG, PNG, WebP or GIF, up to 5 MB",
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  folder: Folder;
  hint?: string;
}) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pasting, setPasting] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await uploadImage(file, folder));
      setPasting(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); upload(event.dataTransfer.files[0]); }}
        className={cn("flex items-center gap-3 rounded-lg border border-dashed p-3 transition-colors", dragging && "border-primary bg-primary/5")}
      >
        <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground">
          {busy ? (
            <Spinner size="md" />
          ) : value ? (
            // eslint-disable-next-line @next/next/no-img-element -- preview of an uploaded or pasted image of unknown size
            <img src={value} alt="" className="size-full object-contain" />
          ) : (
            <ImagePlus className="size-5" />
          )}
        </span>
        <div className="grid min-w-0 flex-1 gap-1.5">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>
              <ImagePlus /> {value ? "Replace" : "Upload image"}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setPasting((current) => !current)}>
              <Link2 /> Paste a link
            </Button>
            {value ? (
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => onChange("")}>
                <Trash2 /> Remove
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{hint}. You can also drop a file here.</p>
        </div>
      </div>
      {pasting ? (
        <Input type="url" placeholder="https://…" value={value.startsWith("/uploads/") ? "" : value} onChange={(event) => onChange(event.target.value)} autoFocus />
      ) : null}
      <input id={id} ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={(event) => upload(event.target.files?.[0])} />
    </div>
  );
}
