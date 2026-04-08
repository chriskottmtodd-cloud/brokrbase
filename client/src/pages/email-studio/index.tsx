import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Copy, Loader2, Mail, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function EmailStudio() {
  const [mode, setMode] = useState<"edit" | "compose">("edit");
  const [draft, setDraft] = useState("");
  const [intent, setIntent] = useState("");
  const [thread, setThread] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const profileQuery = trpc.users.getMyProfile.useQuery();
  const invokeLlm = trpc.callIntel.invokeLlm.useMutation();

  const handleEdit = async () => {
    if (!draft.trim()) {
      toast.error("Paste a draft to edit.");
      return;
    }
    await runLlm("edit");
  };

  const handleCompose = async () => {
    if (!intent.trim()) {
      toast.error("Describe what the email should say.");
      return;
    }
    await runLlm("compose");
  };

  const runLlm = async (kind: "edit" | "compose") => {
    setIsProcessing(true);
    setResult(null);
    try {
      const profile = profileQuery.data;
      const stylePrompt = buildStylePrompt(profile);
      const taskBlock =
        kind === "edit"
          ? `Edit this draft email so it matches the broker's voice (rules above). Return ONLY the edited email body — no JSON, no commentary, no preamble.\n\n${
              thread.trim() ? `EMAIL THREAD CONTEXT:\n${thread.trim()}\n\n` : ""
            }DRAFT TO EDIT:\n${draft}`
          : `Compose an email based on the broker's intent. Match the broker's voice (rules above). Return ONLY the email body — no JSON, no commentary.\n\n${
              thread.trim() ? `EMAIL THREAD CONTEXT:\n${thread.trim()}\n\n` : ""
            }INTENT (what the broker wants the email to say):\n${intent}`;
      const fullPrompt = `${stylePrompt}\n\n---\n\n${taskBlock}`;
      const response = await invokeLlm.mutateAsync({ prompt: fullPrompt });
      const text = response.text?.trim() ?? "";
      if (!text) throw new Error("AI returned empty response");
      // Append signature if user has one
      const finalText = profile?.signature?.trim()
        ? text + (text.endsWith("\n") ? "" : "\n") + profile.signature.trim()
        : text;
      setResult(finalText);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate email");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Couldn't copy");
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      <div className="flex items-center gap-3">
        <Mail className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold">Email Studio</h1>
          <p className="text-sm text-muted-foreground">
            Draft an email or polish a draft in your voice. Reads from your{" "}
            <a href="/settings" className="underline">Settings</a> profile.
          </p>
        </div>
      </div>

      <Tabs value={mode} onValueChange={(v) => setMode(v as "edit" | "compose")}>
        <TabsList>
          <TabsTrigger value="edit">Edit a Draft</TabsTrigger>
          <TabsTrigger value="compose">Compose from Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="edit" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Email thread (optional)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={4}
                value={thread}
                onChange={(e) => setThread(e.target.value)}
                placeholder="Paste prior email thread here for context (optional)…"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Your draft
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                rows={10}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Paste your draft email here…"
              />
              <Button onClick={handleEdit} disabled={isProcessing} className="gap-2">
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {isProcessing ? "Editing…" : "Edit in My Voice"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compose" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Email thread (optional)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={4}
                value={thread}
                onChange={(e) => setThread(e.target.value)}
                placeholder="Paste prior email thread here for context (optional)…"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                What should the email say?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                rows={6}
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                placeholder="Describe what you want to say. Bullet points, fragments, anything goes."
              />
              <Button onClick={handleCompose} disabled={isProcessing} className="gap-2">
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {isProcessing ? "Composing…" : "Compose"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center justify-between">
              <span>Result</span>
              <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1">
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm font-sans">{result}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function buildStylePrompt(profile: {
  name?: string | null;
  company?: string | null;
  title?: string | null;
  marketFocus?: string | null;
  voiceNotes?: string | null;
} | null | undefined): string {
  const name = profile?.name?.trim() || "the broker";
  const company = profile?.company?.trim();
  const title = profile?.title?.trim() || "commercial real estate broker";
  const marketFocus = profile?.marketFocus?.trim();

  const identityLine = company
    ? `You are an email assistant for ${name}, a ${title} at ${company}.`
    : `You are an email assistant for ${name}, a ${title}.`;

  const focusLine = marketFocus
    ? ` They focus on ${marketFocus}.`
    : "";

  const customNotes = profile?.voiceNotes?.trim();
  const customBlock = customNotes
    ? `\n\nADDITIONAL VOICE NOTES FROM THIS BROKER:\n${customNotes}`
    : "";

  return `${identityLine}${focusLine}

VOICE & TONE:
- Direct, no fluff. Get to the point in sentence one.
- Short sentences are preferred. Fragments are fine.
- Casual but professional — trusted advisor, not a corporate drone.
- Never use: "I hope this email finds you well", "Please don't hesitate", "Best regards", "Touch base" (use "call" instead), "Going forward", or filler phrases.
- Use real estate shorthand freely: OM, T12, T3, NOI, cap rate, rent roll, BOV, CA, escrow, pro forma.

STRUCTURE:
- Greeting: First name only. "Hi [Name]" is fine for warmer emails.
- Body: Plain text only — no markdown, no asterisks, no bullet symbols. Use short sentences and line breaks.
- Always include specific numbers when relevant — prices, cap rates, units, occupancy %.
- End with a clear next step or open door for a call.
- Sign-off: "Thanks," — the broker's signature block will be appended separately, do NOT include the broker's name in your output.

RULES:
1. Fix all typos and grammar errors.
2. Tighten wording only where it genuinely improves clarity.
3. Keep all specific numbers, deal names, and facts exactly as provided.
4. Do not invent information. Do not make up details.
5. Match the same meaning and intent — just make it sound like the broker.${customBlock}`;
}
