import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
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
  Sparkles,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type SuggestedAction =
  | { type: "create_contact"; firstName: string; lastName: string; email?: string; phone?: string; company?: string; reason: string }
  | { type: "log_activity"; activityType: "call" | "email" | "meeting" | "note"; subject: string; notes: string; contactName?: string; reason: string }
  | { type: "create_task"; title: string; description?: string; dueDaysFromNow: number; contactName?: string; reason: string };

interface AnalysisResult {
  emailBody: string;
  detectedRecipient: {
    contactId: number | null;
    firstName: string;
    lastName: string;
    email: string;
    company: string;
    confidence: "high" | "medium" | "low";
    reasoning: string;
    isExisting: boolean;
  };
  suggestedActions: SuggestedAction[];
}

// Local fuzzy match against the loaded contacts list. Used as a backup when
// server-side AI detection misses someone (e.g. only first name visible, or
// the contact is outside the 300 the AI sees).
function fuzzyMatchContact(
  query: { firstName?: string; lastName?: string; email?: string },
  contacts: Array<{ id: number; firstName: string; lastName: string; email?: string | null; company?: string | null }>,
): typeof contacts[0] | null {
  if (!contacts.length) return null;

  // 1. Exact email match (case-insensitive) — highest confidence
  if (query.email?.trim()) {
    const e = query.email.trim().toLowerCase();
    const emailMatch = contacts.find((c) => (c.email ?? "").toLowerCase() === e);
    if (emailMatch) return emailMatch;
  }

  const first = query.firstName?.trim().toLowerCase() ?? "";
  const last = query.lastName?.trim().toLowerCase() ?? "";
  if (!first && !last) return null;

  // 2. Exact first + last
  if (first && last) {
    const exact = contacts.find(
      (c) => c.firstName.toLowerCase() === first && c.lastName.toLowerCase() === last,
    );
    if (exact) return exact;
  }

  // 3. Exact first name only — if there's only one match, use it
  if (first) {
    const firstMatches = contacts.filter((c) => c.firstName.toLowerCase() === first);
    if (firstMatches.length === 1) return firstMatches[0];
    // If multiple matches and we have a last name hint, narrow by it
    if (firstMatches.length > 1 && last) {
      const narrowed = firstMatches.find((c) => c.lastName.toLowerCase().startsWith(last));
      if (narrowed) return narrowed;
    }
  }

  // 4. Exact last name only — if there's only one match, use it
  if (last && !first) {
    const lastMatches = contacts.filter((c) => c.lastName.toLowerCase() === last);
    if (lastMatches.length === 1) return lastMatches[0];
  }

  // 5. Substring match in either field — desperation fallback
  const fullQuery = `${first} ${last}`.trim();
  if (fullQuery.length >= 3) {
    const sub = contacts.find((c) => {
      const full = `${c.firstName} ${c.lastName}`.toLowerCase();
      return full.includes(fullQuery) || fullQuery.includes(full);
    });
    if (sub) return sub;
  }

  return null;
}

