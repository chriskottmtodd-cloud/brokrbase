import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Sparkles, MessageSquare, Loader2 } from "lucide-react";
import { ContactSearchPicker, type PickedContact } from "@/components/ContactSearchPicker";
import { Streamdown } from "streamdown";

export function OutreachWriter() {
  const [contact,      setContact]      = useState<PickedContact | null>(null);
  const [outreachType, setOutreachType] = useState("initial_contact" as "initial_contact"|"follow_up"|"offer_discussion"|"market_update");
  const [context,      setContext]      = useState("");
  const [result,       setResult]       = useState<{ subject: string; body: string; callScript: string } | null>(null);
  const [showTab,      setShowTab]      = useState<"email"|"call">("email");

  const generate = trpc.ai.generateOutreach.useMutation({
    onSuccess: (data) => setResult(data),
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card className="border-border bg-card">
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5" />Outreach Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Contact *</Label>
            <ContactSearchPicker value={contact} onChange={setContact} allowCreate placeholder="Search contact…" />
          </div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Outreach Type</Label>
            <Select value={outreachType} onValueChange={(v) => setOutreachType(v as any)}>
              <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="initial_contact">Initial Contact</SelectItem><SelectItem value="follow_up">Follow Up</SelectItem><SelectItem value="offer_discussion">Offer Discussion</SelectItem><SelectItem value="market_update">Market Update</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Context / Goal</Label>
            <Textarea value={context} onChange={(e) => setContext(e.target.value)} placeholder="e.g. First outreach about 80-unit MHC in Boise. Goal: gauge interest in selling…" className="bg-background border-border resize-none" rows={5} />
          </div>
          <Button onClick={() => { if (!contact) return toast.error("Select a contact"); generate.mutate({ contactName: `${contact!.firstName} ${contact!.lastName}`, contactRole: contact!.isOwner ? "owner" : "buyer", outreachType, conversationContext: context || undefined }); }} disabled={generate.isPending || !contact} className="w-full gap-2">
            {generate.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Writing…</> : <><Sparkles className="h-4 w-4" />Generate Message</>}
          </Button>
        </CardContent>
      </Card>
      <Card className="border-border bg-card">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-primary" />Generated Message</CardTitle>
          {result && (
            <div className="flex gap-1">
              <button onClick={() => setShowTab("email")} className={`px-2 py-1 text-xs rounded ${showTab === "email" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Email</button>
              <button onClick={() => setShowTab("call")}  className={`px-2 py-1 text-xs rounded ${showTab === "call"  ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Call Script</button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {!result && !generate.isPending ? <div className="py-12 text-center text-muted-foreground"><MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-20" /><p className="text-sm">Select a contact and click Generate</p></div>
          : generate.isPending ? <div className="py-12 text-center text-muted-foreground"><Loader2 className="h-10 w-10 mx-auto mb-3 animate-spin text-primary" /><p className="text-sm">Writing your message…</p></div>
          : result ? (
            <div className="space-y-3">
              {showTab === "email" && (<><div className="bg-muted/30 rounded-md px-3 py-2"><span className="text-xs text-muted-foreground">Subject: </span><span className="text-sm font-medium text-foreground">{result.subject}</span></div><div className="text-sm text-foreground prose prose-invert max-w-none"><Streamdown>{result.body}</Streamdown></div><Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { navigator.clipboard.writeText(`Subject: ${result.subject}\n\n${result.body}`); toast.success("Copied!"); }}>Copy Email</Button></>)}
              {showTab === "call"  && (<><div className="text-sm text-foreground prose prose-invert max-w-none"><Streamdown>{result.callScript}</Streamdown></div><Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { navigator.clipboard.writeText(result.callScript); toast.success("Copied!"); }}>Copy Script</Button></>)}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
