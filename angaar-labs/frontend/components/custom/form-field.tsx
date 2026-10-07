"use client";

import { Eye, EyeOff, Minus, Plus, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Switch } from "@/components/ui/switch";
import { Shortcut } from "./kbd";
import { Num } from "./number";
import { cn } from "@/lib/utils";

// The form pieces every panel repeats: a labelled field, tick and switch rows, the +91 phone box,
// the code boxes, a password with an eye, the debounced search, and a quantity stepper.

export function OptionalMark() {
  return <span className="text-xs font-normal text-muted-foreground italic">(optional)</span>;
}

/** Label, control, hint and error, always linked by id. `children` may be a function taking the id. */
export function FormField({ label, htmlFor, hint, error, optional, className, children }: {
  label: React.ReactNode; htmlFor?: string; hint?: React.ReactNode; error?: React.ReactNode; optional?: boolean; className?: string;
  children: ((id: string) => React.ReactNode) | React.ReactNode;
}) {
  const generated = useId();
  const id = htmlFor ?? generated;
  return (
    <Field className={cn("gap-1.5", className)} data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}{optional ? <OptionalMark /> : null}</FieldLabel>
      {typeof children === "function" ? children(id) : children}
      {hint && !error ? <FieldDescription>{hint}</FieldDescription> : null}
      {error ? <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive"><X className="size-3.5 shrink-0" />{error}</p> : null}
    </Field>
  );
}

const rowClass = (bordered: boolean | undefined, checked: boolean, disabled: boolean | undefined) =>
  cn(
    "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
    bordered && "border border-border",
    bordered && checked && "border-primary/40 bg-primary-soft/40",
    bordered && !disabled && "hover:bg-surface-2",
    disabled && "opacity-60",
  );

export function CheckboxRow({ label, hint, checked, onCheckedChange, disabled, bordered, className }: { label: React.ReactNode; hint?: React.ReactNode; checked: boolean; onCheckedChange: (checked: boolean) => void; disabled?: boolean; bordered?: boolean; className?: string }) {
  return (
    <label className={cn(rowClass(bordered, checked, disabled), className)}>
      <Checkbox checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} disabled={disabled} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}

export function SwitchRow({ label, hint, checked, onCheckedChange, disabled, bordered, className }: { label: React.ReactNode; hint?: React.ReactNode; checked: boolean; onCheckedChange: (checked: boolean) => void; disabled?: boolean; bordered?: boolean; className?: string }) {
  return (
    <label className={cn(rowClass(bordered, checked, disabled), className)}>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className="shrink-0" />
    </label>
  );
}

export function PhoneField({ value, onChange, id, autoFocus, disabled, className, ...props }: { value: string; onChange: (digits: string) => void; id?: string; autoFocus?: boolean; disabled?: boolean; className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <InputGroup className={cn("h-10", className)}>
      <InputGroupAddon><InputGroupText>+91</InputGroupText></InputGroupAddon>
      <InputGroupInput
        id={id} type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="10-digit mobile number" maxLength={10}
        value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 10))} autoFocus={autoFocus} disabled={disabled} className="ledger text-base"
        {...props}
      />
    </InputGroup>
  );
}

