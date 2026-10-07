"use client";

import { Bold, Heading2, Heading3, Italic, Link2, Link2Off, List, ListOrdered, type LucideIcon, Pilcrow, RemoveFormatting } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// How an article looks while it is being written. Colours saved with older posts are ignored so the text stays readable in the dark theme.
const ARTICLE = cn(
  "text-sm leading-relaxed [&_*]:bg-transparent! [&_:is(span,strong,em,p,li)]:text-inherit!",
  "[&_h2]:mt-4 [&_h2]:mb-1.5 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-base [&_h3]:font-semibold",
  "[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
);

// What is kept from text pasted in from Word, Google Docs or a web page, and what it becomes. Everything else is dropped, its text is kept.
const KEEP: Record<string, string> = {
  P: "p", H1: "h2", H2: "h2", H3: "h3", H4: "h3", H5: "h3", H6: "h3", STRONG: "strong", B: "strong", EM: "em", I: "em", U: "u",
  UL: "ul", OL: "ol", LI: "li", A: "a", BR: "br", BLOCKQUOTE: "blockquote",
};
const DROP = new Set(["SCRIPT", "STYLE", "TITLE", "META", "LINK", "IFRAME", "OBJECT", "SVG", "IMG", "BUTTON", "INPUT"]);
const BLOCKS = "p,div,h1,h2,h3,h4,h5,h6,ul,ol,blockquote,table";
const SAFE_LINK = /^(https?:\/\/|mailto:|tel:|\/)/i;

/** The tag a pasted element is kept as, or nothing when only its text is kept. */
const tagFor = (element: HTMLElement): string | undefined => {
  // a box with only words in it is a paragraph
  if (element.tagName === "DIV") return element.querySelector(BLOCKS) ? undefined : "p";
  // Google Docs wraps the whole copy in a "bold" tag that is not bold
  if (element.tagName === "B" && /font-weight:\s*normal/i.test(element.getAttribute("style") ?? "")) return undefined;
  if (element.tagName === "A" && !SAFE_LINK.test(element.getAttribute("href") ?? "")) return undefined;
  return KEEP[element.tagName];
};

const tidyInto = (from: Node, into: HTMLElement, doc: Document) => {
  from.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      into.appendChild(doc.createTextNode(child.textContent ?? ""));
      return;
    }
    if (!(child instanceof HTMLElement) || DROP.has(child.tagName)) return;
    const tag = tagFor(child);
    if (!tag) {
      tidyInto(child, into, doc);
      return;
    }
    const kept = doc.createElement(tag);
    if (tag === "a") kept.setAttribute("href", child.getAttribute("href") ?? "");
    tidyInto(child, kept, doc);
    into.appendChild(kept);
  });
};

/** Pasted text with only headings, bold, italics, lists and links left in. */
const tidyPaste = (html: string) => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out = doc.createElement("div");
  tidyInto(doc.body, out, doc);
  return out.innerHTML;
};

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const TOOLS: { icon: LucideIcon; label: string; command: string; argument?: string; gapBefore?: boolean }[] = [
  { icon: Heading2, label: "Heading", command: "formatBlock", argument: "h2" },
  { icon: Heading3, label: "Smaller heading", command: "formatBlock", argument: "h3" },
  { icon: Pilcrow, label: "Normal text", command: "formatBlock", argument: "p" },
  { icon: Bold, label: "Bold", command: "bold", gapBefore: true },
  { icon: Italic, label: "Italic", command: "italic" },
  { icon: List, label: "Bulleted list", command: "insertUnorderedList", gapBefore: true },
  { icon: ListOrdered, label: "Numbered list", command: "insertOrderedList" },
];

/**
 * A writing box for articles: headings, bold, lists and links from a row of buttons.
 * `value` is only read when the box first appears; after that the box holds the text and reports every change.
 */
