import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { IconTile } from "./icon-tile";
import { Illustration, type IllustrationName } from "./illustration";
import { cn } from "@/lib/utils";

// What a list says when there is nothing in it, when it could not load, or when the door is locked.

const SIZE = { sm: 64, md: 112, lg: 136 };

export function EmptyState({
  illustration, icon, title, description, action, secondaryAction, size = "md", bordered, variant = "empty", onRetry, links, className,
}: {
  illustration?: IllustrationName; icon?: LucideIcon; title: string; description?: string; action?: React.ReactNode; secondaryAction?: React.ReactNode;
  size?: "sm" | "md" | "lg"; bordered?: boolean; variant?: "empty" | "error" | "locked" | "done"; onRetry?: () => void;
  links?: { label: string; href: string }[]; className?: string;
}) {
  const drawing: IllustrationName | undefined = illustration ?? (variant === "error" ? "error" : variant === "locked" ? "locked" : variant === "done" ? "caught-up" : undefined);
  const media = drawing ? (
    <Illustration name={drawing} size={SIZE[size]} className={cn(variant === "error" && "text-terracotta", variant === "done" && "text-success")} />
  ) : icon ? (
    <IconTile icon={icon} tone={variant === "error" ? "danger" : variant === "done" ? "success" : "neutral"} size={size === "sm" ? "sm" : "lg"} />
  ) : null;

  if (size === "sm") {
    return (
      <div className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm", bordered && "border border-dashed border-foreground/18", className)}>
        {media ? <span className="shrink-0 [&_svg]:size-8">{media}</span> : null}
        <div className="min-w-0 flex-1">
          <p className="font-medium">{title}</p>
          {description ? <p className="truncate text-muted-foreground">{description}</p> : null}
        </div>
        {action}
        {variant === "error" && onRetry ? <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button> : null}
      </div>
    );
  }

  return (
    <Empty className={cn(size === "lg" ? "py-16" : "py-10", bordered && "border border-dashed border-foreground/18", className)}>
      <EmptyHeader>
        {media ? <EmptyMedia>{media}</EmptyMedia> : null}
        <EmptyTitle className="font-display text-lg font-medium tracking-normal">{title}</EmptyTitle>
        {description ? <EmptyDescription className="max-w-sm text-pretty">{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action || secondaryAction || (variant === "error" && onRetry) || links?.length ? (
        <EmptyContent>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {action}
            {secondaryAction}
            {variant === "error" && onRetry ? <Button variant="outline" onClick={onRetry}>Try again</Button> : null}
          </div>
          {links?.length ? (
            <div className="flex flex-wrap justify-center gap-1.5">
              {links.map((link) => (
                <Button key={link.href} asChild variant="outline" size="sm" className="rounded-full">
                  <Link href={link.href}>{link.label}</Link>
                </Button>
              ))}
            </div>
          ) : null}
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
