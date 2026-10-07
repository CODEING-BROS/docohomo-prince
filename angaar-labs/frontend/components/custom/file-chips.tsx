import { FileText, ImageIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Reports and photos attached to a consultation. They are private files: each opens through a
// signed-in address (the patient's, the doctor's or the staff one), never a public link.

export type AttachedFile = { id: number; fileName: string; kind: string; size: number };

const sizeOf = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export function FileChips({ files, hrefOf, onRemove, thumbnails, className }: {
  files: AttachedFile[]; hrefOf: (file: AttachedFile) => string; onRemove?: (file: AttachedFile) => void;
  /** show a small preview of photos; only where the viewer may load them (the patient's own uploads) */
  thumbnails?: boolean; className?: string;
}) {
  if (!files.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-2", className)}>
      {files.map((file) => {
        const photo = file.kind !== "pdf";
        return (
          <li key={file.id} className="flex max-w-full items-center gap-2 rounded-lg border border-foreground/18 bg-card py-1.5 pr-2 pl-1.5 text-sm">
            <a href={hrefOf(file)} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 rounded-md underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
              {photo && thumbnails ? (
                // eslint-disable-next-line @next/next/no-img-element -- a private file served by the API to its owner
                <img src={hrefOf(file)} alt="" className="size-9 shrink-0 rounded-md border object-cover" />
              ) : (
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted-foreground">{photo ? <ImageIcon className="size-4" /> : <FileText className="size-4" />}</span>
              )}
              <span className="min-w-0">
                <span className="block max-w-48 truncate font-medium">{file.fileName}</span>
                <span className="ledger block text-xs text-muted-foreground">{photo ? "Photo" : "PDF"} · {sizeOf(file.size)}</span>
              </span>
            </a>
            {onRemove ? (
              <button type="button" aria-label={`Remove ${file.fileName}`} onClick={() => onRemove(file)} className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
                <X className="size-4" />
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
