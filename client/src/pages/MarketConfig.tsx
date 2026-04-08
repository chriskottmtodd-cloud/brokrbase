import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { GitBranch, ChevronRight, ChevronDown, Plus, Pencil, Trash2, Loader2 } from "lucide-react";

type TreeNode = {
  id: number;
  name: string;
  slug: string;
  parentId: number | null;
  children: TreeNode[];
};

function MarketNode({
  node,
  allFlat,
  onAddChild,
  onEdit,
  onDelete,
  depth,
}: {
  node: TreeNode;
  allFlat: { id: number; name: string }[];
  onAddChild: (parentId: number) => void;
  onEdit: (node: TreeNode) => void;
  onDelete: (node: TreeNode) => void;
  depth: number;
}) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children.length > 0;

  return (
    <div className={depth > 0 ? "ml-5 border-l border-border pl-3" : ""}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-1 py-1 group">
          {hasChildren ? (
            <CollapsibleTrigger asChild>
              <button className="text-muted-foreground hover:text-foreground transition-colors">
                {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            </CollapsibleTrigger>
          ) : (
            <span className="w-3.5 h-3.5 inline-block" />
          )}
          <span className="text-sm text-foreground font-medium flex-1">{node.name}</span>
          <span className="text-xs text-muted-foreground mr-2 opacity-0 group-hover:opacity-100 transition-opacity">{node.slug}</span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => onAddChild(node.id)}>
              <Plus className="h-3 w-3 mr-1" />Add Child
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => onEdit(node)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-destructive hover:text-destructive" onClick={() => onDelete(node)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
        {hasChildren && (
          <CollapsibleContent>
            {node.children.map(child => (
              <MarketNode
                key={child.id}
                node={child}
                allFlat={allFlat}
                onAddChild={onAddChild}
                onEdit={onEdit}
                onDelete={onDelete}
                depth={depth + 1}
              />
            ))}
          </CollapsibleContent>
        )}
      </Collapsible>
    </div>
  );
}

export default function MarketConfig() {
  const utils = trpc.useUtils();
  const { data: tree = [], isLoading } = trpc.markets.tree.useQuery();
  const { data: flat = [] } = trpc.markets.list.useQuery();

  const seedDefaults = trpc.markets.seedDefaults.useMutation({
    onSuccess: (r) => {
      if ((r as any).skipped) {
        toast.info("Markets already configured.");
      } else {
        toast.success(`Seeded ${(r as any).seeded} default markets.`);
        utils.markets.tree.invalidate();
        utils.markets.list.invalidate();
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const createMarket = trpc.markets.create.useMutation({
    onSuccess: () => {
      toast.success("Market added.");
      utils.markets.tree.invalidate();
      utils.markets.list.invalidate();
      setAddModal(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMarket = trpc.markets.update.useMutation({
    onSuccess: () => {
      toast.success("Market updated.");
      utils.markets.tree.invalidate();
      utils.markets.list.invalidate();
      setEditModal(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMarket = trpc.markets.delete.useMutation({
    onSuccess: () => {
      toast.success("Market deleted.");
      utils.markets.tree.invalidate();
      utils.markets.list.invalidate();
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const [addModal, setAddModal] = useState<{ parentId: number } | null>(null);
  const [addName, setAddName] = useState("");
  const [addParentId, setAddParentId] = useState<number | null>(null);

  const [editModal, setEditModal] = useState<TreeNode | null>(null);
  const [editName, setEditName] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<TreeNode | null>(null);

  function openAdd(parentId: number) {
    setAddName("");
    setAddParentId(parentId);
    setAddModal({ parentId });
  }

  function openEdit(node: TreeNode) {
    setEditName(node.name);
    setEditModal(node);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            Markets Configuration
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize your market hierarchy. Intel flows up automatically — data for Boise also applies to Treasure Valley, Idaho, and Macro.
          </p>
        </div>
        <div className="flex gap-2">
          {flat.length === 0 && (
            <Button variant="outline" size="sm" onClick={() => seedDefaults.mutate()} disabled={seedDefaults.isPending}>
              {seedDefaults.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Seed Defaults
            </Button>
          )}
          <Button size="sm" onClick={() => openAdd(0)}>
            <Plus className="h-3.5 w-3.5 mr-1" />Add Top-Level
          </Button>
        </div>
      </div>

      {/* Tree */}
      <div className="border border-border rounded-lg bg-card p-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-4 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />Loading markets…
          </div>
        ) : tree.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No markets configured yet.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => seedDefaults.mutate()} disabled={seedDefaults.isPending}>
              {seedDefaults.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Seed Default Idaho + Montana Hierarchy
            </Button>
          </div>
        ) : (
          (tree as TreeNode[]).map(node => (
            <MarketNode
              key={node.id}
              node={node}
              allFlat={flat}
              onAddChild={openAdd}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
              depth={0}
            />
          ))
        )}
      </div>

      {/* Add Modal */}
      {addModal && (
        <Dialog open onOpenChange={() => setAddModal(null)}>
          <DialogContent className="max-w-sm bg-card border-border">
            <DialogHeader><DialogTitle>Add Market</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Name</Label>
                <Input
                  value={addName}
                  onChange={e => setAddName(e.target.value)}
                  placeholder="e.g. Kuna"
                  className="bg-background border-border"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Parent Market</Label>
                <Select
                  value={addParentId != null ? String(addParentId) : "none"}
                  onValueChange={v => setAddParentId(v === "none" ? null : Number(v))}
                >
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue placeholder="Top-level (no parent)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Top-level (no parent)</SelectItem>
                    {flat.map(m => (
                      <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddModal(null)}>Cancel</Button>
              <Button
                onClick={() => createMarket.mutate({ name: addName, parentId: addParentId })}
                disabled={!addName.trim() || createMarket.isPending}
              >
                {createMarket.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Add Market
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Modal */}
      {editModal && (
        <Dialog open onOpenChange={() => setEditModal(null)}>
          <DialogContent className="max-w-sm bg-card border-border">
            <DialogHeader><DialogTitle>Edit Market</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Name</Label>
                <Input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="bg-background border-border"
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditModal(null)}>Cancel</Button>
              <Button
                onClick={() => updateMarket.mutate({ id: editModal.id, name: editName })}
                disabled={!editName.trim() || updateMarket.isPending}
              >
                {updateMarket.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
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
              <AlertDialogTitle>Delete "{deleteTarget.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This market will be permanently deleted. Markets with children or intel entries cannot be deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deleteMarket.mutate({ id: deleteTarget.id })}
                disabled={deleteMarket.isPending}
              >
                {deleteMarket.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
