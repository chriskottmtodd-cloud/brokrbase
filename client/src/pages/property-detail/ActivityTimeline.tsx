import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, Calendar, ChevronDown, Mail, Phone, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const activityIcons: Record<string, { icon: React.ReactNode; color: string }> = {
  call: { icon: <Phone className="h-3 w-3" />, color: "text-blue-600 bg-blue-50 border-blue-200" },
  email: { icon: <Mail className="h-3 w-3" />, color: "text-green-600 bg-green-50 border-green-200" },
  meeting: { icon: <Calendar className="h-3 w-3" />, color: "text-purple-600 bg-purple-50 border-purple-200" },
  note: { icon: <Activity className="h-3 w-3" />, color: "text-gray-500 bg-gray-50 border-gray-200" },
  text: { icon: <MessageSquare className="h-3 w-3" />, color: "text-orange-500 bg-orange-50 border-orange-200" },
  voicemail: { icon: <Phone className="h-3 w-3" />, color: "text-amber-600 bg-amber-50 border-amber-200" },
};

interface Props {
  activities: any[];
  onOpenActivity: (id: number) => void;
}

export function ActivityTimeline({ activities, onOpenActivity }: Props) {
  const [expanded, setExpanded] = useState(false);
  const INITIAL_COUNT = 5;
  const shown = expanded ? activities : activities.slice(0, INITIAL_COUNT);

  return (
    <div className="flex-1 min-w-0">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        Activity
      </div>
      {!activities.length ? (
        <div className="text-center py-6 text-muted-foreground">
          <Activity className="h-6 w-6 mx-auto mb-1.5 opacity-20" />
          <p className="text-sm">No activities yet</p>
          <p className="text-xs mt-0.5">Use the mic button to log a call or meeting.</p>
        </div>
      ) : (
        <div className="space-y-0">
          {shown.map((activity, idx) => {
            const iconDef = activityIcons[activity.type] ?? activityIcons.note;
            return (
              <button
                key={activity.id}
                type="button"
                onClick={() => onOpenActivity(activity.id)}
                className="w-full text-left flex gap-2.5 pb-3 relative hover:bg-muted/30 rounded-md -mx-1.5 px-1.5 py-1 transition-colors"
              >
                {idx < shown.length - 1 && (
                  <div className="absolute left-[21px] top-8 bottom-0 w-px bg-border" />
                )}
                <div className={`shrink-0 h-7 w-7 rounded-full border flex items-center justify-center z-10 ${iconDef.color}`}>
                  {iconDef.icon}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium capitalize">{activity.type}</span>
                    {activity.outcome && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 capitalize">
                        {activity.outcome.replace("_", " ")}
                      </Badge>
                    )}
                    <span className="text-[11px] text-muted-foreground ml-auto">
                      {formatDistanceToNow(new Date(activity.occurredAt), { addSuffix: true })}
                    </span>
                  </div>
                  {activity.subject && (
                    <p className="text-sm mt-0.5 truncate">{activity.subject}</p>
                  )}
                  {activity.summary && (
                    <p className="text-xs text-muted-foreground mt-0.5 italic line-clamp-2">
                      "{activity.summary}"
                    </p>
                  )}
                  {activity.notes && !activity.summary && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {activity.notes}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
          {activities.length > INITIAL_COUNT && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground gap-1 mt-1"
              onClick={() => setExpanded(!expanded)}
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
              {expanded ? "Show less" : `Show all ${activities.length} activities`}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
