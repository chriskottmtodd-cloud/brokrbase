import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
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
  Plus,
  RefreshCw,
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

interface MatchedContactSummary {
  id: number;
  firstName: string;
  lastName: string;
  company: string | null;
  email: string | null;
}

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
  // When multiple contacts match (e.g. duplicates of Troy with the same email),
  // they all show up here so the broker can pick the right one.
  allMatches: MatchedContactSummary[];
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
  const [composeRecipientId, setComposeRecipientId] = useState<number | null>(null);
  const [composeRecipientSearch, setComposeRecipientSearch] = useState("");
  const [showComposePicker, setShowComposePicker] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [acceptedActions, setAcceptedActions] = useState<Set<number>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  // Recipient confirmation state — if AI picked the wrong contact (or there
  // are multiple matches), the broker can swap by picking a different one.
  const [confirmedContactId, setConfirmedContactId] = useState<number | null>(null);
  const [showSwapPicker, setShowSwapPicker] = useState(false);
  const [swapSearch, setSwapSearch] = useState("");
  // Inline edit state for suggested actions
  const [editingActionIdx, setEditingActionIdx] = useState<number | null>(null);
  // Working copy of edited suggested actions (lets the broker tweak before applying)
  const [editedActions, setEditedActions] = useState<SuggestedAction[]>([]);
  // Indices of actions that have been successfully applied — shown in their
  // collapsed/green "done" state so the broker knows what's saved.
  const [appliedActionIdxs, setAppliedActionIdxs] = useState<Set<number>>(new Set());
  const [completedTaskIds, setCompletedTaskIds] = useState<Set<number>>(new Set());

  const profileQuery = trpc.users.getMyProfile.useQuery();
  const profile = profileQuery.data;

  // Load ALL contacts client-side so we can do local fuzzy matching as a
  // backup when the server-side AI detection misses someone.
  const allContactsQuery = trpc.contacts.list.useQuery({ limit: 2000 });
  const allContacts = allContactsQuery.data ?? [];

  // Pending tasks for the detected contact — so broker can mark tasks complete
  const resolvedContactId = confirmedContactId ?? analysis?.detectedRecipient?.contactId ?? null;
  const pendingTasksQuery = trpc.tasks.list.useQuery(
    { contactId: resolvedContactId!, status: "pending" },
    { enabled: !!resolvedContactId },
  );
  const completeTaskMut = trpc.tasks.update.useMutation();

  // Compose mode: lookup the picked recipient
  const composeRecipient = composeRecipientId
    ? allContacts.find((c) => c.id === composeRecipientId) ?? null
    : null;

  // Filter contacts for compose picker search
  const composeSearchResults = composeRecipientSearch.trim()
    ? allContacts
        .filter((c) => {
          const q = composeRecipientSearch.toLowerCase();
          return (
            `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
            (c.company ?? "").toLowerCase().includes(q) ||
            (c.email ?? "").toLowerCase().includes(q)
          );
        })
        .slice(0, 10)
    : allContacts.slice(0, 10);

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
      setEditedActions(analysis.suggestedActions.map((a) => ({ ...a })));
      setAppliedActionIdxs(new Set());
      // Default the confirmed contact to the AI's primary pick (or null if new)
      setConfirmedContactId(analysis.detectedRecipient.contactId);
      setShowSwapPicker(false);
      setSwapSearch("");
      setEditingActionIdx(null);
    }
  }, [analysis]);

  // The confirmed contact is what gets used when applying actions. Defaults
  // to the AI's pick but can be overridden by the broker via the swap UI.
  const confirmedContact = confirmedContactId
    ? allContacts.find((c) => c.id === confirmedContactId) ?? null
    : null;

  // Filter contacts for the swap picker search
  const swapSearchResults = swapSearch.trim()
    ? allContacts
        .filter((c) => {
          const q = swapSearch.toLowerCase();
          return (
            `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
            (c.company ?? "").toLowerCase().includes(q) ||
            (c.email ?? "").toLowerCase().includes(q)
          );
        })
        .slice(0, 10)
    : allContacts.slice(0, 10);

  const handleGenerate = async () => {
    if (!profileComplete) {
      toast.error("Fill in your Settings profile first.");
      return;
    }

    if (mode === "compose" && !composeRecipient) {
      toast.error("Pick who you're emailing first.");
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
      // Step 1: Determine the recipient.
      // - Compose mode: use the picked composeRecipient directly. No detection
      //   needed since the broker explicitly chose who they're emailing.
      // - Edit mode: auto-detect from the pasted thread (it has email addresses).
      let detected: Awaited<ReturnType<typeof detectFromThread.mutateAsync>> | null = null;

      if (mode === "compose" && composeRecipient) {
        // Synthesize a detection result from the picked contact — same shape
        // the rest of the flow expects.
        detected = {
          primaryContactId: composeRecipient.id,
          primaryContactName: `${composeRecipient.firstName} ${composeRecipient.lastName}`,
          primaryContactEmail: composeRecipient.email ?? "",
          primaryContactCompany: composeRecipient.company ?? "",
          primaryContactPhone: composeRecipient.phone ?? "",
          confidence: "high" as const,
          reasoning: "Picked from your contacts in the recipient picker.",
          matchedContact: {
            id: composeRecipient.id,
            firstName: composeRecipient.firstName,
            lastName: composeRecipient.lastName,
            company: composeRecipient.company ?? null,
            email: composeRecipient.email ?? null,
            isOwner: composeRecipient.isOwner ?? false,
            isBuyer: composeRecipient.isBuyer ?? false,
            lastContactedAt: composeRecipient.lastContactedAt ?? null,
          },
        };
      } else if (mode === "edit" && pasteContent.trim().length > 5) {
        // Edit mode: auto-detect from the pasted email thread.
        // CRITICAL: pre-extract emails from the thread and pass the most likely
        // sender email to detection. Without this, detectFromThread skips its
        // most reliable step (Step 0: exact email lookup) and falls back to
        // less reliable AI-by-name matching.
        const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
        const emailsInThread = Array.from(
          new Set((pasteContent.match(emailRegex) ?? []).map((e) => e.toLowerCase().trim())),
        );
        // Skip the broker's own email — they're the sender, not the recipient
        const myEmail = profile?.email?.toLowerCase().trim();
        const candidateEmails = emailsInThread.filter((e) => e !== myEmail);
        // The first candidate email is most likely the recipient (the person
        // who sent the email the broker is replying to)
        const senderEmail = candidateEmails[0];

        try {
          detected = await detectFromThread.mutateAsync({
            thread: pasteContent,
            senderEmail: senderEmail || undefined,
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

      // Detection might return multiple matches when duplicates exist (e.g.
      // two Troys with the same email). Pull them out so the UI can show all.
      // The shape comes from the server's allEmailMatches field — fall back to
      // a single-element array if only one matchedContact came back.
      const detectedAny = detected as
        | (typeof detected & { allEmailMatches?: MatchedContactSummary[] })
        | null;
      const allMatches: MatchedContactSummary[] = detectedAny?.allEmailMatches?.length
        ? detectedAny.allEmailMatches.map((c) => ({
            id: c.id,
            firstName: c.firstName,
            lastName: c.lastName,
            company: c.company ?? null,
            email: c.email ?? null,
          }))
        : detected?.matchedContact
          ? [
              {
                id: detected.matchedContact.id,
                firstName: detected.matchedContact.firstName,
                lastName: detected.matchedContact.lastName,
                company: detected.matchedContact.company ?? null,
                email: detected.matchedContact.email ?? null,
              },
            ]
          : [];

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
        allMatches,
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

  // Reset everything for a fresh email — keeps the profile, tab, and loaded
  // contacts but clears all input + result state. Used by the "Start new email"
  // buttons at the top and bottom of the page.
  const resetForNewEmail = () => {
    setPasteContent("");
    setIntent("");
    setComposeThread("");
    setComposeRecipientId(null);
    setComposeRecipientSearch("");
    setShowComposePicker(false);
    setAnalysis(null);
    setAcceptedActions(new Set());
    setEditedActions([]);
    setAppliedActionIdxs(new Set());
    setEditingActionIdx(null);
    setConfirmedContactId(null);
    setShowSwapPicker(false);
    setSwapSearch("");
    // Scroll to top so the broker sees the empty input box right away
    window.scrollTo({ top: 0, behavior: "smooth" });
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
      // If the broker confirmed an existing contact (via auto-detect or swap),
      // skip any "create_contact" action that targets the recipient — they
      // already exist, no need to make a duplicate.
      // Use editedActions so any in-place edits the broker made are applied.
      // Skip already-applied actions so re-applying after adding a new task
      // only fires the new ones.
      const indicesToApply: number[] = [];
      const accepted = editedActions
        .map((a, i) => ({ a, i }))
        .filter(({ i }) => acceptedActions.has(i) && !appliedActionIdxs.has(i))
        .filter(({ a }) => {
          if (confirmedContactId && a.type === "create_contact") {
            const recipientName = `${analysis.detectedRecipient.firstName} ${analysis.detectedRecipient.lastName}`
              .toLowerCase()
              .trim();
            const actionName = `${a.firstName} ${a.lastName}`.toLowerCase().trim();
            if (recipientName === actionName) return false;
          }
          return true;
        })
        .map(({ a, i }) => {
          indicesToApply.push(i);
          return a;
        });

      // Track contacts we create so we can link them to subsequent activities/tasks.
      // Seed with the broker-confirmed contact (or AI's pick if not confirmed).
      const nameToId = new Map<string, number>();
      const linkedRecipientId = confirmedContactId ?? analysis.detectedRecipient.contactId;
      if (linkedRecipientId) {
        const c = confirmedContact ?? null;
        const key = c
          ? `${c.firstName} ${c.lastName}`.toLowerCase().trim()
          : `${analysis.detectedRecipient.firstName} ${analysis.detectedRecipient.lastName}`.toLowerCase().trim();
        nameToId.set(key, linkedRecipientId);
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
        if (!name) return linkedRecipientId ?? undefined;
        const id = nameToId.get(name.toLowerCase().trim());
        return id ?? linkedRecipientId ?? undefined;
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

      // Mark these actions as applied so they collapse to the green "done" state
      const nextApplied = new Set(appliedActionIdxs);
      indicesToApply.forEach((i) => nextApplied.add(i));
      setAppliedActionIdxs(nextApplied);

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

  // Show the reset button only when there's something to reset
  const hasContent = !!(pasteContent || intent || composeThread || composeRecipientId || analysis);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
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
        {hasContent && (
          <Button
            variant="outline"
            size="sm"
            onClick={resetForNewEmail}
            className="gap-1 shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5" /> New email
          </Button>
        )}
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
          <TabsTrigger value="edit">Edit a Reply</TabsTrigger>
          <TabsTrigger value="compose">Compose New Email</TabsTrigger>
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
          {/* Compose-mode recipient picker */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Email To
              </CardTitle>
            </CardHeader>
            <CardContent>
              {composeRecipient ? (
                <div className="flex items-center justify-between gap-2 border rounded-md p-3 bg-muted/30">
                  <div>
                    <div className="font-medium">
                      {composeRecipient.firstName} {composeRecipient.lastName}
                    </div>
                    {composeRecipient.company && (
                      <div className="text-xs text-muted-foreground">{composeRecipient.company}</div>
                    )}
                    {composeRecipient.email && (
                      <div className="text-xs text-muted-foreground">{composeRecipient.email}</div>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setComposeRecipientId(null)}>
                    Change
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={composeRecipientSearch}
                    onChange={(e) => {
                      setComposeRecipientSearch(e.target.value);
                      setShowComposePicker(true);
                    }}
                    onFocus={() => setShowComposePicker(true)}
                    placeholder="Search contacts by name, email, or company…"
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  />
                  {showComposePicker && (
                    <div className="max-h-60 overflow-y-auto border rounded-md">
                      {composeSearchResults.length === 0 && (
                        <p className="text-xs text-muted-foreground p-2">No matching contacts</p>
                      )}
                      {composeSearchResults.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setComposeRecipientId(c.id);
                            setShowComposePicker(false);
                            setComposeRecipientSearch("");
                          }}
                          className="block w-full text-left p-2 hover:bg-muted text-sm border-b last:border-b-0"
                        >
                          <div className="font-medium">{c.firstName} {c.lastName}</div>
                          {c.company && <div className="text-xs text-muted-foreground">{c.company}</div>}
                          {c.email && <div className="text-xs text-muted-foreground">{c.email}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

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
                placeholder="Describe what you want to say. Bullet points or sentences — anything goes. Include the deal, the ask, any commitments. e.g. 'Send the T12 by Friday and schedule a tour next week.'"
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
        disabled={isProcessing || !profileComplete || (mode === "compose" && !composeRecipient)}
        className="gap-2 w-full"
        size="lg"
      >
        {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {isProcessing
          ? "Drafting + analyzing…"
          : !profileComplete
            ? "Fill in your Settings profile first"
            : mode === "compose" && !composeRecipient
              ? "Pick who you're emailing first"
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
              {/* Recipient confirmation card — shows the detected contact (or
                  multiple matches when there are duplicates), with a "Wrong
                  person?" swap option to let the broker pick a different one. */}
              {analysis.detectedRecipient.firstName && (
                <div className="border rounded-md p-3 bg-muted/30 text-sm space-y-2">
                  {/* Confirmed contact pill */}
                  {confirmedContact ? (
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            <span className="text-muted-foreground font-normal">To: </span>
                            {confirmedContact.firstName} {confirmedContact.lastName}
                            {confirmedContact.company && (
                              <span className="text-muted-foreground font-normal"> · {confirmedContact.company}</span>
                            )}
                          </div>
                          {confirmedContact.email && (
                            <div className="text-xs text-muted-foreground">{confirmedContact.email}</div>
                          )}
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Existing contact · email will log to this record
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowSwapPicker(!showSwapPicker)}
                        className="text-xs h-7 shrink-0"
                      >
                        {showSwapPicker ? "Cancel" : "Wrong person?"}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <X className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium">
                            <span className="text-muted-foreground font-normal">To: </span>
                            {analysis.detectedRecipient.firstName} {analysis.detectedRecipient.lastName}
                            {analysis.detectedRecipient.company && (
                              <span className="text-muted-foreground font-normal"> · {analysis.detectedRecipient.company}</span>
                            )}
                          </div>
                          {analysis.detectedRecipient.email && (
                            <div className="text-xs text-muted-foreground">{analysis.detectedRecipient.email}</div>
                          )}
                          <div className="text-xs text-yellow-700 mt-0.5">
                            Not found in CRM — will be created as new contact
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowSwapPicker(!showSwapPicker)}
                        className="text-xs h-7 shrink-0"
                      >
                        {showSwapPicker ? "Cancel" : "Pick existing"}
                      </Button>
                    </div>
                  )}

                  {/* Multiple-match list — when 2+ contacts share the email */}
                  {analysis.allMatches.length > 1 && !showSwapPicker && (
                    <div className="border-t pt-2 mt-2">
                      <p className="text-xs text-muted-foreground mb-1.5">
                        Found {analysis.allMatches.length} contacts with this email — pick the right one:
                      </p>
                      <div className="space-y-1">
                        {analysis.allMatches.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setConfirmedContactId(c.id)}
                            className={`block w-full text-left text-xs p-2 rounded border transition-colors ${
                              confirmedContactId === c.id
                                ? "bg-primary/10 border-primary/40"
                                : "bg-background border-border hover:bg-muted/50"
                            }`}
                          >
                            <div className="font-medium">
                              {c.firstName} {c.lastName}
                            </div>
                            {c.company && <div className="text-muted-foreground">{c.company}</div>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Swap picker — full search across all contacts */}
                  {showSwapPicker && (
                    <div className="border-t pt-2 mt-2 space-y-2">
                      <input
                        type="text"
                        autoFocus
                        value={swapSearch}
                        onChange={(e) => setSwapSearch(e.target.value)}
                        placeholder="Search by name, email, or company…"
                        className="w-full px-2 py-1.5 border rounded text-xs"
                      />
                      <div className="max-h-48 overflow-y-auto border rounded">
                        {swapSearchResults.length === 0 && (
                          <p className="text-xs text-muted-foreground p-2">No matching contacts</p>
                        )}
                        {swapSearchResults.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setConfirmedContactId(c.id);
                              setShowSwapPicker(false);
                              setSwapSearch("");
                              toast.success(`Switched to ${c.firstName} ${c.lastName}`);
                            }}
                            className="block w-full text-left p-2 hover:bg-muted text-xs border-b last:border-b-0"
                          >
                            <div className="font-medium">{c.firstName} {c.lastName}</div>
                            {c.company && <div className="text-muted-foreground">{c.company}</div>}
                            {c.email && <div className="text-muted-foreground">{c.email}</div>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
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
              <p className="text-xs text-muted-foreground">
                Click any item to edit before applying. Uncheck what you don't want.
              </p>

              {editedActions.map((action, i) => {
                const isEditing = editingActionIdx === i;
                const isAccepted = acceptedActions.has(i);
                const isApplied = appliedActionIdxs.has(i);

                // Applied actions: collapsed green "done" state — no edit, no checkbox toggle
                if (isApplied) {
                  return (
                    <div
                      key={i}
                      className="border rounded-md px-2 py-1.5 bg-green-50 border-green-300 text-xs flex items-center gap-2"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-700 shrink-0" />
                      <span className="text-green-900 truncate">{describeAction(action)}</span>
                      <span className="text-[10px] text-green-700 ml-auto shrink-0">Done</span>
                    </div>
                  );
                }

                if (isEditing) {
                  return (
                    <div key={i} className="border rounded-md p-2 bg-primary/5 border-primary/30 space-y-2">
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {action.type.replace("_", " ")}
                      </Badge>
                      <ActionEditForm
                        action={action}
                        onSave={(updated) => {
                          const next = [...editedActions];
                          next[i] = updated;
                          setEditedActions(next);
                          setEditingActionIdx(null);
                        }}
                        onCancel={() => setEditingActionIdx(null)}
                      />
                    </div>
                  );
                }

                return (
                  <div
                    key={i}
                    className={`border rounded-md p-2 transition-colors ${
                      isAccepted ? "bg-primary/5 border-primary/30" : "opacity-50"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => toggleAction(i)}
                        className="mt-0.5 shrink-0"
                      >
                        {isAccepted ? (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <Badge variant="outline" className="text-[10px] capitalize mb-1">
                          {action.type.replace("_", " ")}
                        </Badge>
                        <div className="text-sm font-medium">{describeAction(action)}</div>
                        {action.type === "log_activity" && action.notes && (
                          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{action.notes}</div>
                        )}
                        {action.type === "create_task" && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Due in {action.dueDaysFromNow} day{action.dueDaysFromNow === 1 ? "" : "s"}
                            {action.description && ` · ${action.description.slice(0, 60)}`}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingActionIdx(i)}
                        className="text-xs text-muted-foreground hover:text-foreground shrink-0"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Pending tasks for this contact — mark complete */}
              {resolvedContactId && pendingTasksQuery.data && pendingTasksQuery.data.length > 0 && (
                <div className="border rounded-md p-2 space-y-1.5">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Pending Tasks for {confirmedContact?.firstName ?? analysis?.detectedRecipient?.firstName ?? "this contact"}
                  </div>
                  {pendingTasksQuery.data.map((task) => {
                    const isCompleted = completedTaskIds.has(task.id);
                    return (
                      <div key={task.id} className="flex items-start gap-2">
                        <button
                          type="button"
                          disabled={isCompleted}
                          onClick={async () => {
                            try {
                              await completeTaskMut.mutateAsync({ id: task.id, status: "completed" });
                              setCompletedTaskIds((prev) => new Set(prev).add(task.id));
                              toast.success(`Completed: ${task.title}`);
                            } catch {
                              toast.error("Failed to complete task");
                            }
                          }}
                          className="mt-0.5 shrink-0"
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/40" />
                          )}
                        </button>
                        <div className={`flex-1 min-w-0 ${isCompleted ? "line-through text-muted-foreground" : ""}`}>
                          <div className="text-sm">{task.title}</div>
                          {task.dueAt && (
                            <div className="text-[10px] text-muted-foreground">
                              Due {formatDistanceToNow(new Date(task.dueAt), { addSuffix: true })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* + Add follow-up task — broker's most common manual addition */}
              <button
                type="button"
                onClick={() => {
                  const recipient = confirmedContact
                    ? `${confirmedContact.firstName} ${confirmedContact.lastName}`
                    : `${analysis.detectedRecipient.firstName} ${analysis.detectedRecipient.lastName}`.trim();
                  const newTask: SuggestedAction = {
                    type: "create_task",
                    title: recipient ? `Follow up with ${recipient}` : "Follow up",
                    description: "",
                    dueDaysFromNow: 7,
                    contactName: recipient || undefined,
                    reason: "Manual follow-up reminder",
                  };
                  const next = [...editedActions, newTask];
                  setEditedActions(next);
                  // Auto-accept the new task and open it for editing
                  const nextAccepted = new Set(acceptedActions);
                  nextAccepted.add(next.length - 1);
                  setAcceptedActions(nextAccepted);
                  setEditingActionIdx(next.length - 1);
                }}
                className="w-full text-sm text-primary hover:bg-primary/5 border border-dashed border-primary/30 rounded-md py-2 transition-colors"
              >
                + Add follow-up task
              </button>

              {(() => {
                // Count how many accepted actions are NOT yet applied
                const pendingCount = Array.from(acceptedActions).filter((i) => !appliedActionIdxs.has(i)).length;
                const totalApplied = appliedActionIdxs.size;
                return (
                  <Button
                    onClick={handleApplyActions}
                    disabled={isApplying || pendingCount === 0}
                    className="w-full gap-2"
                  >
                    {isApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {isApplying
                      ? "Applying…"
                      : pendingCount === 0 && totalApplied > 0
                        ? `All ${totalApplied} updates applied ✓`
                        : `Apply ${pendingCount} update${pendingCount === 1 ? "" : "s"}`}
                  </Button>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Big "Start a new email" CTA after applying — broker's natural next step */}
      {analysis && appliedActionIdxs.size > 0 && (
        <div className="border-2 border-dashed border-primary/30 rounded-lg p-4 bg-primary/5 flex flex-col items-center gap-2">
          <p className="text-sm text-muted-foreground text-center">
            Done with this one. Ready for the next?
          </p>
          <Button
            onClick={resetForNewEmail}
            size="lg"
            className="gap-2"
          >
            <Plus className="h-4 w-4" /> Start a New Email
          </Button>
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

// Inline edit form for a suggested action — different fields per action type
function ActionEditForm({
  action,
  onSave,
  onCancel,
}: {
  action: SuggestedAction;
  onSave: (updated: SuggestedAction) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<SuggestedAction>({ ...action });

  return (
    <div className="space-y-2 text-sm">
      {draft.type === "log_activity" && (
        <>
          <div>
            <label className="text-xs text-muted-foreground">Subject</label>
            <input
              type="text"
              value={draft.subject}
              onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
              className="w-full px-2 py-1 border rounded text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Notes</label>
            <textarea
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              rows={3}
              className="w-full px-2 py-1 border rounded text-sm font-sans"
            />
          </div>
        </>
      )}
      {draft.type === "create_task" && (
        <>
          <div>
            <label className="text-xs text-muted-foreground">Task title</label>
            <input
              type="text"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="w-full px-2 py-1 border rounded text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Description</label>
            <textarea
              value={draft.description ?? ""}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              rows={2}
              className="w-full px-2 py-1 border rounded text-sm font-sans"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Due in (days)</label>
            <input
              type="number"
              min={0}
              value={draft.dueDaysFromNow}
              onChange={(e) => setDraft({ ...draft, dueDaysFromNow: Number(e.target.value) || 0 })}
              className="w-24 px-2 py-1 border rounded text-sm"
            />
          </div>
        </>
      )}
      {draft.type === "create_contact" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">First</label>
              <input
                type="text"
                value={draft.firstName}
                onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
                className="w-full px-2 py-1 border rounded text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Last</label>
              <input
                type="text"
                value={draft.lastName}
                onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
                className="w-full px-2 py-1 border rounded text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Email</label>
            <input
              type="email"
              value={draft.email ?? ""}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              className="w-full px-2 py-1 border rounded text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Company</label>
            <input
              type="text"
              value={draft.company ?? ""}
              onChange={(e) => setDraft({ ...draft, company: e.target.value })}
              className="w-full px-2 py-1 border rounded text-sm"
            />
          </div>
        </>
      )}
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={onCancel} className="h-7 text-xs">
          Cancel
        </Button>
        <Button size="sm" onClick={() => onSave(draft)} className="h-7 text-xs">
          Save
        </Button>
      </div>
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
