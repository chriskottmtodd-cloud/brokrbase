import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, Loader2, Pencil, X } from "lucide-react";

export interface InlineFieldProps {
  label: string;
  value: string | number | null | undefined;
  fieldKey: string;
  type?: "text" | "number" | "currency" | "percent" | "select" | "textarea" | "date";
  options?: { value: string; label: string }[];
  onSave: (key: string, value: any) => Promise<void>;
  suffix?: string;
  placeholder?: string;
  emptyText?: string;
}

function formatDisplay(
  value: string | number | null | undefined,
  type: string,
  suffix?: string,
): string {
  if (value === null || value === undefined || value === "") return "";
  if (type === "currency") {
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(num as number)) return String(value);
    return `$${(num as number).toLocaleString()}`;
  }
  if (type === "percent") {
    return `${value}%`;
  }
  if (type === "number" && typeof value === "number") {
    return value.toLocaleString() + (suffix ? ` ${suffix}` : "");
  }
  return String(value) + (suffix ? ` ${suffix}` : "");
}

function parseInput(raw: string, type: string): any {
  if (raw === "") return null;
  if (type === "currency") {
    const cleaned = raw.replace(/[$,\s]/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }
  if (type === "percent") {
    const cleaned = raw.replace(/%/g, "").trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }
  if (type === "number") {
    const cleaned = raw.replace(/,/g, "").trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }
  return raw;
}

export function InlineField({
  label,
  value,
  fieldKey,
  type = "text",
  options,
  onSave,
  suffix,
  placeholder,
  emptyText = "\u2014",
}: InlineFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const displayValue = type === "select" && options
    ? options.find((o) => o.value === String(value))?.label ?? ""
    : formatDisplay(value, type, suffix);

  const startEdit = useCallback(() => {
    if (saving) return;
    if (type === "select") return; // selects handle their own flow
    const raw = value === null || value === undefined ? "" : String(value);
    setDraft(raw);
    setEditing(true);
  }, [value, saving, type]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if ("select" in inputRef.current) {
        inputRef.current.select();
      }
    }
  }, [editing]);

  const save = useCallback(async () => {
    const parsed = parseInput(draft, type);
    const currentVal = value === undefined ? null : value;
    if (parsed === currentVal || (parsed === null && currentVal === null)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(fieldKey, parsed);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }, [draft, type, value, onSave, fieldKey]);

  const cancel = useCallback(() => {
    setEditing(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && type !== "textarea") {
        e.preventDefault();
        save();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    },
    [save, cancel, type],
  );

  // Select type — always show a clickable select
  if (type === "select" && options) {
    return (
      <div className="group py-2">
        <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
        <Select
          value={String(value ?? "")}
          onValueChange={async (v) => {
            if (v !== String(value)) {
              setSaving(true);
              try {
                await onSave(fieldKey, v);
              } finally {
                setSaving(false);
              }
            }
          }}
          disabled={saving}
        >
          <SelectTrigger className="h-8 text-sm w-auto min-w-[120px] border-transparent hover:border-border transition-colors">
            {saving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <SelectValue placeholder={placeholder ?? "Select..."} />
            )}
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  // Display mode
  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEdit}
        className="group w-full text-left py-2 px-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors"
      >
        <div className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
          {label}
          <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-40 transition-opacity" />
        </div>
        <div className="text-sm">
          {displayValue || (
            <span className="text-muted-foreground/60 italic">
              {placeholder ?? emptyText}
            </span>
          )}
        </div>
      </button>
    );
  }

  // Edit mode — textarea
  if (type === "textarea") {
    return (
      <div className="py-2 px-2 -mx-2 rounded-md bg-muted/30">
        <div className="text-xs text-muted-foreground mb-1">{label}</div>
        <Textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={4}
          className="text-sm resize-none"
          disabled={saving}
        />
        <div className="flex items-center gap-1 mt-1.5">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Save
          </button>
          <button
            type="button"
            onClick={cancel}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3 w-3" />
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Edit mode — standard input
  return (
    <div className="py-2 px-2 -mx-2 rounded-md bg-muted/30">
      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
      <div className="flex items-center gap-1">
        <Input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={handleKeyDown}
          type={type === "date" ? "date" : "text"}
          className="h-7 text-sm"
          placeholder={placeholder}
          disabled={saving}
        />
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
      </div>
    </div>
  );
}
