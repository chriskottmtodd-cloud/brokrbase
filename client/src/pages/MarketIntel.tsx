import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { TrendingUp, Plus, Pencil, Trash2, Loader2, ChevronRight, Search } from "lucide-react";
import { Link } from "wouter";

type IntelEntry = {
  id: number;
  marketId: number;
  content: string;
  source: string | null;
  extractedFacts: string | null;
  createdAt: Date;
  marketName: string | null;
  marketSlug: string | null;
};

type FlatMarket = {
  id: number;
  name: string;
  slug: string;
  parentId: number | null;
  parentName: string | null;
};

function buildIndentedList(flat: FlatMarket[]): { id: number; name: string; depth: number }[] {
  const byId: Record<number, FlatMarket> = {};
  for (const m of flat) byId[m.id] = m;

  function depth(m: FlatMarket): number {
    let d = 0;
    let cur = m;
    while (cur.parentId && byId[cur.parentId]) {
      d++;
      cur = byId[cur.parentId];
    }
    return d;
  }

  return flat.map(m => ({ id: m.id, name: m.name, depth: depth(m) }));
}

function ParentChain({ marketId, flat }: { marketId: number; flat: FlatMarket[] }) {
  const byId: Record<number, FlatMarket> = {};
  for (const m of flat) byId[m.id] = m;

  const chain: string[] = [];
  let cur = byId[marketId];
  while (cur) {
    chain.unshift(cur.name);
    cur = cur.parentId ? byId[cur.parentId] : undefined as any;
  }

  if (chain.length <= 1) return null;

  return (
    <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap mt-1">
      <span className="text-muted-foreground/60">Also applies to:</span>
      {chain.slice(1).map((name, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 opacity-40" />
          <span>{name}</span>
        </span>
      ))}
    </p>
  );
}

