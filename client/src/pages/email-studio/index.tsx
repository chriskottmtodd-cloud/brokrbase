import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  Mail,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type SuggestedAction =
  | { type: "create_contact"; firstName: string; lastName: string; email?: string; phone?: string; company?: string; reason: string }
  | { type: "log_activity"; activityType: "call" | "email" | "meeting" | "note"; subject: string; notes: string; contactName?: string; reason: string }
  | { type: "create_task"; title: string; description?: string; dueDaysFromNow: number; contactName?: string; reason: string }
  | { type: "update_contact"; contactName: string; field: string; newValue: string; reason: string };

interface AnalysisResult {
  emailBody: string;
  suggestedActions: SuggestedAction[];
}

export default function EmailStudio() {
  const [mode, setMode] = useState<"compose" | "edit">("compose");
  const [draft, setDraft] = useState("");
  const [intent, setIntent] = useState("");
  const [thread, setThread] = useState("");
  const [recipientId, setRecipientId] = useState<number | null>(null);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [showRecipientPicker, setShowRecipientPicker] = useState(false);
  const [showCreateRecipient, setShowCreateRecipient] = useState(false);
  const [newRecipient, setNewRecipient] = useState({ firstName: "", lastName: "", email: "", company: "" });
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [acceptedActions, setAcceptedActions] = useState<Set<number>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const profileQuery = trpc.users.getMyProfile.useQuery();
  const recipientQuery = trpc.contacts.byId.useQuery(
    { id: recipientId ?? 0 },
    { enabled: !!recipientId },
  );
  const contactsListQuery = trpc.contacts.list.useQuery(
    { search: recipientSearch || undefined, limit: 10 },
    { enabled: showRecipientPicker },
  );

  const invokeLlm = trpc.callIntel.invokeLlm.useMutation();
  const createContact = trpc.contacts.create.useMutation();
  const createActivity = trpc.activities.create.useMutation();
  const applyActions = trpc.callIntel.applyCallActions.useMutation();
  const utils = trpc.useUtils();

  const recipient = recipientQuery.data;

  // Reset accepted actions when a new analysis arrives
  useEffect(() => {
    if (analysis) {
      // Auto-accept all by default
      setAcceptedActions(new Set(analysis.suggestedActions.map((_, i) => i)));
    }
  }, [analysis]);

  const profile = profileQuery.data;

  const handleGenerate = async () => {
    if (mode === "compose" && !intent.trim()) {
      toast.error("Describe what the email should say.");
      return;
    }
    if (mode === "edit" && !draft.trim()) {
      toast.error("Paste a draft to edit.");
      return;
    }
    if (!recipient) {
      toast.error("Pick a recipient first.");
      return;
    }

    setIsProcessing(true);
    setAnalysis(null);
    setAcceptedActions(new Set());

    try {
      const stylePrompt = buildStylePrompt(profile);
      const recipientBlock = `RECIPIENT (the person you are writing TO):
- Name: ${recipient.firstName} ${recipient.lastName}
${recipient.company ? `- Company: ${recipient.company}\n` : ""}${recipient.email ? `- Email: ${recipient.email}\n` : ""}${recipient.isOwner ? "- Role: Property owner\n" : ""}${recipient.isBuyer ? "- Role: Active buyer\n" : ""}${recipient.notes ? `- Notes: ${recipient.notes}\n` : ""}`;

      const senderName = profile?.name?.trim() || "the broker";
      const senderBlock = `SENDER (you are writing AS this person):
- Name: ${senderName}
${profile?.company ? `- Company: ${profile.company}\n` : ""}${profile?.title ? `- Title: ${profile.title}\n` : ""}`;

      const taskBlock =
        mode === "compose"
          ? `Compose an email FROM ${senderName} TO ${recipient.firstName}. The intent is below. Use the broker's voice (rules above).`
          : `The user pasted the contents of their email client below. Their unfinished draft (the email they're about to send) is at the TOP of the paste. Below the draft is the prior thread — typically separated by "On [date], [name] wrote:" or "From:" lines or "---" or quoted text starting with ">".

Your job: edit ONLY the unfinished draft at the top, in the broker's voice (rules above). Use the prior thread for context — to understand who said what, what was promised, what's been discussed — but DO NOT edit, rewrite, or include the prior thread in your output. Return only the edited version of the broker's draft.

Do not change facts. Do not invent details. If you're unsure where the draft ends and the prior thread begins, treat everything before the first "On … wrote:" / "From:" / "---" / ">" line as the draft.`;

      const inputBlock =
        mode === "compose"
          ? `INTENT (what ${senderName} wants the email to say):\n${intent}`
          : `EMAIL CLIENT PASTE (draft at top, prior thread below):\n${draft}`;

      const fullPrompt = `${stylePrompt}

---

${senderBlock}

${recipientBlock}

${mode === "compose" && thread.trim() ? `PRIOR EMAIL THREAD:\n${thread.trim()}\n\n` : ""}${taskBlock}

${inputBlock}

---

Return ONLY a valid JSON object with this exact structure (no markdown, no backticks, no commentary outside the JSON):

{
  "emailBody": "the complete email body, plain text, no greeting line on its own — the AI should include 'Hi [first name],' as line 1, then a blank line, then the body, then 'Thanks,' on its own line. Do NOT include the sender's name or signature — those are appended automatically.",
  "suggestedActions": [
    {
      "type": "create_contact",
      "firstName": "string",
      "lastName": "string",
      "email": "string or empty",
      "phone": "string or empty",
      "company": "string or empty",
      "reason": "why this contact should be created"
    },
    {
      "type": "log_activity",
      "activityType": "email",
      "subject": "short subject line for the activity log",
      "notes": "1-2 sentence summary of what this email is about",
      "contactName": "${recipient.firstName} ${recipient.lastName}",
      "reason": "logging this outbound email"
    },
    {
      "type": "create_task",
      "title": "short follow-up task title",
      "description": "what to do",
      "dueDaysFromNow": 3,
      "contactName": "name of the contact this task relates to",
      "reason": "why this task should exist"
    }
  ]
}

For suggestedActions: ALWAYS include at least one log_activity action for this email itself (so the email gets logged to the recipient's activity history). Include create_contact actions for any NEW people mentioned in the thread or intent who aren't already in the CRM. Include create_task actions for any follow-ups, callbacks, or "I'll send you the T12" / "let's schedule a tour" / "circle back next week" type commitments. Generate 1-5 actions total based on what's actually in the email.`;

      const response = await invokeLlm.mutateAsync({ prompt: fullPrompt });
      const text = response.text?.trim() ?? "";
      const cleaned = text.replace(/^```json\s*|\s*```$/g, "").trim();
      const parsed = JSON.parse(cleaned) as AnalysisResult;
      if (!parsed.emailBody) throw new Error("AI returned no email body");
      setAnalysis(parsed);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate email");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateNewRecipient = async () => {
    if (!newRecipient.firstName.trim()) {
      toast.error("First name required");
      return;
    }
    try {
      const created = await createContact.mutateAsync({
        firstName: newRecipient.firstName,
        lastName: newRecipient.lastName,
        email: newRecipient.email || undefined,
        company: newRecipient.company || undefined,
      });
      utils.contacts.list.invalidate();
      setRecipientId(created.id);
      setShowCreateRecipient(false);
      setShowRecipientPicker(false);
      setNewRecipient({ firstName: "", lastName: "", email: "", company: "" });
      toast.success(`Added ${created.firstName} ${created.lastName}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create contact");
    }
  };

  const finalEmail = useMemo(() => {
    if (!analysis) return "";
    let body = analysis.emailBody.trim();
    if (profile?.signature?.trim()) {
      // Make sure signature comes after "Thanks," (or whatever sign-off the AI included)
      body = body + "\n" + profile.signature.trim();
    } else if (profile?.name) {
      body = body + "\n" + profile.name;
    }
    return body;
  }, [analysis, profile]);

  const handleCopy = async () => {
    if (!finalEmail) return;
    try {
      await navigator.clipboard.writeText(finalEmail);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Couldn't copy");
    }
  };

  const toggleAction = (idx: number) => {
    const next = new Set(acceptedActions);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setAcceptedActions(next);
  };

  const handleApplyActions = async () => {
    if (!analysis || !recipient) return;
    setIsApplying(true);
    try {
      const accepted = analysis.suggestedActions.filter((_, i) => acceptedActions.has(i));

      // Resolve contact names → ids for tasks/activities. We use the recipient as the
      // default contact when contactName matches; otherwise leave unlinked.
      const recipientFullName = `${recipient.firstName} ${recipient.lastName}`.toLowerCase().trim();
      const resolveContactId = (name?: string): number | undefined => {
        if (!name) return undefined;
        if (name.toLowerCase().trim() === recipientFullName) return recipient.id;
        return undefined;
      };

      const newTasks: Array<{ title: string; description?: string; priority: "medium"; type: "follow_up"; contactId?: number; dueDaysFromNow: number }> = [];
      const activitiesToCreate: Array<{ type: "email"; subject: string; notes: string; contactId?: number }> = [];
      const contactsToCreate: Array<{ firstName: string; lastName: string; email?: string; phone?: string; company?: string }> = [];

      for (const action of accepted) {
        if (action.type === "create_contact") {
          contactsToCreate.push({
            firstName: action.firstName,
            lastName: action.lastName,
            email: action.email || undefined,
            phone: action.phone || undefined,
            company: action.company || undefined,
          });
        } else if (action.type === "log_activity") {
          activitiesToCreate.push({
            type: "email",
            subject: action.subject,
            notes: action.notes,
            contactId: resolveContactId(action.contactName),
          });
        } else if (action.type === "create_task") {
          newTasks.push({
            title: action.title,
            description: action.description,
            priority: "medium",
            type: "follow_up",
            contactId: resolveContactId(action.contactName),
            dueDaysFromNow: action.dueDaysFromNow,
          });
        }
      }

      // 1. Create new contacts
      for (const c of contactsToCreate) {
        await createContact.mutateAsync(c);
      }

      // 2. Create activities
      for (const a of activitiesToCreate) {
        await createActivity.mutateAsync({
          type: a.type,
          direction: "outbound",
          subject: a.subject,
          notes: a.notes,
          contactId: a.contactId,
        });
      }

      // 3. Create tasks via the existing applyCallActions endpoint
      if (newTasks.length > 0) {
        await applyActions.mutateAsync({ newTasks });
      }

      utils.contacts.list.invalidate();
      utils.activities.list.invalidate();
      utils.tasks.list.invalidate();

      const total = contactsToCreate.length + activitiesToCreate.length + newTasks.length;
      toast.success(
        `Applied ${total} change${total === 1 ? "" : "s"}: ${contactsToCreate.length} contact(s), ${activitiesToCreate.length} activit${activitiesToCreate.length === 1 ? "y" : "ies"}, ${newTasks.length} task${newTasks.length === 1 ? "" : "s"}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to apply actions");
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      <div className="flex items-center gap-3">
        <Mail className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold">Email Studio</h1>
          <p className="text-sm text-muted-foreground">
            Draft an email in your voice. Brokrbase logs the email, creates contacts, and builds follow-up tasks automatically.
          </p>
        </div>
      </div>

      {/* Recipient picker */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Email To
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recipient ? (
            <div className="flex items-center justify-between gap-2 border rounded-md p-3 bg-muted/30">
              <div>
                <div className="font-medium">
                  {recipient.firstName} {recipient.lastName}
                </div>
                {recipient.company && (
                  <div className="text-xs text-muted-foreground">{recipient.company}</div>
                )}
                {recipient.email && (
                  <div className="text-xs text-muted-foreground">{recipient.email}</div>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setRecipientId(null)}>
                Change
              </Button>
            </div>
          ) : showCreateRecipient ? (
            <div className="space-y-3 border rounded-md p-3 bg-muted/30">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">First name</Label>
                  <Input
                    value={newRecipient.firstName}
                    onChange={(e) => setNewRecipient({ ...newRecipient, firstName: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Last name</Label>
                  <Input
                    value={newRecipient.lastName}
                    onChange={(e) => setNewRecipient({ ...newRecipient, lastName: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input
                    type="email"
                    value={newRecipient.email}
                    onChange={(e) => setNewRecipient({ ...newRecipient, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Company</Label>
                  <Input
                    value={newRecipient.company}
                    onChange={(e) => setNewRecipient({ ...newRecipient, company: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowCreateRecipient(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleCreateNewRecipient} disabled={createContact.isPending}>
                  {createContact.isPending ? "Creating…" : "Create + Use"}
                </Button>
              </div>
            </div>
          ) : showRecipientPicker ? (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  autoFocus
                  value={recipientSearch}
                  onChange={(e) => setRecipientSearch(e.target.value)}
                  placeholder="Search contacts by name, email, company…"
                  className="pl-9"
                />
              </div>
              <div className="max-h-48 overflow-y-auto border rounded-md">
                {(contactsListQuery.data ?? []).length === 0 && recipientSearch && (
                  <p className="text-xs text-muted-foreground p-2">
                    No contacts match. Create a new one below.
                  </p>
                )}
                {(contactsListQuery.data ?? []).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setRecipientId(c.id);
                      setShowRecipientPicker(false);
                      setRecipientSearch("");
                    }}
                    className="block w-full text-left p-2 hover:bg-muted text-sm border-b last:border-b-0"
                  >
                    <div className="font-medium">{c.firstName} {c.lastName}</div>
                    {c.company && <div className="text-xs text-muted-foreground">{c.company}</div>}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setShowRecipientPicker(false); setRecipientSearch(""); }}>
                  Cancel
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowCreateRecipient(true)}>
                  + New contact
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" onClick={() => setShowRecipientPicker(true)} className="gap-1">
              <Search className="h-3.5 w-3.5" /> Pick a recipient
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Compose / Edit input */}
      <Tabs value={mode} onValueChange={(v) => setMode(v as "compose" | "edit")}>
        <TabsList>
          <TabsTrigger value="compose">Compose from Notes</TabsTrigger>
          <TabsTrigger value="edit">Edit a Draft</TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="space-y-4 mt-4">
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
                placeholder="Describe what you want to say. Bullet points or sentences — anything goes. Include details like deal names, prices, dates, and follow-up commitments."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="edit" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Your draft + the thread
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={14}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Paste the whole thing from your email client. Your unfinished draft at the top, the prior thread below it (the 'On Oct 12, Tom wrote:' part). Brokrbase will edit only your draft and use the rest as context."
              />
              <p className="text-xs text-muted-foreground mt-2">
                Tip: just copy the entire compose window from Gmail/Outlook and paste it here. No need to split anything.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Optional thread context — only shown for Compose mode */}
      {mode === "compose" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Prior email thread (optional)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              rows={4}
              value={thread}
              onChange={(e) => setThread(e.target.value)}
              placeholder="Paste any prior emails in the thread here (optional). Helps the AI understand the conversation."
            />
          </CardContent>
        </Card>
      )}

      <Button onClick={handleGenerate} disabled={isProcessing || !recipient} className="gap-2 w-full" size="lg">
        {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {isProcessing ? "Drafting…" : mode === "compose" ? "Compose Email" : "Edit in My Voice"}
      </Button>

      {/* Result */}
      {analysis && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center justify-between">
                <span>Email</span>
                <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1">
                  <Copy className="h-3.5 w-3.5" /> Copy
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap text-sm font-sans">{finalEmail}</pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                CRM Updates
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {analysis.suggestedActions.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No CRM updates suggested.</p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    These will be applied when you click below. Uncheck anything you don't want.
                  </p>
                  {analysis.suggestedActions.map((action, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleAction(i)}
                      className={`w-full text-left border rounded-md p-2 transition-colors ${
                        acceptedActions.has(i) ? "bg-primary/5 border-primary/30" : "opacity-50"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {acceptedActions.has(i) ? (
                          <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <Badge variant="outline" className="text-[10px] capitalize mb-1">
                            {action.type.replace("_", " ")}
                          </Badge>
                          <div className="text-sm font-medium">{describeAction(action)}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{action.reason}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                  <Button
                    onClick={handleApplyActions}
                    disabled={isApplying || acceptedActions.size === 0}
                    className="w-full gap-2"
                  >
                    {isApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {isApplying
                      ? "Applying…"
                      : `Apply ${acceptedActions.size} update${acceptedActions.size === 1 ? "" : "s"}`}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function describeAction(a: SuggestedAction): string {
  switch (a.type) {
    case "create_contact":
      return `New contact: ${a.firstName} ${a.lastName}${a.company ? ` (${a.company})` : ""}`;
    case "log_activity":
      return `Log ${a.activityType}: ${a.subject}`;
    case "create_task":
      return `Task: ${a.title}`;
    case "update_contact":
      return `Update ${a.contactName}: ${a.field} → ${a.newValue}`;
  }
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

  const focusLine = marketFocus ? ` They focus on ${marketFocus}.` : "";

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
- Greeting: First name only. "Hi [Name]," is fine.
- Body: Plain text only — no markdown, no asterisks, no bullet symbols. Use short sentences and line breaks.
- Always include specific numbers when relevant — prices, cap rates, units, occupancy %.
- End with a clear next step or open door for a call.
- Sign-off: "Thanks," — the broker's signature block will be appended automatically. Do NOT include the broker's name in your output.

RULES:
1. Fix all typos and grammar errors.
2. Tighten wording only where it genuinely improves clarity.
3. Keep all specific numbers, deal names, and facts exactly as provided.
4. Do not invent information. Do not make up details.
5. The broker is the SENDER. Never write a reply that addresses the broker as if they were the recipient.${customBlock}`;
}
