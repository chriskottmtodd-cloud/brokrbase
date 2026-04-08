import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Search, User, Building2, Tag, X, ArrowRight } from "lucide-react";

const priorityColors: Record<string, string> = {
  hot: "text-red-400",
  warm: "text-amber-400",
  cold: "text-blue-400",
  inactive: "text-slate-400",
};

const propertyTypeLabel: Record<string, string> = {
  apartment: "Apt",
  mhc: "MHC",
  self_storage: "Storage",
  mixed: "Mixed",
  commercial: "Comm",
  land: "Land",
  other: "Other",
};

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [, setLocation] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, isFetching } = trpc.contacts.globalSearch.useQuery(
    { query },
    { enabled: open && query.trim().length >= 1 }
  );

  const contacts = data?.contacts ?? [];
  const properties = data?.properties ?? [];
  const listings = data?.listings ?? [];
  const totalResults = contacts.length + properties.length + listings.length;

  // Build flat navigable list for keyboard nav
  type ResultItem =
    | { kind: "contact"; id: number; label: string; sub: string }
    | { kind: "property"; id: number; label: string; sub: string }
    | { kind: "listing"; id: number; label: string; sub: string };

  const flatItems: ResultItem[] = [
    ...contacts.map((c) => ({
      kind: "contact" as const,
      id: c.id,
      label: `${c.firstName} ${c.lastName}`,
      sub: c.company ?? priorityColors[c.priority ?? ""] ?? "",
    })),
    ...properties.map((p) => ({
      kind: "property" as const,
      id: p.id,
      label: p.name,
      sub: [p.city, propertyTypeLabel[p.propertyType ?? ""] ?? p.propertyType, p.unitCount ? `${p.unitCount}u` : ""].filter(Boolean).join(" · "),
    })),
    ...listings.map((l) => ({
      kind: "listing" as const,
      id: l.id,
      label: l.title,
      sub: l.stage ?? "",
    })),
  ];

  const navigate = useCallback((item: ResultItem) => {
    if (item.kind === "contact") setLocation(`/contacts/${item.id}`);
    else if (item.kind === "property") setLocation(`/properties/${item.id}`);
    else setLocation(`/listings/${item.id}`);
    setOpen(false);
    setQuery("");
    setCursor(0);
  }, [setLocation]);

  // Cmd+K / Ctrl+K or Cmd+F / Ctrl+F to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "f")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setCursor(0);
    } else {
      setQuery("");
    }
  }, [open]);

  // Reset cursor when results change
  useEffect(() => { setCursor(0); }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && flatItems[cursor]) {
      navigate(flatItems[cursor]);
    }
  };

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  let globalCursor = 0;

  const renderSection = (
    title: string,
    icon: React.ReactNode,
    items: ResultItem[]
  ) => {
    if (!items.length) return null;
    return (
      <div>
        <div className="px-3 py-1.5 flex items-center gap-1.5">
          <span className="text-muted-foreground">{icon}</span>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</span>
        </div>
        {items.map((item) => {
          const idx = globalCursor++;
          const isActive = idx === cursor;
          return (
            <button
              key={`${item.kind}-${item.id}`}
              className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors ${isActive ? "bg-primary/10 text-primary" : "hover:bg-muted/50 text-foreground"}`}
              onMouseEnter={() => setCursor(idx)}
              onClick={() => navigate(item)}
            >
              <span className={`shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                {item.kind === "contact" ? <User className="h-3.5 w-3.5" /> : item.kind === "property" ? <Building2 className="h-3.5 w-3.5" /> : <Tag className="h-3.5 w-3.5" />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="text-sm font-medium truncate block">{item.label}</span>
                {item.sub && <span className="text-xs text-muted-foreground truncate block">{item.sub}</span>}
              </span>
              {isActive && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary" />}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <>
      {/* Trigger button — shown in sidebar header */}
      <button
        onClick={() => setOpen(true)}
        className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors shrink-0"
        aria-label="Global search (⌘K or ⌘F)"
        title="Search (⌘K or ⌘F)"
      >
        <Search className="h-4 w-4 text-muted-foreground" />
      </button>

      {/* Overlay + palette */}
      {open && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />

          {/* Palette */}
          <div
            ref={containerRef}
            className="relative w-full max-w-lg mx-4 bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
          >
            {/* Input row */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search contacts, properties, listings..."
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              {query && (
                <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="h-4 w-4" />
                </button>
              )}
              <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-[60vh] overflow-y-auto py-1">
              {query.trim().length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Start typing to search across contacts, properties, and listings
                </div>
              )}
              {query.trim().length >= 1 && isFetching && !data && (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">Searching...</div>
              )}
              {query.trim().length >= 1 && !isFetching && totalResults === 0 && (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No results for <span className="text-foreground font-medium">"{query}"</span>
                </div>
              )}
              {totalResults > 0 && (
                <>
                  {renderSection("Contacts", <User className="h-3.5 w-3.5" />, flatItems.filter(i => i.kind === "contact"))}
                  {renderSection("Properties", <Building2 className="h-3.5 w-3.5" />, flatItems.filter(i => i.kind === "property"))}
                  {renderSection("Listings", <Tag className="h-3.5 w-3.5" />, flatItems.filter(i => i.kind === "listing"))}
                </>
              )}
            </div>

            {/* Footer hint */}
            {totalResults > 0 && (
              <div className="px-4 py-2 border-t border-border flex items-center gap-3 text-[10px] text-muted-foreground">
                <span><kbd className="border border-border rounded px-1 py-0.5">↑↓</kbd> navigate</span>
                <span><kbd className="border border-border rounded px-1 py-0.5">↵</kbd> open</span>
                <span><kbd className="border border-border rounded px-1 py-0.5">esc</kbd> close</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
