"use client";

import { useState } from "react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Callout } from "./callout";
import { EmptyState } from "./empty-state";
import { Shortcut } from "./kbd";
import { TableSkeleton } from "./loaders";
import { StatusPill } from "./status-pill";
import type { StatusKind } from "./status-registry";
import { cn } from "@/lib/utils";

// The four overlays every panel repeats: "are you sure", "why", a form in a box, a detail sheet.

type ConfirmProps = {
  open: boolean; onOpenChange: (open: boolean) => void; title: React.ReactNode; description?: React.ReactNode; tone?: "default" | "destructive";
  confirmLabel: string; cancelLabel?: string; pending?: boolean; blockedReason?: string;
};

export function ConfirmDialog({ open, onOpenChange, title, description, tone = "default", confirmLabel, cancelLabel = "Cancel", pending, blockedReason, onConfirm, children }: ConfirmProps & { onConfirm: () => void; children?: React.ReactNode }) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {blockedReason ? (
            <Callout tone="warning" className="mt-2">{blockedReason}</Callout>
          ) : description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter className="items-center">
          <Shortcut keys={["Esc"]} label="to cancel" size="xs" className="mr-auto hidden sm:flex" />
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <Button variant={tone === "destructive" ? "destructive" : "default"} loading={pending} disabled={Boolean(blockedReason)} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ReasonDialog({ placeholder, minLength = 10, required = true, onConfirm, ...props }: ConfirmProps & { placeholder: string; minLength?: number; required?: boolean; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const short = required && reason.trim().length < minLength;
  const close = (next: boolean) => { if (!next) setReason(""); props.onOpenChange(next); };
  return (
    <ConfirmDialog {...props} onOpenChange={close} onConfirm={() => !short && onConfirm(reason.trim())}>
      <div className="space-y-1.5">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={placeholder} rows={3} autoFocus aria-label={placeholder} />
        <p className={cn("text-xs", short ? "text-muted-foreground" : "text-success")}>
          {required ? (short ? `${Math.max(0, minLength - reason.trim().length)} more characters` : "Thanks, that is enough") : "Optional"}
        </p>
      </div>
    </ConfirmDialog>
  );
}

const SIZE = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" };

/** A form in a box: scrolls inside, the footer stays put, the submit button lives outside the form via `form={formId}`. */
export function FormDialog({ open, onOpenChange, title, description, formId, submitLabel, pending, size = "md", onSubmit, footerStart, children }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: React.ReactNode; description?: React.ReactNode; formId: string; submitLabel: string; pending?: boolean;
  size?: keyof typeof SIZE; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; footerStart?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className={cn("flex max-h-[calc(100dvh-2rem)] flex-col gap-0 p-0", SIZE[size])}>
        <DialogHeader className="border-b border-foreground/18 px-5 py-4">
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form id={formId} onSubmit={onSubmit} className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scroll-thin">
          {children}
        </form>
        <DialogFooter className="items-center border-t border-foreground/18 bg-surface-2 px-5 py-3 sm:justify-between">
          <div className="text-xs text-muted-foreground">{footerStart}</div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" form={formId} loading={pending}>{submitLabel}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A side sheet with a sticky header holding the status and the actions, so they never scroll away. */
export function DetailSheet({ open, onClose, title, description, status, loading, failed, onRetry, actions, wide, children }: {
  open: boolean; onClose: () => void; title: React.ReactNode; description?: React.ReactNode; status?: { status: string; kind?: StatusKind; label?: string };
  loading?: boolean; failed?: boolean; onRetry?: () => void; actions?: React.ReactNode; wide?: boolean; children?: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className={cn("gap-0 p-0", wide ? "data-[side=right]:sm:max-w-2xl" : "data-[side=right]:sm:max-w-lg")}>
        <SheetHeader className="sticky top-0 z-10 border-b border-foreground/18 bg-popover px-5 py-4 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle className="min-w-0">{title}</SheetTitle>
            {status ? <StatusPill {...status} size="md" /> : null}
          </div>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
          {actions ? <div className="mt-2 flex flex-wrap items-center gap-2">{actions}</div> : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scroll-thin">
          {failed ? <EmptyState variant="error" title="Could not load this" description="Check the connection and try again." onRetry={onRetry} /> : loading ? <TableSkeleton rows={6} cols={2} /> : children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
