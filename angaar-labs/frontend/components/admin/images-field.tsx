"use client";

import { ChevronLeft, ChevronRight, ImagePlus, Link2, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type UploadFolder, uploadImage } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/custom/loaders";

/**
 * Several images in order, for a product gallery. Upload many at once (or drop them on the box),
 * paste a link, reorder with the arrows, remove with the cross. The first image is the main one.
 */
export function ImagesField({
  value, onChange, folder, max = 12,
}: { value: string[]; onChange: (urls: string[]) => void; folder: UploadFolder; max?: number }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0); // uploads in flight
  const [dragging, setDragging] = useState(false);
  const [link, setLink] = useState<string | null>(null); // null = link box closed

  const addFiles = async (files: FileList | null) => {
    const picked = [...(files ?? [])].slice(0, max - value.length);
    if (picked.length === 0) return;
    setBusy(picked.length);
    const added: string[] = [];
    for (const file of picked) {
      try {
        added.push(await uploadImage(file, folder));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      }
      setBusy((left) => left - 1);
    }
    onChange([...value, ...added]);
    if (fileInput.current) fileInput.current.value = "";
  };

  const move = (index: number, by: number) => {
    const next = [...value];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onChange(next);
  };

  const addLink = () => {
    const url = (link ?? "").trim();
    if (!/^https?:\/\//i.test(url)) return toast.error("Enter a full link starting with https://");
    onChange([...value, url]);
    setLink(null);
  };

  const full = value.length >= max;

  return (
    <div className="grid gap-3">
      <div
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}
        className={cn("grid grid-cols-3 gap-3 rounded-lg border border-dashed p-3 transition-colors sm:grid-cols-4 lg:grid-cols-5", dragging && "border-primary bg-primary/5")}
      >
        {value.map((url, index) => (
          <div key={`${url}-${index}`} className="group relative aspect-square overflow-hidden rounded-md border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element -- gallery images of unknown size */}
            <img src={url} alt="" className="size-full object-contain" />
            {index === 0 ? <span className="absolute top-1 left-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">Main</span> : null}
            <div className="absolute inset-x-1 bottom-1 flex justify-between opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
              <span className="flex gap-1">
                <Button type="button" size="icon-xs" variant="secondary" aria-label="Move earlier" disabled={index === 0} onClick={() => move(index, -1)}><ChevronLeft /></Button>
                <Button type="button" size="icon-xs" variant="secondary" aria-label="Move later" disabled={index === value.length - 1} onClick={() => move(index, 1)}><ChevronRight /></Button>
              </span>
              <Button type="button" size="icon-xs" variant="destructive" aria-label="Remove image" onClick={() => onChange(value.filter((_, i) => i !== index))}><X /></Button>
            </div>
          </div>
        ))}
        {Array.from({ length: busy }, (_, i) => (
          <div key={`busy-${i}`} className="flex aspect-square items-center justify-center rounded-md border bg-muted text-muted-foreground">
            <Spinner size="md" />
          </div>
        ))}
        {full ? null : (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed text-muted-foreground hover:border-primary hover:text-primary"
          >
            <ImagePlus className="size-5" />
            <span className="text-xs">Upload</span>
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-xs text-muted-foreground">
          JPG, PNG, WebP or GIF, up to 5 MB each. Drop files on the box, or upload several at once. The first image is the main one.
        </p>
        {full ? null : (
          <Button type="button" size="sm" variant="ghost" onClick={() => setLink(link === null ? "" : null)}>
            <Link2 /> Paste a link
          </Button>
        )}
      </div>
      {link !== null ? (
        <div className="flex gap-2">
          <Input type="url" placeholder="https://…" value={link} autoFocus onChange={(event) => setLink(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addLink(); } }} />
          <Button type="button" variant="outline" onClick={addLink}>Add</Button>
        </div>
      ) : null}
      <input ref={fileInput} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={(event) => addFiles(event.target.files)} />
    </div>
  );
}
