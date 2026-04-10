import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface Props {
  notes: string;
  onSave: (notes: string) => Promise<void>;
}

const SEPARATOR_REGEX = /\n---\s*.+?\s*---\n/;

function parseEntries(notes: string): { date: string; text: string }[] {
  if (!notes.trim()) return [];
  const parts = notes.split(/\n(---\s*.+?\s*---)\n/);
  const entries: { date: string; text: string }[] = [];

  // If the notes start without a separator, treat the first part as a legacy block
  let i = 0;
  if (parts[0] && !parts[0].match(/^---\s*.+?\s*---$/)) {
    // Check if entire notes has no separators
    if (!SEPARATOR_REGEX.test(notes)) {
      return [{ date: "", text: notes.trim() }];
    }
    // First chunk is before any separator
    if (parts[0].trim()) {
      entries.push({ date: "", text: parts[0].trim() });
    }
    i = 1;
  }

  for (; i < parts.length; i++) {
    const part = parts[i];
    if (part && part.match(/^---\s*.+?\s*---$/)) {
      const dateStr = part.replace(/---/g, "").trim();
      const text = parts[i + 1]?.trim() ?? "";
      if (text) entries.push({ date: dateStr, text });
      i++;
    }
  }

  return entries;
}

export function NotesJournal({ notes, onSave }: Props) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingBody, setEditingBody] = useState(false);
  const [bodyDraft, setBodyDraft] = useState(notes);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const entries = parseEntries(notes);

  const addEntry = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      const dateLabel = format(new Date(), "MMM d, yyyy");
      const separator = `\n--- ${dateLabel} ---\n`;
      const newNotes = separator + draft.trim() + (notes ? "\n" + notes : "");
      await onSave(newNotes);
      setDraft("");
    } finally {
      setSaving(false);
    }
  };

  const saveBody = async () => {
    setSaving(true);
    try {
      await onSave(bodyDraft);
      setEditingBody(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 min-w-0">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        Notes
      </div>

      {/* Quick add */}
      <div className="flex gap-2 mb-4">
        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note..."
          rows={2}
          className="text-sm resize-none flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              addEntry();
            }
          }}
        />
        <Button
          size="sm"
          className="h-8 self-end gap-1"
          onClick={addEntry}
          disabled={saving || !draft.trim()}
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Add
        </Button>
      </div>

      {/* Journal entries */}
      {entries.length > 0 ? (
        <div className="space-y-3">
          {entries.map((entry, idx) => (
            <div key={idx} className="text-sm">
              {entry.date && (
                <div className="text-xs text-muted-foreground/60 font-medium mb-0.5">
                  {entry.date}
                </div>
              )}
              <p className="whitespace-pre-wrap text-foreground/90 leading-relaxed">{entry.text}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground/50 italic">No notes yet</p>
      )}
    </div>
  );
}
