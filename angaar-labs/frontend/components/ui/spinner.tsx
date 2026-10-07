import { cn } from "cn"

// A thin ring with a terracotta arc; keeps the data-slot and the status role of the shadcn spinner.
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      viewBox="0 0 24 24"
      fill="none"
      className={cn("size-4 shrink-0 animate-spin", className)}
      {...props}
    >
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeOpacity="0.15" strokeWidth="2.5" />
      <path d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5" stroke="var(--terracotta)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export { Spinner }
