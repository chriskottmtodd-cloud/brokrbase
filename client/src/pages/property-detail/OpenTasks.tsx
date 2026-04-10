import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, Circle } from "lucide-react";

interface Props {
  tasks: any[];
}

export function OpenTasks({ tasks }: Props) {
  if (!tasks.length) return null;

  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Tasks
      </div>
      <div className="space-y-1.5">
        {tasks.map((t) => (
          <div key={t.id} className="flex items-start gap-2 py-1.5">
            <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm">{t.title}</div>
              {t.dueAt && (
                <div className="text-xs text-muted-foreground">
                  Due {formatDistanceToNow(new Date(t.dueAt), { addSuffix: true })}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
