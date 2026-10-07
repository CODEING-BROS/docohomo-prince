"use client";

import { FileText, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { uploadDocument } from "@/lib/upload";
import { Spinner } from "@/components/custom/loaders";

export type DocumentDraft = { type: string; fileUrl: string; fileName: string };

/**
 * A checklist of proofs. Each line is one kind of document with its own upload button;
 * `required` only marks the line, the form decides whether to insist on it.
 */
export function DocumentsField({
  kinds, value, onChange, uploader = uploadDocument,
}: {
  kinds: { type: string; label: string; hint?: string; required?: boolean }[];
  value: DocumentDraft[];
  onChange: (documents: DocumentDraft[]) => void;
  uploader?: (file: File) => Promise<string>; // where the file is sent; staff upload by default
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingType, setPendingType] = useState<string | null>(null); // which line the file picker was opened for
  const [busyType, setBusyType] = useState<string | null>(null);

  const pick = (type: string) => {
    setPendingType(type);
    fileInput.current?.click();
  };

  const upload = async (file: File | undefined) => {
    const type = pendingType;
    if (fileInput.current) fileInput.current.value = "";
    if (!file || !type) return;
    setBusyType(type);
    try {
      const fileUrl = await uploader(file);
      onChange([...value.filter((doc) => doc.type !== type), { type, fileUrl, fileName: file.name }]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusyType(null);
    }
  };

  return (
    <div className="grid gap-2">
      {kinds.map((kind) => {
        const doc = value.find((d) => d.type === kind.type);
        const busy = busyType === kind.type;
        return (
          <div key={kind.type} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              {busy ? <Spinner size="md" /> : <FileText className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {kind.label}
                {kind.required ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">needed to approve</span> : null}
              </p>
              {doc ? (
                uploader === uploadDocument
                  ? <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="block truncate text-xs text-primary hover:underline">{doc.fileName}</a>
                  : <p className="truncate text-xs text-success">{doc.fileName} uploaded</p>
              ) : (
                <p className="truncate text-xs text-muted-foreground">{kind.hint ?? "PDF or photo, up to 5 MB"}</p>
              )}
            </div>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => pick(kind.type)}>
              <Upload /> {doc ? "Replace" : "Upload"}
            </Button>
            {doc ? (
              <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${kind.label}`} onClick={() => onChange(value.filter((d) => d.type !== kind.type))}>
                <X />
              </Button>
            ) : null}
          </div>
        );
      })}
      <input ref={fileInput} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => upload(event.target.files?.[0])} />
    </div>
  );
}
