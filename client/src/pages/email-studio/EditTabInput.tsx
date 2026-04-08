import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Wand2 } from "lucide-react";

interface EditTabInputProps {
  background: string;
  setBackground: (v: string) => void;
  thread: string;
  setThread: (v: string) => void;
  tone: "tight" | "balanced" | "conversational";
  setTone: (v: "tight" | "balanced" | "conversational") => void;
  isProcessing: boolean;
  process: () => void;
}

export function EditTabInput({
  background, setBackground,
  thread, setThread,
  tone, setTone,
  isProcessing, process,
}: EditTabInputProps) {
  return (
    <div className="max-w-2xl space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">
          Background / Context <span className="text-muted-foreground/50 normal-case font-normal">— optional</span>
        </Label>
        <Textarea
          value={background}
          onChange={(e) => setBackground(e.target.value)}
          placeholder="Notes to yourself about this person, deal context, things the AI should know that aren't in the thread…"
          className="bg-card border-border text-sm resize-none"
          rows={3}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">
            Email Thread + Your Draft <span className="text-primary">*</span>
          </Label>
          <Button onClick={process} disabled={isProcessing || !thread.trim()} size="sm" className="gap-1.5 h-7 text-xs shrink-0">
            {isProcessing
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Processing…</>
              : <><Wand2 className="h-3 w-3" /> Process + Surface CRM Actions</>
            }
          </Button>
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          Paste a draft to edit or polish in your voice. Use the Compose tab to write from scratch.
        </p>
        <Textarea
          value={thread}
          onChange={(e) => setThread(e.target.value)}
          placeholder={"Paste the email thread with your draft reply at the top...\n\n________________________________________\nFrom: Sender Name\n...(prior thread below, if any)"}
          className="bg-card border-border text-sm resize-none font-mono"
          rows={14}
        />
      </div>

      {/* Tone selector */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Editing Tone</Label>
        <div className="flex gap-2">
          {(["tight", "balanced", "conversational"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTone(t)}
              className={`flex-1 py-1.5 px-2 rounded text-xs font-medium border transition-colors ${
                tone === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {t === "tight" ? "⚡ Tight" : t === "balanced" ? "⚖️ Balanced" : "💬 Conversational"}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {tone === "tight" ? "Maximally direct — cuts every unnecessary word."
            : tone === "conversational" ? "Warm and natural — preserves your full length and tone."
            : "Context-aware — tight for deal updates, warm for intros."}
        </p>
      </div>

      <Button onClick={process} disabled={isProcessing || !thread.trim()} className="gap-2 w-full" size="lg">
        {isProcessing
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
          : <><Wand2 className="h-4 w-4" /> Edit Email + Surface CRM Actions</>
        }
      </Button>
    </div>
  );
}
