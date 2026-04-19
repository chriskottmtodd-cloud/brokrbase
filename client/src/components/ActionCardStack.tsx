/**
 * ActionCardStack -- Container for ActionCard list.
 *
 * Manages single-edit-at-a-time, sort order (pending -> accepted -> skipped),
 * and bulk "Accept All" footer.
 */
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Plus } from "lucide-react";
import { ActionCard } from "@/components/ActionCard";
import type { ActionItem, UnifiedAction, ActionStatus } from "@/lib/actionTypes";
import { addDays } from "date-fns";

export interface ActionCardStackProps {
  items: ActionItem[];
  onItemsChange: (items: ActionItem[]) => void;
  onAccept: (item: ActionItem) => Promise<void>;
  onUndo?: (item: ActionItem) => void;
  acceptDisabled?: boolean;
  acceptDisabledReason?: string;
  showAddTask?: boolean;
}

const STATUS_ORDER: Record<ActionStatus, number> = {
  pending: 0,
  accepted: 1,
  skipped: 2,
};

function sortItems(items: ActionItem[]): ActionItem[] {
  return [...items].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
}

export function ActionCardStack({
  items,
  onItemsChange,
  onAccept,
  onUndo,
  acceptDisabled,
  acceptDisabledReason,
  showAddTask = false,
}: ActionCardStackProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const sorted = sortItems(items);
  const pendingCount = items.filter((i) => i.status === "pending").length;

  const updateItem = useCallback(
    (id: string, patch: Partial<ActionItem>) => {
      onItemsChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    },
    [items, onItemsChange],
  );

  const updateAction = useCallback(
    (id: string, action: UnifiedAction) => {
      onItemsChange(items.map((i) => (i.id === id ? { ...i, action } : i)));
    },
    [items, onItemsChange],
  );

  const handleAccept = useCallback(
    async (item: ActionItem) => {
      setSavingIds((s) => new Set(s).add(item.id));
      try {
        await onAccept(item);
        updateItem(item.id, { status: "accepted" });
      } finally {
        setSavingIds((s) => {
          const next = new Set(s);
          next.delete(item.id);
          return next;
        });
      }
    },
    [onAccept, updateItem],
  );

  const handleSkip = useCallback(
    (id: string) => {
      updateItem(id, { status: "skipped" });
      if (editingId === id) setEditingId(null);
    },
    [updateItem, editingId],
  );

  const handleUndo = useCallback(
    (item: ActionItem) => {
      updateItem(item.id, { status: "pending" });
      onUndo?.(item);
    },
    [updateItem, onUndo],
  );

  const handleRemove = useCallback(
    (id: string) => {
      onItemsChange(items.filter((i) => i.id !== id));
      if (editingId === id) setEditingId(null);
    },
    [items, onItemsChange, editingId],
  );

  const handleAcceptAll = useCallback(async () => {
    const pending = items.filter((i) => i.status === "pending");
    for (const item of pending) {
      await handleAccept(item);
      await new Promise((r) => setTimeout(r, 100));
    }
  }, [items, handleAccept]);

  const handleAddTask = useCallback(() => {
    const newItem: ActionItem = {
      id: `action-manual-${Date.now()}`,
      status: "pending",
      action: {
        kind: "task",
        title: "",
        type: "follow_up",
        priority: "medium",
        dueDate: addDays(new Date(), 3),
      },
    };
    onItemsChange([...items, newItem]);
    setEditingId(newItem.id);
  }, [items, onItemsChange]);

  if (items.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-muted-foreground">No actions suggested</p>
        {showAddTask && (
          <Button variant="outline" size="sm" className="mt-3 h-8 text-xs gap-1.5 border-dashed" onClick={handleAddTask}>
            <Plus className="h-3.5 w-3.5" /> Add a Task
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {sorted.map((item) => (
        <ActionCard
          key={item.id}
          action={item.action}
          status={item.status}
          isEditing={editingId === item.id}
          onStartEdit={() => setEditingId(item.id)}
          onCancelEdit={() => setEditingId(null)}
          onChange={(updated) => updateAction(item.id, updated)}
          onAccept={() => handleAccept(item)}
          onSkip={() => handleSkip(item.id)}
          onUndo={() => handleUndo(item)}
          onRemove={item.action.kind === "task" ? () => handleRemove(item.id) : undefined}
          saving={savingIds.has(item.id)}
          acceptDisabled={acceptDisabled}
          acceptDisabledReason={acceptDisabledReason}
        />
      ))}

      {showAddTask && (
        <Button
          variant="outline"
          size="sm"
          className="w-full h-8 text-xs gap-1.5 border-dashed"
          onClick={handleAddTask}
        >
          <Plus className="h-3.5 w-3.5" /> Add Another Task
        </Button>
      )}

      {pendingCount >= 2 && (
        <Button
          size="sm"
          className="w-full h-9 text-sm gap-1.5"
          onClick={handleAcceptAll}
          disabled={acceptDisabled}
        >
          <CheckCircle2 className="h-4 w-4" />
          Accept All ({pendingCount})
        </Button>
      )}
    </div>
  );
}
