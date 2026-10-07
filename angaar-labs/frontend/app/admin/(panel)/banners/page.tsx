"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Image as ImageIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BulkActions, SelectAll, SelectRow, useSelection } from "@/components/admin/bulk";
import { ImageField } from "@/components/admin/image-field";
import { EmptyState, PageHeader, StatusBadge } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ButtonSpinner } from "@/components/custom/loaders";

type Platform = "DESKTOP" | "MOBILE";
type BannerState = "LIVE" | "HIDDEN" | "SCHEDULED" | "ENDED";

/** A picture at the top of the store's home page. Dates are calendar days (yyyy-MM-dd) in India time. */
type Banner = {
  id: number; title: string | null; imageUrl: string; linkUrl: string | null; platform: Platform;
  sortOrder: number; isActive: boolean; startsOn: string | null; endsOn: string | null; state: BannerState;
};

type Draft = {
  id: number | null; title: string; imageUrl: string; linkUrl: string; platform: Platform;
  isActive: boolean; startsOn: string; endsOn: string;
};

const PLATFORMS: { value: Platform; label: string; hint: string }[] = [
  { value: "DESKTOP", label: "Desktop", hint: "Shown on computers and tablets" },
  { value: "MOBILE", label: "Mobile", hint: "Shown on phones" },
];

const STATE: Record<BannerState, { label: string; tone: string }> = {
  LIVE: { label: "Showing", tone: "ACTIVE" },
  HIDDEN: { label: "Hidden", tone: "ARCHIVED" },
  SCHEDULED: { label: "Not started yet", tone: "CONFIRMED" },
  ENDED: { label: "Ended", tone: "PENDING" },
};

// midday in India, so the day reads the same in whichever timezone the admin is showing
const showDay = (day: string) => formatDate(`${day}T12:00:00+05:30`);

const dateLine = (banner: Banner) =>
  banner.startsOn && banner.endsOn ? `${showDay(banner.startsOn)} to ${showDay(banner.endsOn)}`
  : banner.startsOn ? `From ${showDay(banner.startsOn)}`
  : banner.endsOn ? `Until ${showDay(banner.endsOn)}`
  : "No dates set, shows all the time";

const nameOf = (banner: Banner, position: number) => banner.title ?? `banner ${position}`;