/** The boxes for a one-time code: typing moves on, pasting fills them all, Backspace walks back. */
export function OtpField({ length = 6, value, onChange, autoFocus, disabled, className }: { length?: 4 | 6; value: string; onChange: (code: string) => void; autoFocus?: boolean; disabled?: boolean; className?: string }) {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (index: number) => boxes.current[Math.max(0, Math.min(length - 1, index))]?.focus();
  const put = (index: number, text: string) => {
    const digits = text.replace(/\D/g, "");
    if (!digits) return;
    const next = (value.slice(0, index) + digits + value.slice(index + digits.length)).slice(0, length);
    onChange(next);
    focus(index + digits.length);
  };
  return (
    <div className={cn("flex justify-between gap-2", className)} role="group" aria-label={`The ${length}-digit code`}>
      {Array.from({ length }, (_, index) => (
        <input
          key={index}
          ref={(element) => { boxes.current[index] = element; }}
          inputMode="numeric" autoComplete={index === 0 ? "one-time-code" : "off"} maxLength={length} disabled={disabled} autoFocus={autoFocus && index === 0}
          aria-label={`Digit ${index + 1}`} value={value[index] ?? ""}
          onChange={(e) => put(index, e.target.value)}
          onPaste={(e) => { e.preventDefault(); put(0, e.clipboardData.getData("text")); }}
          onKeyDown={(e) => {
            if (e.key === "Backspace") { e.preventDefault(); const at = value[index] ? index : index - 1; if (at >= 0) { onChange(value.slice(0, at)); focus(at); } }
            if (e.key === "ArrowLeft") focus(index - 1);
            if (e.key === "ArrowRight") focus(index + 1);
          }}
          onFocus={(e) => e.target.select()}
          className="font-display ledger h-11 w-full min-w-0 rounded-lg border border-input bg-card text-center text-xl font-medium outline-none focus:border-ring focus:ring-3 focus:ring-ring/50 disabled:opacity-60"
        />
      ))}
    </div>
  );
}

export function PasswordField({ id, className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  const [shown, setShown] = useState(false);
  return (
    <InputGroup className={cn("h-10", className)}>
      <InputGroupInput id={id} type={shown ? "text" : "password"} autoComplete="current-password" {...props} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown} onClick={() => setShown((s) => !s)}>
          {shown ? <EyeOff /> : <Eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

/** Reports the value 350ms after typing stops; follows an outside reset at once. */
export function SearchField({ value, onChange, placeholder, className, shortcut, autoFocus }: { value: string; onChange: (value: string) => void; placeholder: string; className?: string; shortcut?: string[]; autoFocus?: boolean }) {
  const [text, setText] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(value);
  }
  useEffect(() => {
    if (text === value) return;
    const timer = setTimeout(() => onChange(text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text, value, onChange]);
  return (
    <InputGroup className={cn("h-9 bg-card", className)}>
      <InputGroupAddon><Search /></InputGroupAddon>
      <InputGroupInput type="search" role="searchbox" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} className="[&::-webkit-search-cancel-button]:hidden" />
      <InputGroupAddon align="inline-end">
        {text ? (
          <InputGroupButton aria-label="Clear search" onClick={() => setText("")}><X /></InputGroupButton>
        ) : shortcut ? (
          <Shortcut keys={shortcut} size="xs" />
        ) : null}
      </InputGroupAddon>
    </InputGroup>
  );
}

const STEPPER = { sm: "h-7 [&_button]:size-7", md: "h-8 [&_button]:size-8", lg: "h-10 [&_button]:size-10" };

export function QuantityStepper({ value, onChange, min = 1, max, size = "md", labelNoun, disabled, className }: { value: number; onChange: (value: number) => void; min?: number; max?: number; size?: "sm" | "md" | "lg"; labelNoun: string; disabled?: boolean; className?: string }) {
  const canLess = !disabled && value > min;
  const canMore = !disabled && (max === undefined || value < max);
  const iconClass = cn("flex items-center justify-center text-foreground transition-colors not-disabled:hover:bg-surface-2 disabled:opacity-40", size === "sm" ? "[&_svg]:size-3.5" : "[&_svg]:size-4");
  return (
    <div className={cn("inline-flex items-center rounded-full border border-foreground/18 bg-card", STEPPER[size], className)} role="group" aria-label={`Quantity of ${labelNoun}`}>
      <button type="button" aria-label={`Remove one ${labelNoun}`} disabled={!canLess} onClick={() => onChange(value - 1)} className={cn(iconClass, "rounded-l-full")}><Minus /></button>
      <span className={cn("ledger min-w-8 text-center font-medium", size === "lg" ? "text-base" : "text-sm")} aria-live="polite"><Num value={value} /></span>
      <button type="button" aria-label={`Add one ${labelNoun}`} disabled={!canMore} onClick={() => onChange(value + 1)} className={cn(iconClass, "rounded-r-full")}><Plus /></button>
    </div>
  );
}

export { Input };
