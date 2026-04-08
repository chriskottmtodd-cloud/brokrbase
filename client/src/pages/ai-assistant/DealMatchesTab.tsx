import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2, Building2, Zap, Users,
  RefreshCw, AlertTriangle, ArrowRight, Star, Phone, Mail,
} from "lucide-react";
import { Link } from "wouter";

type DealMatch = { matchScore: number; ownerId: number; ownerName: string; propertyId: number; propertyName: string; propertyType: string; propertyUnits: number; propertyVintage: number; propertyCity: string; buyerId: number; buyerName: string; ownerSignal: string; buyerSignal: string; matchReason: string; recommendedAction: string; urgency: string; };

export function DealMatches() {
  const [matches, setMatches] = useState<DealMatch[]>([]);
  const [scanStats, setScanStats] = useState<{ scannedOwners: number; scannedBuyers: number; scannedActivities: number } | null>(null);
  const [hasRun, setHasRun] = useState(false);
  const findMatches = trpc.ai.findDealMatches.useMutation({
    onSuccess: (data) => { setMatches(data.matches); setScanStats({ scannedOwners: data.scannedOwners, scannedBuyers: data.scannedBuyers, scannedActivities: data.scannedActivities }); setHasRun(true); if (!data.matches.length) toast.info("No matches yet. Add more activity notes to improve results."); else toast.success(`Found ${data.matches.length} potential match${data.matches.length !== 1 ? "es" : ""}!`); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const urgencyColor = (u: string) => u === "high" ? "bg-red-500/20 text-red-400 border-red-500/30" : u === "medium" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" : "bg-blue-500/20 text-blue-400 border-blue-500/30";
  const scoreColor  = (s: number) => s >= 80 ? "text-green-400" : s >= 60 ? "text-yellow-400" : "text-orange-400";
  const scoreLabel  = (s: number) => s >= 80 ? "Strong Match" : s >= 60 ? "Good Match" : "Possible Match";

  return (
    <div className="space-y-5">
      <Card className="border-border bg-card">
        <CardContent className="pt-5 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 shrink-0"><Zap className="h-5 w-5 text-yellow-400" /></div>
              <div>
                <h2 className="font-semibold text-foreground">AI Deal Matchmaker</h2>
                <p className="text-sm text-muted-foreground mt-0.5 max-w-xl">Scans all logged conversations with owners and buyers to find potential deals — owner who hinted at selling matched against a buyer with the right criteria.</p>
                {scanStats && <div className="flex gap-4 mt-2">{[["scannedOwners","owners"],["scannedBuyers","buyers"],["scannedActivities","conversations"]].map(([k,l]) => <span key={k} className="text-xs text-muted-foreground"><span className="text-foreground font-medium">{(scanStats as any)[k]}</span> {l} scanned</span>)}</div>}
              </div>
            </div>
            <Button onClick={() => findMatches.mutate({})} disabled={findMatches.isPending} className="bg-yellow-500 hover:bg-yellow-400 text-black font-semibold shrink-0 gap-2">
              {findMatches.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Scanning…</> : hasRun ? <><RefreshCw className="h-4 w-4" />Re-scan</> : <><Zap className="h-4 w-4" />Find Matches</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {findMatches.isPending && <Card className="border-border bg-card"><CardContent className="py-12 flex flex-col items-center gap-3"><Loader2 className="h-8 w-8 text-yellow-400 animate-spin" /><p className="text-sm font-medium">Analyzing conversations…</p></CardContent></Card>}
      {!findMatches.isPending && hasRun && !matches.length && <Card className="border-border bg-card"><CardContent className="py-12 flex flex-col items-center gap-3"><AlertTriangle className="h-8 w-8 text-muted-foreground" /><p className="text-sm">No matches found yet. Log more conversations to improve results.</p></CardContent></Card>}
      {!findMatches.isPending && !hasRun && <Card className="border-border bg-card border-dashed"><CardContent className="py-10 text-center"><p className="text-sm text-muted-foreground">Click Find Matches to scan all your conversations for hidden deal opportunities.</p></CardContent></Card>}

      {!findMatches.isPending && matches.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-foreground">{matches.length} Potential Match{matches.length !== 1 ? "es" : ""}</p>
          {matches.map((match, i) => (
            <Card key={i} className={`border-border bg-card ${match.urgency === "high" ? "border-l-2 border-l-red-500" : match.urgency === "medium" ? "border-l-2 border-l-yellow-500" : ""}`}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center shrink-0 w-14"><span className={`text-2xl font-bold ${scoreColor(match.matchScore)}`}>{match.matchScore}</span><span className="text-[10px] text-muted-foreground text-center">{scoreLabel(match.matchScore)}</span></div>
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/contacts/${match.ownerId}`}><Badge variant="outline" className="gap-1 cursor-pointer hover:bg-muted/20 border-blue-500/40 text-blue-300"><Building2 className="h-3 w-3" />{match.ownerName}</Badge></Link>
                      <span className="text-muted-foreground text-xs">owns</span>
                      <Link href={`/properties/${match.propertyId}`}><Badge variant="outline" className="cursor-pointer hover:bg-muted/20">{match.propertyName} · {match.propertyUnits}u · {match.propertyCity}</Badge></Link>
                      <ArrowRight className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
                      <Link href={`/contacts/${match.buyerId}`}><Badge variant="outline" className="gap-1 cursor-pointer hover:bg-muted/20 border-green-500/40 text-green-300"><Users className="h-3 w-3" />{match.buyerName}</Badge></Link>
                      <Badge variant="outline" className={`text-[10px] capitalize ${urgencyColor(match.urgency)}`}>{match.urgency} urgency</Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div className="bg-blue-500/5 border border-blue-500/20 rounded-md p-2.5"><p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide mb-1">Owner Signal</p><p className="text-xs text-foreground/80">{match.ownerSignal}</p></div>
                      <div className="bg-green-500/5 border border-green-500/20 rounded-md p-2.5"><p className="text-[10px] font-semibold text-green-400 uppercase tracking-wide mb-1">Buyer Signal</p><p className="text-xs text-foreground/80">{match.buyerSignal}</p></div>
                    </div>
                    <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-md p-2.5"><p className="text-[10px] font-semibold text-yellow-400 uppercase tracking-wide mb-1">Why This Matches</p><p className="text-xs text-foreground/80">{match.matchReason}</p></div>
                    <div className="flex items-start gap-2"><Star className="h-3.5 w-3.5 text-yellow-400 shrink-0 mt-0.5" /><p className="text-xs text-foreground font-medium">{match.recommendedAction}</p></div>
                    <div className="flex gap-2 flex-wrap pt-1">
                      <Link href={`/contacts/${match.ownerId}`}><Button variant="outline" size="sm" className="h-7 text-xs gap-1.5"><Phone className="h-3 w-3" />Call {match.ownerName.split(" ")[0]}</Button></Link>
                      <Link href={`/contacts/${match.buyerId}`}><Button variant="outline" size="sm" className="h-7 text-xs gap-1.5"><Mail className="h-3 w-3" />Email {match.buyerName.split(" ")[0]}</Button></Link>
                      <Link href={`/properties/${match.propertyId}`}><Button variant="outline" size="sm" className="h-7 text-xs gap-1.5"><Building2 className="h-3 w-3" />View Property</Button></Link>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
