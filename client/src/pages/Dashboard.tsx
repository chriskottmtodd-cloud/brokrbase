import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity as ActivityIcon,
  ArrowRight,
  Building2,
  CheckCircle2,
  ListChecks,
  Mail,
  Mic,
  Settings,
  Upload,
  Users,
} from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow, isPast, isToday, isTomorrow } from "date-fns";

function formatDueDate(dueAt: Date | string | null | undefined): { label: string; urgent: boolean } {
  if (!dueAt) return { label: "No due date", urgent: false };
  const d = new Date(dueAt);
  if (isPast(d) && !isToday(d)) return { label: "Overdue", urgent: true };
  if (isToday(d)) return { label: "Today", urgent: true };
  if (isTomorrow(d)) return { label: "Tomorrow", urgent: false };
  return { label: formatDistanceToNow(d, { addSuffix: true }), urgent: false };
}

export default function Dashboard() {
  const { data: metrics } = trpc.dashboard.metrics.useQuery();
  const { data: dueSoonTasks } = trpc.dashboard.dueSoonTasks.useQuery();
  const { data: recentActivities } = trpc.dashboard.recentActivities.useQuery();

  const utils = trpc.useUtils();
  const completeTask = trpc.tasks.update.useMutation({
    onSuccess: () => {
      utils.dashboard.dueSoonTasks.invalidate();
      utils.dashboard.metrics.invalidate();
    },
  });

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          The CRM that updates itself. Tap the mic when you're done with a call.
        </p>
      </div>

      {/* Getting started card for new users */}
      {metrics &&
        metrics.totalProperties === 0 &&
        metrics.totalContacts === 0 && (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">Getting Started</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link
                href="/import"
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/40 transition-colors"
              >
                <Upload className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <div className="text-sm font-medium">Import your data</div>
                  <div className="text-xs text-muted-foreground">
                    Upload contacts, properties, or Google My Maps pins
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
              <Link
                href="/settings"
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/40 transition-colors"
              >
                <Settings className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <div className="text-sm font-medium">Set up your profile</div>
                  <div className="text-xs text-muted-foreground">
                    Name, company, email signature, and market focus
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
              <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
                <Mic className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <div className="text-sm font-medium">Try a voice memo</div>
                  <div className="text-xs text-muted-foreground">
                    Tap the mic button in the bottom-right after your next call
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

      {/* Metrics tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricTile
          icon={<Building2 className="h-4 w-4" />}
          label="Properties"
          value={metrics?.totalProperties ?? 0}
          href="/properties"
        />
        <MetricTile
          icon={<Users className="h-4 w-4" />}
          label="Contacts"
          value={metrics?.totalContacts ?? 0}
          href="/contacts"
        />
        <MetricTile
          icon={<ListChecks className="h-4 w-4" />}
          label="Open Tasks"
          value={metrics?.pendingTasks ?? 0}
          href="/tasks"
          accent={metrics && metrics.urgentTasks > 0 ? `${metrics.urgentTasks} due soon` : undefined}
        />
        <MetricTile
          icon={<ActivityIcon className="h-4 w-4" />}
          label="This week"
          value={recentActivities?.length ?? 0}
          href="/activities"
          accent="recent activities"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Due soon tasks */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Due This Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!dueSoonTasks?.length ? (
              <p className="text-sm text-muted-foreground italic">No tasks due this week</p>
            ) : (
              <div className="space-y-2">
                {dueSoonTasks.map((task) => {
                  const due = formatDueDate(task.dueAt);
                  return (
                    <div key={task.id} className="flex items-start gap-2 border rounded-md p-2">
                      <button
                        onClick={() => completeTask.mutate({ id: task.id, status: "completed" })}
                        className="text-muted-foreground hover:text-primary mt-0.5"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{task.title}</div>
                        {task.description && (
                          <div className="text-xs text-muted-foreground truncate">{task.description}</div>
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] shrink-0 ${due.urgent ? "border-red-300 text-red-700" : ""}`}
                      >
                        {due.label}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!recentActivities?.length ? (
              <p className="text-sm text-muted-foreground italic">
                No activity yet. Tap the mic in the bottom-right to log your first call.
              </p>
            ) : (
              <div className="space-y-2">
                {recentActivities.map((a) => (
                  <Link
                    key={a.id}
                    href="/activities"
                    className="block border rounded-md p-2 hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize text-[10px]">
                        {a.type}
                      </Badge>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {formatDistanceToNow(new Date(a.occurredAt), { addSuffix: true })}
                      </span>
                    </div>
                    {a.subject && <div className="text-sm font-medium mt-1">{a.subject}</div>}
                    {a.notes && (
                      <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {a.notes}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Link href="/email-studio">
          <Button variant="outline" size="sm" className="gap-1">
            <Mail className="h-3.5 w-3.5" /> Draft an Email
          </Button>
        </Link>
      </div>
    </div>
  );
}

function MetricTile({
  icon,
  label,
  value,
  href,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  href: string;
  accent?: string;
}) {
  return (
    <Link href={href}>
      <Card className="hover:bg-muted/40 cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
            {icon}
            {label}
          </div>
          <div className="text-2xl font-semibold mt-1">{value}</div>
          {accent && <div className="text-xs text-muted-foreground mt-0.5">{accent}</div>}
        </CardContent>
      </Card>
    </Link>
  );
}