export default function MarketIntel() {
  const utils = trpc.useUtils();
  const { data: flat = [], isLoading: loadingMarkets } = trpc.markets.list.useQuery();
  const { data: intel = [], isLoading: loadingIntel } = trpc.marketIntel.list.useQuery();

  const [filterMarketId, setFilterMarketId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  // Add form
  const [addMarketId, setAddMarketId] = useState<number | null>(null);
  const [addContent, setAddContent] = useState("");
  const [addSource, setAddSource] = useState("");

  // Edit modal
  const [editEntry, setEditEntry] = useState<IntelEntry | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editSource, setEditSource] = useState("");
  const [editMarketId, setEditMarketId] = useState<number | null>(null);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<IntelEntry | null>(null);

  const createIntel = trpc.marketIntel.create.useMutation({
    onSuccess: () => {
      toast.success("Intel saved. AI is extracting key facts in the background.");
      utils.marketIntel.list.invalidate();
      setAddContent("");
      setAddSource("");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateIntel = trpc.marketIntel.update.useMutation({
    onSuccess: () => {
      toast.success("Intel updated.");
      utils.marketIntel.list.invalidate();
      setEditEntry(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteIntel = trpc.marketIntel.delete.useMutation({
    onSuccess: () => {
      toast.success("Intel deleted.");
      utils.marketIntel.list.invalidate();
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const indented = useMemo(() => buildIndentedList(flat), [flat]);

  const filtered = useMemo(() => {
    let list = intel as IntelEntry[];
    if (filterMarketId) list = list.filter(i => i.marketId === filterMarketId);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.content.toLowerCase().includes(q) ||
        (i.source ?? "").toLowerCase().includes(q) ||
        (i.marketName ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [intel, filterMarketId, search]);

  function openEdit(entry: IntelEntry) {
    setEditEntry(entry);
    setEditContent(entry.content);
    setEditSource(entry.source ?? "");
    setEditMarketId(entry.marketId);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Market Intel
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Paste market data — vacancy rates, rent trends, employer news, macro factors. Call Prep pulls intel from the property's city and all parent markets automatically.
        </p>
      </div>

      {/* No markets warning */}
      {!loadingMarkets && flat.length === 0 && (
        <div className="border border-amber-500/30 bg-amber-500/10 rounded-lg p-4 text-sm text-amber-700 dark:text-amber-400">
          No markets configured yet.{" "}
          <Link href="/markets" className="underline font-medium">Set up your market hierarchy first →</Link>
        </div>
      )}

      {/* Add Intel Form */}
      <Card className="border-border bg-card">
        <CardContent className="pt-5 space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add Market Intel</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Market</Label>
              <Select
                value={addMarketId != null ? String(addMarketId) : ""}
                onValueChange={v => setAddMarketId(Number(v))}
              >
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Select market…" />
                </SelectTrigger>
                <SelectContent>
                  {indented.map(m => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {"\u00a0".repeat(m.depth * 3)}{m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {addMarketId && <ParentChain marketId={addMarketId} flat={flat} />}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Source (optional)</Label>
              <Input
                value={addSource}
                onChange={e => setAddSource(e.target.value)}
                placeholder="e.g. CoStar Q1 2026"
                className="bg-background border-border"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Intel</Label>
            <Textarea
              value={addContent}
              onChange={e => setAddContent(e.target.value)}
              placeholder="Paste market data here — vacancy rates, rent trends, employer news, development announcements, macro factors…"
              className="bg-background border-border min-h-[120px] resize-y"
            />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => {
                if (!addMarketId) return toast.error("Select a market first.");
                if (!addContent.trim()) return toast.error("Intel content is required.");
                createIntel.mutate({ marketId: addMarketId, content: addContent, source: addSource || undefined });
              }}
              disabled={createIntel.isPending}
            >
              {createIntel.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
              Save Intel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filter + Search */}
      <div className="flex gap-3">
        <Select
          value={filterMarketId != null ? String(filterMarketId) : "all"}
          onValueChange={v => setFilterMarketId(v === "all" ? null : Number(v))}
        >
          <SelectTrigger className="bg-background border-border w-52">
            <SelectValue placeholder="All Markets" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Markets</SelectItem>
            {indented.map(m => (
              <SelectItem key={m.id} value={String(m.id)}>
                {"\u00a0".repeat(m.depth * 3)}{m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search intel…"
            className="pl-8 bg-background border-border"
          />
        </div>
      </div>

      {/* Intel List */}
      <div className="space-y-3">
        {loadingIntel ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />Loading intel…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{intel.length === 0 ? "No intel yet. Add your first entry above." : "No entries match your filter."}</p>
          </div>
        ) : (
          filtered.map(entry => (
            <Card key={entry.id} className="border-border bg-card">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge variant="secondary" className="text-xs">{entry.marketName ?? "Unknown"}</Badge>
                      {entry.source && <span className="text-xs text-muted-foreground">· {entry.source}</span>}
                      <span className="text-xs text-muted-foreground">· {new Date(entry.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                    </div>
                    <p className="text-sm text-foreground line-clamp-3 whitespace-pre-wrap">{entry.content}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEdit(entry)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(entry)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Edit Modal */}
      {editEntry && (
        <Dialog open onOpenChange={() => setEditEntry(null)}>
          <DialogContent className="max-w-lg bg-card border-border">
            <DialogHeader><DialogTitle>Edit Intel</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Market</Label>
                <Select
                  value={editMarketId != null ? String(editMarketId) : ""}
                  onValueChange={v => setEditMarketId(Number(v))}
                >
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {indented.map(m => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {"\u00a0".repeat(m.depth * 3)}{m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Source</Label>
                <Input value={editSource} onChange={e => setEditSource(e.target.value)} className="bg-background border-border" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Intel</Label>
                <Textarea value={editContent} onChange={e => setEditContent(e.target.value)} className="bg-background border-border min-h-[120px] resize-y" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditEntry(null)}>Cancel</Button>
              <Button
                onClick={() => updateIntel.mutate({ id: editEntry.id, content: editContent, source: editSource || undefined, marketId: editMarketId ?? undefined })}
                disabled={updateIntel.isPending}
              >
                {updateIntel.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <AlertDialog open onOpenChange={() => setDeleteTarget(null)}>
          <AlertDialogContent className="bg-card border-border">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this intel entry?</AlertDialogTitle>
              <AlertDialogDescription>
                This cannot be undone. The entry for <strong>{deleteTarget.marketName}</strong> will be permanently removed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deleteIntel.mutate({ id: deleteTarget.id })}
                disabled={deleteIntel.isPending}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
