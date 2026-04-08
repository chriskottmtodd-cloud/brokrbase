import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity as ActivityIcon,
  Building2,
  Calendar,
  Mail,
  Phone,
  User,
} from "lucide-react";
import { format } from "date-fns";
import { ActivityDetailModal } from "@/components/ActivityDetailModal";

const typeConfig: Record<string, { label: string; icon: React.ReactNode }> = {
  call: { label: "Call", icon: <Phone className="h-3.5 w-3.5" /> },
  email: { label: "Email", icon: <Mail className="h-3.5 w-3.5" /> },
  meeting: { label: "Meeting", icon: <Calendar className="h-3.5 w-3.5" /> },
  note: { label: "Note", icon: <ActivityIcon className="h-3.5 w-3.5" /> },
  text: { label: "Text", icon: <Mail className="h-3.5 w-3.5" /> },
  voicemail: { label: "Voicemail", icon: <Phone className="h-3.5 w-3.5" /> },
};

export default function ActivityLog() {
  const [, setLocation] = useLocation();
  const [filterType, setFilterType] = useState("all");
  const [openActivityId, setOpenActivityId] = useState<number | null>(null);

  const { data: activities, isLoading } = trpc.activities.list.useQuery({
    type: filterType !== "all" ? filterType : undefined,
    limit: 100,
  });
  const utils = trpc.useUtils();

  // Group by date
  const grouped: Record<string, typeof activities> = {};
  (activities ?? []).forEach((a) => {
    const dateKey = format(new Date(a.occurredAt), "yyyy-MM-dd");
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey]!.push(a);
  });

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Activity Log</h1>
        <p className="text-sm text-muted-foreground">
          All your logged calls, emails, meetings, and notes. Click any to view or edit.
        </p>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {["all", "call", "email", "meeting", "note", "text", "voicemail"].map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all capitalize ${
              filterType === t
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-card rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && activities?.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ActivityIcon className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No activities yet</p>
            <p className="text-xs mt-1">
              Tap the mic in the bottom-right to log your first call.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && activities && activities.length > 0 && (
        <div className="space-y-6">
          {Object.entries(grouped)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([date, acts]) => (
              <div key={date}>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  {format(new Date(date), "EEEE, MMMM d")}
                </h3>
                <div className="space-y-2">
                  {acts?.map((activity) => {
                    const cfg = typeConfig[activity.type];
                    return (
                      <Card
                        key={activity.id}
                        className="border-border bg-card hover:bg-card/80 transition-colors cursor-pointer"
                        onClick={() => setOpenActivityId(activity.id)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border bg-muted text-muted-foreground">
                              {cfg?.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">
                                  {activity.subject || cfg?.label}
                                </span>
                                {activity.outcome && (
                                  <Badge variant="outline" className="text-xs px-1.5 py-0">
                                    {activity.outcome.replace("_", " ")}
                                  </Badge>
                                )}
                                {activity.duration && (
                                  <span className="text-xs text-muted-foreground">
                                    {activity.duration} min
                                  </span>
                                )}
                                <span className="text-xs text-muted-foreground ml-auto">
                                  {format(new Date(activity.occurredAt), "h:mm a")}
                                </span>
                              </div>
                              {activity.summary && (
                                <p className="text-sm text-muted-foreground mt-2 italic">
                                  "{activity.summary}"
                                </p>
                              )}
                              {!activity.summary && activity.notes && (
                                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                                  {activity.notes}
                                </p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      )}

      <ActivityDetailModal
        activityId={openActivityId}
        open={openActivityId !== null}
        onClose={() => setOpenActivityId(null)}
        onChanged={() => utils.activities.list.invalidate()}
      />
    </div>
  );
}