export default function BannersPage() {
  const queryClient = useQueryClient();
  const [platform, setPlatform] = useState<Platform>("DESKTOP");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<{ banner: Banner; position: number } | null>(null);

  const { data, isPending, isError } = useQuery({ queryKey: ["banners"], queryFn: () => api<{ items: Banner[] }>("/admin/banners") });
  const byPlatform = useMemo(() => {
    const groups: Record<Platform, Banner[]> = { DESKTOP: [], MOBILE: [] };
    for (const banner of data?.items ?? []) groups[banner.platform]?.push(banner);
    return groups;
  }, [data]);
  const shown = byPlatform[platform];
  const shownIds = useMemo(() => shown.map((banner) => banner.id), [shown]);
  const selection = useSelection(shownIds);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["banners"] });

  const save = useMutation({
    mutationFn: (d: Draft) =>
      api<Banner>(d.id ? `/admin/banners/${d.id}` : "/admin/banners", {
        method: d.id ? "PATCH" : "POST",
        body: {
          title: d.title, imageUrl: d.imageUrl, linkUrl: d.linkUrl.trim(), platform: d.platform, isActive: d.isActive,
          startsOn: d.startsOn || null, endsOn: d.endsOn || null,
        },
      }),
    onSuccess: (banner, d) => {
      toast.success(d.id ? "Banner updated" : "Banner added");
      setDraft(null);
      setPlatform(banner.platform);
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const reorder = useMutation({
    mutationFn: (ids: number[]) => api("/admin/banners/reorder", { method: "POST", body: { ids } }),
    onSuccess: () => refresh(),
    onError: (err) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: (banner: Banner) => api(`/admin/banners/${banner.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Banner deleted");
      setDeleting(null);
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  /** Swaps a banner with the one before or after it and saves the new order. */
  const move = (index: number, by: -1 | 1) => {
    const ids = shown.map((banner) => banner.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    reorder.mutate(ids);
  };

  const add = () => setDraft({ id: null, title: "", imageUrl: "", linkUrl: "", platform, isActive: true, startsOn: "", endsOn: "" });
  const edit = (banner: Banner) =>
    setDraft({
      id: banner.id, title: banner.title ?? "", imageUrl: banner.imageUrl, linkUrl: banner.linkUrl ?? "", platform: banner.platform,
      isActive: banner.isActive, startsOn: banner.startsOn ?? "", endsOn: banner.endsOn ?? "",
    });

  const datesWrong = Boolean(draft?.startsOn && draft.endsOn && draft.endsOn < draft.startsOn);

  return (
    <>
      <PageHeader title="Banners" description="The large pictures at the top of the store's home page. Phones and computers each have their own set.">
        <Button className="h-9" onClick={add}><Plus /> Add banner</Button>
      </PageHeader>

      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Where the banners show">
        {PLATFORMS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={platform === tab.value}
            title={tab.hint}
            onClick={() => setPlatform(tab.value)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
              platform === tab.value ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-surface-2",
            )}
          >
            {tab.label}
            <span className={cn("text-xs ledger", platform === tab.value ? "opacity-80" : "text-muted-foreground")}>{formatNumber(byPlatform[tab.value].length)}</span>
          </button>
        ))}
      </div>

      {isError ? (
        <Card><p className="py-16 text-center text-sm text-muted-foreground">Could not load banners. Check that the backend is running.</p></Card>
      ) : isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-64" />)}</div>
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState
            icon={ImageIcon}
            title={`No ${platform === "DESKTOP" ? "desktop" : "mobile"} banners yet`}
            description="Add a banner and it will appear at the top of the store's home page."
          />
        </Card>
      ) : (
        <>
          <div className="mb-3 flex min-h-9 flex-wrap items-center gap-x-4 gap-y-2">
            <SelectAll selection={selection} noun="banners" />
            <p className="text-sm text-muted-foreground">
              {PLATFORMS.find((p) => p.value === platform)?.hint}, in this order. Use the arrows to change the order.
            </p>
            <BulkActions table="banners" noun="banners" selection={selection} exportable={false} refresh={["banners"]} deleteNote="They come off the store's home page at once." />
          </div>
          <ol className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {shown.map((banner, index) => {
              const position = index + 1;
              const name = nameOf(banner, position);
              return (
                <li key={banner.id}>
                  <Card className={cn("h-full gap-0 overflow-hidden py-0", selection.has(banner.id) && "ring-2 ring-primary")}>
                    <div className="relative aspect-[2/1] bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element -- uploaded or remote banner of unknown size */}
                      <img src={banner.imageUrl} alt={banner.title ?? ""} loading="lazy" className={cn("size-full object-contain", banner.state !== "LIVE" && "opacity-60")} />
                      <span className="absolute top-2 left-2 flex size-6 items-center justify-center rounded-full bg-background/90 text-xs font-semibold ledger shadow-sm">{position}</span>
                      <span className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-md bg-background/90 shadow-sm"><SelectRow selection={selection} id={banner.id} label={name} /></span>
                    </div>
                    <div className="grid flex-1 content-start gap-1 p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn("min-w-0 truncate font-medium", !banner.title && "font-normal text-muted-foreground")}>{banner.title ?? "No title"}</p>
                        <StatusBadge status={STATE[banner.state].tone} label={STATE[banner.state].label} className="shrink-0" />
                      </div>
                      {banner.linkUrl ? (
                        <a href={banner.linkUrl} target="_blank" rel="noreferrer" className="truncate text-xs text-primary hover:underline" title={banner.linkUrl}>
                          Opens {banner.linkUrl}
                        </a>
                      ) : (
                        <p className="text-xs text-muted-foreground">No link, the banner is not clickable</p>
                      )}
                      <p className="text-xs text-muted-foreground">{dateLine(banner)}</p>
                    </div>
                    <div className="flex items-center gap-1 border-t px-2 py-1.5">
                      <Button variant="ghost" size="icon-sm" aria-label={`Move ${name} earlier`} title="Move earlier" disabled={index === 0 || reorder.isPending} onClick={() => move(index, -1)}>
                        <ArrowUp />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Move ${name} later`} title="Move later" disabled={index === shown.length - 1 || reorder.isPending} onClick={() => move(index, 1)}>
                        <ArrowDown />
                      </Button>
                      <Button variant="ghost" size="sm" className="ml-auto" onClick={() => edit(banner)}><Pencil /> Edit</Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleting({ banner, position })}><Trash2 /> Delete</Button>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ol>
        </>
      )}

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit banner" : "Add banner"}</DialogTitle>
            <DialogDescription>A wide picture works best, about twice as wide as it is tall.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <form
              id="banner-form" className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!draft.imageUrl.trim()) return toast.error("Upload the banner image first");
                save.mutate(draft);
              }}
            >
              <ImageField label="Banner image" folder="banners" value={draft.imageUrl} onChange={(imageUrl) => setDraft({ ...draft, imageUrl })} />
              <div className="grid gap-1.5">
                <Label htmlFor="banner-title">Title</Label>
                <Input id="banner-title" maxLength={200} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="For example: Diwali offer" />
                <p className="text-xs text-muted-foreground">Helps you tell banners apart, and is read out to shoppers who cannot see the picture.</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="banner-link">Link (optional)</Label>
                <Input id="banner-link" value={draft.linkUrl} onChange={(e) => setDraft({ ...draft, linkUrl: e.target.value })} placeholder="https://… or a store page such as /products" />
                <p className="text-xs text-muted-foreground">Where a shopper goes when they click the banner.</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="banner-platform">Show on</Label>
                <Select value={draft.platform} onValueChange={(v) => setDraft({ ...draft, platform: v as Platform })}>
                  <SelectTrigger id="banner-platform" className="h-9 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="banner-start">Start date (optional)</Label>
                  <Input id="banner-start" type="date" value={draft.startsOn} max={draft.endsOn || undefined} onChange={(e) => setDraft({ ...draft, startsOn: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="banner-end">End date (optional)</Label>
                  <Input id="banner-end" type="date" value={draft.endsOn} min={draft.startsOn || undefined} aria-invalid={datesWrong ? true : undefined} onChange={(e) => setDraft({ ...draft, endsOn: e.target.value })} />
                </div>
                <p className={cn("-mt-2 text-xs sm:col-span-2", datesWrong ? "text-destructive" : "text-muted-foreground")}>
                  {datesWrong ? "The end date is before the start date." : "Leave both empty to show the banner all the time. Days are counted in India time."}
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={draft.isActive} onCheckedChange={(checked) => setDraft({ ...draft, isActive: checked === true })} />
                Show on the store
              </label>
            </form>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button type="submit" form="banner-form" loading={save.isPending} disabled={datesWrong}>{draft?.id ? "Save changes" : "Add banner"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting ? nameOf(deleting.banner, deleting.position) : "banner"}?</DialogTitle>
            <DialogDescription>
              It is removed from the store straight away and cannot be brought back. To take it off the store for a while, edit it and untick “Show on the store” instead.
            </DialogDescription>
          </DialogHeader>
          {deleting ? (
            // eslint-disable-next-line @next/next/no-img-element -- uploaded or remote banner of unknown size
            <img src={deleting.banner.imageUrl} alt="" className="max-h-40 w-full rounded-md border bg-muted object-contain" />
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!deleting || remove.isPending} onClick={() => deleting && remove.mutate(deleting.banner)}>
              {remove.isPending ? <ButtonSpinner /> : null}Delete banner
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
