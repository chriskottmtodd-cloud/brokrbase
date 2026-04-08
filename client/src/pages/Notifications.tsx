import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, BellOff, CheckCheck, Clock, AlertTriangle, Building2, Users, ListChecks, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

const typeIcons: Record<string, React.ReactNode> = {
  task_due: <ListChecks className="h-4 w-4 text-yellow-400" />,
  new_buyer_interest: <Users className="h-4 w-4 text-blue-400" />,
  follow_up_needed: <Clock className="h-4 w-4 text-orange-400" />,
  property_update: <Building2 className="h-4 w-4 text-green-400" />,
  deal_update: <AlertTriangle className="h-4 w-4 text-primary" />,
  system: <Bell className="h-4 w-4 text-muted-foreground" />,
};

export default function Notifications() {
  const utils = trpc.useUtils();
  const { data: notifications, isLoading } = trpc.notifications.list.useQuery({});
  const { data: unread } = trpc.notifications.list.useQuery({ unreadOnly: true });

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => utils.notifications.list.invalidate(),
  });

  const markAllRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => { utils.notifications.list.invalidate(); toast.success("All notifications marked as read"); },
  });

  const unreadCount = unread?.length ?? 0;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />Notifications
            {unreadCount > 0 && <Badge className="bg-primary text-primary-foreground">{unreadCount} new</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Stay on top of tasks, deals, and follow-ups</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" className="gap-2" onClick={() => markAllRead.mutate({})} disabled={markAllRead.isPending}>
            <CheckCheck className="h-4 w-4" />Mark all read
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : !notifications?.length ? (
        <Card className="border-border bg-card border-dashed">
          <CardContent className="py-20 text-center text-muted-foreground">
            <BellOff className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">No notifications yet</p>
            <p className="text-sm mt-1">You'll be notified about tasks, deals, and follow-ups here</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <Card key={n.id} className={`border-border bg-card cursor-pointer hover:bg-muted/10 transition-colors ${!n.isRead ? "border-l-2 border-l-primary" : ""}`} onClick={() => { if (!n.isRead) markRead.mutate({ ids: [n.id] }); }}>
              <CardContent className="py-3 px-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">{typeIcons[n.type] ?? typeIcons.system}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm ${!n.isRead ? "font-semibold text-foreground" : "text-foreground/80"}`}>{n.title}</p>
                      <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    {n.message && <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>}
                  </div>
                  {!n.isRead && <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
