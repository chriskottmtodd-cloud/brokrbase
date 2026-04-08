import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Sparkles, TrendingUp, Loader2 } from "lucide-react";
import { Streamdown } from "streamdown";

export function DealAnalysis() {
  const [form, setForm] = useState({ unitCount: "", vintageYear: "", city: "Boise", propertyType: "mhc" as "mhc"|"apartment"|"affordable_housing", askingPrice: "", noi: "" });
  const [result, setResult] = useState<string | null>(null);
  const { data: properties } = trpc.properties.list.useQuery({ limit: 500 });
  const [selectedProperty, setSelectedProperty] = useState("");

  const analyze = trpc.ai.analyzePricing.useMutation({
    onSuccess: (data: any) => {
      setResult(`**Recommended Cap Rate:** ${data.recommendedCapRate}%\n\n**Estimated Value:** $${(data.estimatedValue/1000000).toFixed(2)}M\n\n**Price Per Unit:** $${data.pricePerUnit.toLocaleString()}\n\n**Analysis:** ${data.analysis}\n\n**Market Context:** ${data.marketContext}\n\n**Negotiation Tips:**\n${data.negotiationTips.map((t: string) => `- ${t}`).join('\n')}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const handlePropertySelect = (id: string) => {
    setSelectedProperty(id);
    const prop = properties?.find(p => String(p.id) === id);
    if (prop) setForm(f => ({ ...f, unitCount: String(prop.unitCount ?? ""), vintageYear: String(prop.vintageYear ?? ""), city: prop.city ?? "Boise", propertyType: (prop.propertyType as any) ?? "mhc", askingPrice: String(prop.askingPrice ?? ""), noi: String(prop.noi ?? "") }));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card className="border-border bg-card">
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2"><TrendingUp className="h-3.5 w-3.5" />Property Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Quick-fill from Property</Label>
            <Select value={selectedProperty} onValueChange={handlePropertySelect}>
              <SelectTrigger className="bg-background border-border"><SelectValue placeholder="Select a property…" /></SelectTrigger>
              <SelectContent>{properties?.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {([["unitCount","Unit Count"],["vintageYear","Vintage Year"]] as const).map(([k,l]) => (
              <div key={k} className="space-y-1.5"><Label className="text-xs text-muted-foreground">{l}</Label>
                <input type="number" value={form[k]} onChange={(e) => setForm(f => ({...f, [k]: e.target.value}))} className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground" />
              </div>
            ))}
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">City</Label>
              <input value={form.city} onChange={(e) => setForm(f => ({...f, city: e.target.value}))} className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground" />
            </div>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={form.propertyType} onValueChange={(v) => setForm(f => ({...f, propertyType: v as any}))}>
                <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="mhc">MHC</SelectItem><SelectItem value="apartment">Apartment</SelectItem><SelectItem value="affordable_housing">Affordable</SelectItem></SelectContent>
              </Select>
            </div>
            {([["askingPrice","Asking Price ($)"],["noi","NOI ($)"]] as const).map(([k,l]) => (
              <div key={k} className="space-y-1.5"><Label className="text-xs text-muted-foreground">{l}</Label>
                <input type="number" value={form[k]} onChange={(e) => setForm(f => ({...f, [k]: e.target.value}))} className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground" />
              </div>
            ))}
          </div>
          <Button onClick={() => analyze.mutate({ propertyId: parseInt(selectedProperty)||0, unitCount: parseInt(form.unitCount)||undefined, vintageYear: parseInt(form.vintageYear)||undefined, city: form.city, noi: parseFloat(form.noi)||undefined, currentAskingPrice: parseFloat(form.askingPrice)||undefined })} disabled={analyze.isPending} className="w-full gap-2">
            {analyze.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Analyzing…</> : <><Sparkles className="h-4 w-4" />Analyze Deal</>}
          </Button>
        </CardContent>
      </Card>
      <Card className="border-border bg-card">
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-primary" />AI Analysis</CardTitle></CardHeader>
        <CardContent>
          {!result && !analyze.isPending ? <div className="py-12 text-center text-muted-foreground"><TrendingUp className="h-10 w-10 mx-auto mb-3 opacity-20" /><p className="text-sm">Fill in property details and click Analyze</p></div>
          : analyze.isPending ? <div className="py-12 text-center text-muted-foreground"><Loader2 className="h-10 w-10 mx-auto mb-3 animate-spin text-primary" /><p className="text-sm">Generating analysis…</p></div>
          : <div className="text-sm text-foreground prose prose-invert max-w-none"><Streamdown>{result ?? ""}</Streamdown></div>}
        </CardContent>
      </Card>
    </div>
  );
}
