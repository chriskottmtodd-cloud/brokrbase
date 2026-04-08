import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Phone, Mail, Calendar, ChevronRight, Building2, Loader2 } from "lucide-react";
import { format, isPast, isToday } from "date-fns";
import { toast } from "sonner";

const typeIcons: Record<string, React.ReactNode> = {
  call:      <Phone className="h-3 w-3" />,
  email:     <Mail className="h-3 w-3" />,
  meeting:   <Calendar className="h-3 w-3" />,
  follow_up: <ChevronRight className="h-3 w-3" />,
  research:  <Building2 className="h-3 w-3" />,
  other:     <Clock className="h-3 w-3" />,
};

interface Props {
  /** The contact whose pending tasks to show */
  contactId: number;
  /** The text that will be used as the completion note (call summary, email body, etc.) */
  completionNote: string;
  /** Optional: also log a completion activity on the contact */
  logActivity?: boolean;
}

export function PendingTasksFulfiller({ contactId, completionNote, logActivity = true }: Props) {
  const [completedIds, setCompletedIds] = useState<Set<number>>(new Set());
  const [loadingId,    setLoadingId]    = useState<number | null>(null);

  const { data: tasks } = trpc.tasks.list.useQuery(
    { contactId, status: "pending", limit: 10 },
    { enabled: !!contactId }
  );

  const updateTask     = trpc.tasks.update.useMutation();
  const createActivity = trpc.activities.create.useMutation();
  const updateContact  = trpc.contacts.update.useMutation();
  const utils          = trpc.useUtils();

  const pending = (tasks ?? []).filter(t => !completedIds.has(t.id));

  if (!pending.length) return null;

  async function handleComplete(taskId: number, taskTitle: string, taskType: string) {
    setLoadingId(taskId);
    try {
      await updateTask.mutateAsync({ id: taskId, status: "completed", completedAt: new Date() });

      if (logActivity) {
        await createActivity.mutateAsync({
          type: (["call","email","meeting","note","text","voicemail"].includes(taskType) ? taskType : "note") as any,
          contactId,
          subject: taskTitle,
          notes: completionNote || "Completed via activity log.",
          outcome: "follow_up",
        });
        await updateContact.mutateAsync({ id: contactId, lastContactedAt: new Date() });
      }

      setCompletedIds(prev => { const next = new Set(prev); next.add(taskId); return next; });
      utils.tasks.list.invalidate();
      toast.success(`"${taskTitle}" marked complete.`);
    } catch {
      toast.error("Could not complete task.");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
        <Clock className="h-3 w-3" /> Pending tasks for this contact
      </p>
      <div className="space-y-1.5">
        {pending.map(task => {
          const isOverdue = !!(task.dueAt && isPast(new Date(task.dueAt)) && !isToday(new Date(task.dueAt)));
          const isLoading = loadingId === task.id;
          return (
            <div
              key={task.id}
              className={`flex items-center gap-2.5 px-3 py-2 rounded border ${isOverdue ? "border-red-500/30 bg-red-500/5" : "border-border/60 bg-background/50"}`}
            >
              <span className="text-muted-foreground shrink-0">{typeIcons[task.type] ?? typeIcons.other}</span>
              <span className="text-sm text-foreground flex-1 truncate">{task.title}</span>
              {task.dueAt && (
                <span className={`text-[11px] shrink-0 ${isOverdue ? "text-red-400" : "text-muted-foreground"}`}>
                  {isOverdue ? "Overdue · " : ""}{format(new Date(task.dueAt), "MMM d")}
                </span>
              )}
              {isOverdue && !task.dueAt && (
                <Badge variant="outline" className="text-[10px] px-1 py-0 bg-red-500/10 text-red-400 border-red-500/30 shrink-0">Overdue</Badge>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[11px] px-2 shrink-0 gap-1 border-green-500/40 text-green-400 hover:bg-green-500/10"
                onClick={() => handleComplete(task.id, task.title, task.type)}
                disabled={isLoading}
              >
                {isLoading
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <><CheckCircle2 className="h-3 w-3" /> Done</>
                }
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