export default function EmailStudio() {
  const [mode, setMode] = useState<"edit" | "compose">("edit");
  const [pasteContent, setPasteContent] = useState("");
  const [intent, setIntent] = useState("");
  const [composeThread, setComposeThread] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [acceptedActions, setAcceptedActions] = useState<Set<number>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const profileQuery = trpc.users.getMyProfile.useQuery();
  const profile = profileQuery.data;

  // Load ALL contacts client-side so we can do local fuzzy matching as a
  // backup when the server-side AI detection misses someone.
  const allContactsQuery = trpc.contacts.list.useQuery({ limit: 2000 });
  const allContacts = allContactsQuery.data ?? [];

  const detectFromThread = trpc.contactEmails.detectFromThread.useMutation();
  const invokeLlm = trpc.callIntel.invokeLlm.useMutation();
  const createContact = trpc.contacts.create.useMutation();
  const createActivity = trpc.activities.create.useMutation();
  const applyActions = trpc.callIntel.applyCallActions.useMutation();
  const utils = trpc.useUtils();

  // Profile completeness check
  const profileComplete = !!(profile?.name?.trim() && profile?.company?.trim());
  const senderDisplayName = profile?.name?.trim() || "(your name not set)";

  useEffect(() => {
    if (analysis) {
      setAcceptedActions(new Set(analysis.suggestedActions.map((_, i) => i)));
    }
  }, [analysis]);

  const handleGenerate = async () => {
    if (!profileComplete) {
      toast.error("Fill in your Settings profile first.");
      return;
    }

    const inputText = mode === "edit" ? pasteContent : intent;
    const contextText = mode === "edit" ? pasteContent : composeThread;

    if (!inputText.trim()) {
      toast.error(mode === "edit" ? "Paste your draft + thread" : "Describe what to say");
      return;
    }

    setIsProcessing(true);
    setAnalysis(null);
    setAcceptedActions(new Set());

    try {
      // Step 1: Auto-detect the recipient from the email content.
      // We pass EVERYTHING the user typed (intent + thread + paste) so the AI
      // can find names whether they're in a pasted email signature or in a
      // compose-mode "draft an email to Troy" instruction.
      const detectionContext = [
        mode === "compose" ? intent : "",
        mode === "compose" ? composeThread : "",
        mode === "edit" ? pasteContent : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      let detected: Awaited<ReturnType<typeof detectFromThread.mutateAsync>> | null = null;
      if (detectionContext.trim().length > 5) {
        try {
          detected = await detectFromThread.mutateAsync({
            thread: detectionContext,
          });
        } catch (err) {
          console.warn("Recipient auto-detection failed, will fall back to client-side match", err);
        }
      }

      // Step 1b: If server-side detection didn't find a matched contact, try
      // a client-side fuzzy match against the FULL contacts list (we loaded
      // up to 2000 of them). This catches contacts the AI couldn't see in
      // its 300-contact slice.
      if (detected && !detected.matchedContact && detected.primaryContactName) {
        const parts = detected.primaryContactName.trim().split(/\s+/);
        const localMatch = fuzzyMatchContact(
          {
            firstName: parts[0],
            lastName: parts.slice(1).join(" "),
            email: detected.primaryContactEmail || undefined,
          },
          allContacts,
        );
        if (localMatch) {
          console.log("[EmailStudio] Client-side fuzzy match found:", localMatch.firstName, localMatch.lastName);
          // Mutate the detected object to include the local match
          detected = {
            ...detected,
            matchedContact: {
              id: localMatch.id,
              firstName: localMatch.firstName,
              lastName: localMatch.lastName,
              company: localMatch.company ?? null,
              email: localMatch.email ?? null,
              isOwner: false,
              isBuyer: false,
              lastContactedAt: null,
            },
            confidence: "high" as const,
            reasoning: detected.reasoning + " (matched via local fuzzy match)",
          };
        }
      }

      // Step 2: Build the email-generation prompt with detected recipient
      const stylePrompt = buildStylePrompt(profile);
      const senderName = profile?.name?.trim() || "the broker";

      const recipientBlock = detected && detected.matchedContact
        ? `RECIPIENT (the person you are writing TO — auto-detected from the thread):
- Name: ${detected.matchedContact.firstName} ${detected.matchedContact.lastName}
${detected.matchedContact.company ? `- Company: ${detected.matchedContact.company}\n` : ""}${detected.matchedContact.email ? `- Email: ${detected.matchedContact.email}\n` : ""}${detected.matchedContact.isOwner ? "- Role: Property owner\n" : ""}${detected.matchedContact.isBuyer ? "- Role: Active buyer\n" : ""}- This contact ALREADY EXISTS in the CRM (id: ${detected.matchedContact.id})`
        : detected && detected.primaryContactName
        ? `RECIPIENT (the person you are writing TO — extracted from the thread):
- Name: ${detected.primaryContactName}
${detected.primaryContactCompany ? `- Company: ${detected.primaryContactCompany}\n` : ""}${detected.primaryContactEmail ? `- Email: ${detected.primaryContactEmail}\n` : ""}- This contact does NOT exist in the CRM yet — it should be created.`
        : `RECIPIENT: Could not auto-detect from the input. Use whatever name appears in the user's input.`;

      const senderBlock = `SENDER (you are writing AS this person — they are the broker, never the recipient):
- Name: ${senderName}
${profile?.company ? `- Company: ${profile.company}\n` : ""}${profile?.title ? `- Title: ${profile.title}\n` : ""}`;

      const taskBlock =
        mode === "edit"
          ? `The user pasted the contents of their email client below. Their unfinished draft (the email they're about to send) is at the TOP. Below the draft is the prior thread — typically separated by "On [date], [name] wrote:" or "From:" lines or quoted text starting with ">".

Your job: edit ONLY the unfinished draft at the top, in the broker's voice. Use the prior thread for context but do NOT include it in your output. Do not change facts. Do not invent details.`
          : `Compose an email FROM ${senderName} TO the recipient. Use the broker's voice. The intent is below.`;

      const inputBlock =
        mode === "edit"
          ? `EMAIL CLIENT PASTE (draft at top, prior thread below):\n${pasteContent}`
          : `INTENT (what ${senderName} wants the email to say):\n${intent}\n\n${composeThread.trim() ? `PRIOR THREAD CONTEXT:\n${composeThread}` : ""}`;

      const fullPrompt = `${stylePrompt}

---

${senderBlock}

${recipientBlock}

${taskBlock}

${inputBlock}

---

Return ONLY a valid JSON object with this exact structure (no markdown, no backticks, no commentary outside the JSON):

{
  "emailBody": "the complete email body, plain text. Start with 'Hi [first name],' on its own line, then a blank line, then the body, then 'Thanks,' on its own line. Do NOT include the sender's name or signature — those are appended automatically.",
  "detectedRecipient": {
    "firstName": "${detected?.matchedContact?.firstName ?? detected?.primaryContactName?.split(" ")[0] ?? ""}",
    "lastName": "${detected?.matchedContact?.lastName ?? detected?.primaryContactName?.split(" ").slice(1).join(" ") ?? ""}",
    "email": "${detected?.matchedContact?.email ?? detected?.primaryContactEmail ?? ""}",
    "company": "${detected?.matchedContact?.company ?? detected?.primaryContactCompany ?? ""}"
  },
  "suggestedActions": [
    {
      "type": "log_activity",
      "activityType": "email",
      "subject": "short subject for the activity log entry",
      "notes": "1-2 sentence summary of what this email is about and any commitments made",
      "contactName": "first and last name of the recipient",
      "reason": "logging this outbound email to the recipient's history"
    }
  ]
}

For suggestedActions: ALWAYS include exactly one log_activity action for this email. Then add create_task actions for ANY follow-up commitments mentioned (e.g. "I'll send you the T12", "let's schedule a tour", "circle back next week", "I'll get you the rent roll"). Add create_contact actions ONLY for NEW people mentioned in the thread/intent who aren't the recipient and aren't already in the CRM. Generate as few or as many actions as the email content actually warrants.`;

      const response = await invokeLlm.mutateAsync({ prompt: fullPrompt });
      const text = response.text?.trim() ?? "";
      const cleaned = text.replace(/^```json\s*|\s*```$/g, "").trim();
      const parsed = JSON.parse(cleaned);

      // Merge AI's parsed result with detection metadata
      const result: AnalysisResult = {
        emailBody: parsed.emailBody,
        detectedRecipient: {
          contactId: detected?.matchedContact?.id ?? null,
          firstName: parsed.detectedRecipient?.firstName ?? "",
          lastName: parsed.detectedRecipient?.lastName ?? "",
          email: parsed.detectedRecipient?.email ?? "",
          company: parsed.detectedRecipient?.company ?? "",
          confidence: detected?.confidence ?? "low",
          reasoning: detected?.reasoning ?? "",
          isExisting: !!detected?.matchedContact?.id,
        },
        suggestedActions: parsed.suggestedActions ?? [],
      };

      // If recipient was new and not auto-added to CRM yet, prepend a create_contact action
      if (!result.detectedRecipient.isExisting && result.detectedRecipient.firstName) {
        result.suggestedActions.unshift({
          type: "create_contact",
          firstName: result.detectedRecipient.firstName,
          lastName: result.detectedRecipient.lastName,
          email: result.detectedRecipient.email || undefined,
          company: result.detectedRecipient.company || undefined,
          reason: "Auto-create the recipient since they're not in the CRM yet",
        });
      }

      setAnalysis(result);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to generate email");
    } finally {
      setIsProcessing(false);
    }
  };

  const finalEmail = useMemo(() => {
    if (!analysis) return "";
    let body = analysis.emailBody.trim();
    if (profile?.signature?.trim()) {
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
    if (!analysis) return;
    setIsApplying(true);
    try {
      const accepted = analysis.suggestedActions.filter((_, i) => acceptedActions.has(i));

      // Track contacts we create so we can link them to subsequent activities/tasks
      const nameToId = new Map<string, number>();
      if (analysis.detectedRecipient.contactId) {
        nameToId.set(
          `${analysis.detectedRecipient.firstName} ${analysis.detectedRecipient.lastName}`.toLowerCase().trim(),
          analysis.detectedRecipient.contactId,
        );
      }

      let createdCount = 0;
      let activityCount = 0;
      let taskCount = 0;

      // 1. Create new contacts FIRST so we can link to them
      for (const action of accepted) {
        if (action.type === "create_contact") {
          try {
            const created = await createContact.mutateAsync({
              firstName: action.firstName,
              lastName: action.lastName,
              email: action.email || undefined,
              phone: action.phone || undefined,
              company: action.company || undefined,
            });
            const key = `${created.firstName} ${created.lastName}`.toLowerCase().trim();
            nameToId.set(key, created.id);
            createdCount++;
          } catch (err) {
            console.warn("Failed to create contact:", err);
          }
        }
      }

      const resolveContactId = (name?: string): number | undefined => {
        if (!name) return analysis.detectedRecipient.contactId ?? undefined;
        const id = nameToId.get(name.toLowerCase().trim());
        return id ?? analysis.detectedRecipient.contactId ?? undefined;
      };

      // 2. Log activities
      for (const action of accepted) {
        if (action.type === "log_activity") {
          await createActivity.mutateAsync({
            type: action.activityType,
            direction: "outbound",
            subject: action.subject,
            notes: action.notes,
            contactId: resolveContactId(action.contactName),
          });
          activityCount++;
        }
      }

      // 3. Create tasks
      const newTasks = accepted
        .filter((a): a is Extract<SuggestedAction, { type: "create_task" }> => a.type === "create_task")
        .map((t) => ({
          title: t.title,
          description: t.description,
          priority: "medium" as const,
          type: "follow_up" as const,
          contactId: resolveContactId(t.contactName),
          dueDaysFromNow: t.dueDaysFromNow,
        }));
      if (newTasks.length > 0) {
        await applyActions.mutateAsync({ newTasks });
        taskCount = newTasks.length;
      }

      utils.contacts.list.invalidate();
      utils.activities.list.invalidate();
      utils.tasks.list.invalidate();

      const parts: string[] = [];
      if (createdCount) parts.push(`${createdCount} contact${createdCount > 1 ? "s" : ""}`);
      if (activityCount) parts.push(`${activityCount} activit${activityCount > 1 ? "ies" : "y"}`);
      if (taskCount) parts.push(`${taskCount} task${taskCount > 1 ? "s" : ""}`);
      toast.success(`Done — ${parts.join(", ") || "no changes"}`);
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
            Paste an email or describe what you want to say. Brokrbase figures out who you're talking to,
            edits in your voice, logs the activity, and builds follow-up tasks. All of it.
          </p>
        </div>
      </div>

      {/* Sending-as banner */}
      <div
        className={`rounded-md border p-3 text-sm ${
          profileComplete
            ? "bg-primary/5 border-primary/20"
            : "bg-yellow-50 border-yellow-300"
        }`}
      >
        {profileComplete ? (
          <div className="flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="text-sm">
              <span className="font-medium">Sending as </span>
              <span className="text-primary font-medium">{senderDisplayName}</span>
              {profile?.title ? ` · ${profile.title}` : ""}
              {profile?.company ? ` · ${profile.company}` : ""}
              <span className="text-muted-foreground"> · </span>
              <a href="/settings" className="text-muted-foreground underline">edit</a>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <X className="h-4 w-4 text-yellow-700 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium text-yellow-900">Your profile isn't filled in yet</div>
              <div className="text-xs text-yellow-800 mt-0.5">
                Brokrbase needs to know your name + company to draft as you.{" "}
                <a href="/settings" className="underline font-semibold">
                  Go to Settings →
                </a>
              </div>
            </div>
          </div>
        )}
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
                Paste from your email client
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={14}
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                placeholder="Paste the entire compose window from Gmail/Outlook. Your unfinished draft at the top, the prior thread below it. Brokrbase will auto-detect who you're emailing, edit your draft in your voice, and suggest CRM updates."
              />
              <p className="text-xs text-muted-foreground mt-2">
                No need to pick a recipient — Brokrbase reads the email addresses in the thread and figures it out.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compose" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                What should the email say?
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={6}
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                placeholder="Describe what you want to say. Include who you're emailing (name + email if you have it), the deal, the ask, any commitments. e.g. 'Email Tom at Clearwater (tom@clearwater.com) about Pinecreek. Send the T12 by Friday and schedule a tour next week.'"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Prior thread (optional)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={4}
                value={composeThread}
                onChange={(e) => setComposeThread(e.target.value)}
                placeholder="If there's a prior email thread, paste it here so Brokrbase can auto-detect the recipient and use it as context."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Button
        onClick={handleGenerate}
        disabled={isProcessing || !profileComplete}
        className="gap-2 w-full"
        size="lg"
      >
        {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {isProcessing
          ? "Drafting + analyzing…"
          : !profileComplete
            ? "Fill in your Settings profile first"
            : mode === "edit"
              ? "Edit + Auto-Update CRM"
              : "Compose + Auto-Update CRM"}
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
            <CardContent className="space-y-3">
              {analysis.detectedRecipient.firstName && (
                <div className="border rounded-md p-2 bg-muted/30 text-xs flex items-start gap-2">
                  <User className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <div>
                      <span className="text-muted-foreground">To: </span>
                      <span className="font-medium">
                        {analysis.detectedRecipient.firstName} {analysis.detectedRecipient.lastName}
                      </span>
                      {analysis.detectedRecipient.company && (
                        <span className="text-muted-foreground"> · {analysis.detectedRecipient.company}</span>
                      )}
                      {analysis.detectedRecipient.email && (
                        <span className="text-muted-foreground"> · {analysis.detectedRecipient.email}</span>
                      )}
                    </div>
                    <div className="text-muted-foreground mt-0.5">
                      {analysis.detectedRecipient.isExisting ? (
                        <>Existing contact in your CRM</>
                      ) : (
                        <>New contact — will be created when you apply updates</>
                      )}
                      {analysis.detectedRecipient.reasoning && ` · ${analysis.detectedRecipient.reasoning}`}
                    </div>
                  </div>
                </div>
              )}
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

CRITICAL: ${name} is the SENDER. They are the broker using the CRM. Never write a reply addressed TO ${name}. They are always the one writing OUT.

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
4. Do not invent information. Do not make up details.${customBlock}`;
}