export function RichText({ value, onChange, label, placeholder = "Write here…", className }: {
  value: string;
  onChange: (html: string) => void;
  label: string; // read out by screen readers
  placeholder?: string;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const cursor = useRef<Range | null>(null); // where the writer was, so a link lands there after its address is typed
  const [initial] = useState(value);
  const [linking, setLinking] = useState(false);
  const [address, setAddress] = useState("");

  const report = () => onChange(box.current?.innerHTML ?? "");

  const remember = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount && box.current?.contains(selection.anchorNode)) cursor.current = selection.getRangeAt(0).cloneRange();
  };

  /** Every line of the article is a proper paragraph: new lines become one, and an empty box gets a first one to type into. */
  const start = () => {
    document.execCommand("defaultParagraphSeparator", false, "p");
    const element = box.current;
    if (!element || element.innerHTML.trim() !== "") return;
    element.innerHTML = "<p><br></p>";
    window.getSelection()?.collapse(element.firstChild, 0);
  };

  /** The browser starts a new list inside the paragraph the writer was in; a list belongs beside paragraphs, so it is moved out. */
  const liftLists = () => {
    const selection = window.getSelection();
    const at = selection ? { node: selection.anchorNode, offset: selection.anchorOffset } : null;
    box.current?.querySelectorAll("p > ul, p > ol").forEach((list) => list.parentElement?.replaceWith(...list.parentElement.childNodes));
    // moving the list would lose the writer's place in it
    if (at?.node && box.current?.contains(at.node)) selection?.collapse(at.node, at.offset);
  };

  /** Puts text with its headings, lists and links in where the writer is. The browser adds colours of its own to what it puts in; those are taken off again. */
  const insert = (html: string) => {
    const holder = document.createElement("div");
    holder.innerHTML = html;
    holder.querySelectorAll("*").forEach((element) => element.setAttribute("data-new", ""));
    document.execCommand("insertHTML", false, holder.innerHTML);
    box.current?.querySelectorAll("[data-new]").forEach((element) => {
      element.removeAttribute("style");
      element.removeAttribute("data-new");
    });
  };

  const run = (command: string, argument?: string) => {
    box.current?.focus();
    document.execCommand(command, false, argument);
    liftLists();
    remember();
    report();
  };

  const addLink = () => {
    const typed = address.trim();
    if (!typed) return;
    const href = SAFE_LINK.test(typed) ? typed : `https://${typed}`;
    setLinking(false);
    setAddress("");
    // back to where the writer was before the address box took over
    box.current?.focus();
    const selection = window.getSelection();
    if (cursor.current && selection) {
      selection.removeAllRanges();
      selection.addRange(cursor.current);
    }
    // with words selected they become the link; with none, the address itself is written in
    if (selection && !selection.isCollapsed) document.execCommand("createLink", false, href);
    else insert(`<a href="${escapeHtml(href)}">${escapeHtml(typed)}</a>`);
    remember();
    report();
  };

  const paste = (event: React.ClipboardEvent) => {
    event.preventDefault();
    const html = event.clipboardData.getData("text/html");
    if (html) insert(tidyPaste(html));
    else document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
    liftLists();
    report();
  };

  return (
    <div className={cn("overflow-hidden rounded-lg border focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50", className)}>
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 p-1" role="toolbar" aria-label="Text style">
        {TOOLS.map((tool) => (
          <Button
            key={tool.label} type="button" variant="ghost" size="icon-sm" title={tool.label} aria-label={tool.label}
            className={tool.gapBefore ? "ml-1.5" : undefined}
            onMouseDown={(event) => event.preventDefault()} // keeps the selected words selected
            onClick={() => run(tool.command, tool.argument)}
          >
            <tool.icon />
          </Button>
        ))}
        <Popover open={linking} onOpenChange={setLinking}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" title="Add a link" aria-label="Add a link" className="ml-1.5" onMouseDown={(event) => event.preventDefault()}>
              <Link2 />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="flex w-80 flex-row gap-2 p-2">
            <Input
              autoFocus value={address} placeholder="https://… or a store page such as /products" className="h-9" aria-label="Link address"
              onChange={(event) => setAddress(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault(); // the box sits inside the post form; Enter must not save the post
                addLink();
              }}
            />
            <Button type="button" className="h-9" disabled={!address.trim()} onClick={addLink}>Add</Button>
          </PopoverContent>
        </Popover>
        <Button type="button" variant="ghost" size="icon-sm" title="Remove link" aria-label="Remove link" onMouseDown={(event) => event.preventDefault()} onClick={() => run("unlink")}>
          <Link2Off />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" title="Clear bold, italics and colours" aria-label="Clear bold, italics and colours" className="ml-1.5" onMouseDown={(event) => event.preventDefault()} onClick={() => run("removeFormat")}>
          <RemoveFormatting />
        </Button>
      </div>
      <div
        ref={box}
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        className={cn(ARTICLE, "max-h-[70vh] min-h-72 overflow-y-auto px-3 py-2 outline-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]")}
        // set once: React leaves the box alone afterwards because this text never changes
        dangerouslySetInnerHTML={{ __html: initial }}
        onFocus={start}
        onInput={report}
        onPaste={paste}
        onKeyUp={remember}
        onMouseUp={remember}
        onBlur={remember}
      />
    </div>
  );
}
