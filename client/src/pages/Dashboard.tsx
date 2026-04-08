import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Circle,
  TrendingUp,
  ChevronRight,
  MapPin,
  Flame,
  Building2,
  Users,
  Tag,
  FileCheck,
  DollarSign,
} from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { formatDistanceToNow, isToday, isTomorrow, isPast } from "date-fns";
import { priorityColors, propertyTypeLabels } from "@/lib/constants";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDueDate(dueAt: Date | string | null | undefined): { label: string; urgent: boolean } {
  if (!dueAt) return { label: "No due date", urgent: false };
  const d = new Date(dueAt);
  if (isPast(d) && !isToday(d)) return { label: "Overdue", urgent: true };
  if (isToday(d)) return { label: "Today", urgent: true };
  if (isTomorrow(d)) return { label: "Tomorrow", urgent: false };
  return { label: formatDistanceToNow(d, { addSuffix: true }), urgent: false };
}

function formatPrice(price: number | null | undefined): string {
  if (!price) return "—";
  if (price >= 1_000_000) return "$" + (price / 1_000_000).toFixed(1) + "M";
  if (price >= 1_000) return "$" + Math.round(price / 1_000) + "K";
  return "$" + price.toLocaleString();
}

function pricePer(price: number | null | undefined, units: number | null | undefined): string {
  if (!price || !units || units === 0) return "";
  return "$" + Math.round(price / units).toLocaleString() + "/door";
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function TaskRow({ task, onComplete }: {
  task: { id: number; title: string; priority: string; dueAt: Date | string | null; status: string };
  onComplete: (id: number) => void;
}) {
  const { label, urgent } = formatDueDate(task.dueAt);
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/40 last:border-0 group">
      <button
        onClick={() => onComplete(task.id)}
        className="mt-0.5 shrink-0 text-muted-foreground hover:text-green-400 transition-colors"
        title="Mark complete"
      >
        <Circle className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground leading-snug truncate">{task.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[10px] font-medium ${urgent ? "text-red-400" : "text-muted-foreground"}`}>
            {label}
          </span>
          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 ${priorityColors[task.priority] ?? ""}`}>
            {task.priority}
          </Badge>
        </div>
      </div>
    </div>
  );
}

function PropertyRow({ property, showCapRate = false, showStage = false, linkPrefix = "/properties" }: {
  property: {
    id: number;
    name: string;
    propertyType?: string | null;
    city?: string | null;
    unitCount?: number | null;
    askingPrice?: number | null;
    lastSalePrice?: number | null;
    capRate?: number | null;
    stage?: string | null;
    status?: string | null;
  };
  showCapRate?: boolean;
  showStage?: boolean;
  linkPrefix?: string;
}) {
  const price = property.askingPrice ?? property.lastSalePrice ?? null;
  return (
    <Link href={`${linkPrefix}/${property.id}`}>
      <div className="flex items-center gap-3 py-2.5 border-b border-border/40 last:border-0 hover:bg-muted/20 rounded px-1 cursor-pointer transition-colors">
        <div className="shrink-0 w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
          <Building2 className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{property.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground">{property.city ?? "—"}</span>
            {property.propertyType && <><span className="text-[10px] text-muted-foreground">·</span>
            <span className="text-[10px] text-muted-foreground">{propertyTypeLabels[property.propertyType] ?? property.propertyType}</span></>}
            {property.unitCount ? (
              <>
                <span className="text-[10px] text-muted-foreground">·</span>
                <span className="text-[10px] text-muted-foreground">{property.unitCount} units</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-foreground">{formatPrice(price)}</p>
          <div className="flex items-center gap-1.5 justify-end">
            {price && property.unitCount ? (
              <span className="text-[10px] text-muted-foreground">{pricePer(price, property.unitCount)}</span>
            ) : null}
            {showCapRate && property.capRate ? (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 text-green-400 border-green-400/40 bg-green-400/10">
                {property.capRate.toFixed(2)}% cap
              </Badge>
            ) : null}
            {showStage && property.stage ? (
              <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 ${
                property.stage === "under_contract" ? "text-amber-400 border-amber-400/40 bg-amber-400/10" :
                property.stage === "closed" ? "text-green-400 border-green-400/40 bg-green-400/10" :
                "text-blue-400 border-blue-400/40 bg-blue-400/10"
              }`}>
                {property.stage === "under_contract" ? "Under Contract" : property.stage === "closed" ? "Closed" : "Active"}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, isAuthenticated, loading } = useAuth();

  const { data: dueSoonTasks, isLoading: tasksLoading } = trpc.dashboard.dueSoonTasks.useQuery(
    undefined, { enabled: isAuthenticated }
  );
  const { data: overdueCount } = trpc.dashboard.overdueContactsCount.useQuery(
    undefined, { enabled: isAuthenticated }
  );
  const { data: panels, isLoading: panelsLoading } = trpc.dashboard.listingPanels.useQuery(
    undefined, { enabled: isAuthenticated }
  );
  const { data: metrics } = trpc.dashboard.metrics.useQuery(
    undefined, { enabled: isAuthenticated }
  );
  const { data: recentOffers } = trpc.properties.recentOfferActivity.useQuery(
    { days: 30 }, { enabled: isAuthenticated }
  );

  const utils = trpc.useUtils();
  const completeTask = trpc.tasks.update.useMutation({
    onSuccess: () => utils.dashboard.dueSoonTasks.invalidate(),
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-muted-foreground">Sign in to access your dashboard</p>
        <Button onClick={() => (window.location.href = getLoginUrl())}>Sign In</Button>
      </div>
    );
  }

  const todayTasks = (dueSoonTasks ?? []).filter(t => {
    if (!t.dueAt) return false;
    const d = new Date(t.dueAt);
    return isToday(d) || isPast(d);
  });
  const weekTasks = (dueSoonTasks ?? []).filter(t => {
    if (!t.dueAt) return false;
    const d = new Date(t.dueAt);
    return !isToday(d) && !isPast(d);
  });

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"},{" "}
          {user?.name?.split(" ")[0] ?? "there"}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Top row: Tasks (2 cols) + Right sidebar (1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Tasks Panel */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Tasks Due Soon
            </CardTitle>
            <Link href="/tasks">
              <Button variant="ghost" size="sm" className="text-xs h-7 gap-1">
                All tasks <ChevronRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {tasksLoading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-10 bg-muted/30 rounded animate-pulse" />)}
              </div>
            ) : (dueSoonTasks ?? []).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No tasks due this week — you're all caught up!</p>
              </div>
            ) : (
              <div>
                {todayTasks.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-1.5">Today / Overdue</p>
                    {todayTasks.map(t => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        onComplete={(id) => completeTask.mutate({ id, status: "completed" })}
                      />
                    ))}
                  </div>
                )}
                {weekTasks.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">This Week</p>
                    {weekTasks.map(t => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        onComplete={(id) => completeTask.mutate({ id, status: "completed" })}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right sidebar */}
        <div className="flex flex-col gap-4">
          {/* Follow-Up Radar */}
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Flame className="h-5 w-5 text-amber-400" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Follow-Up Radar</p>
                    <p className="text-xs text-muted-foreground">
                      {overdueCount != null
                        ? `${overdueCount} contact${overdueCount !== 1 ? "s" : ""} overdue`
                        : "Loading…"}
                    </p>
                  </div>
                </div>
                <Link href="/follow-up">
                  <Button variant="outline" size="sm" className="text-xs h-7 gap-1 border-amber-500/40 text-amber-400 hover:bg-amber-500/10">
                    View <ChevronRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card>
            <CardContent className="pt-4 pb-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 className="h-4 w-4" /> Properties
                </div>
                <span className="text-sm font-semibold text-foreground">{metrics?.totalProperties ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" /> Pending Tasks
                </div>
                <span className="text-sm font-semibold text-foreground">{metrics?.pendingTasks ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Tag className="h-4 w-4" /> My Listings
                </div>
                <Link href="/listings" className="text-sm font-semibold text-foreground hover:text-primary transition-colors">{panels?.myListings?.length ?? "—"}</Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom row: My Listings | On Market | Recently Sold */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* My Listings */}
        <Card className="border-primary/30">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary" />
              My Listings
            </CardTitle>
            <Badge variant="outline" className="text-[10px] px-2 h-5 text-primary border-primary/40">
              {panels?.myListings?.length ?? 0}
            </Badge>
          </CardHeader>
          <CardContent>
            {panelsLoading ? (
              <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-12 bg-muted/30 rounded animate-pulse" />)}</div>
            ) : (panels?.myListings ?? []).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Tag className="h-7 w-7 mx-auto mb-2 opacity-30" />
                <p className="text-xs">No listings yet</p>
                <p className="text-[10px] mt-1 text-muted-foreground/60">Create a listing in the Listings tab to see it here</p>
              </div>
            ) : (
              (panels?.myListings ?? []).map(p => (
                <PropertyRow key={p.id} property={p} showCapRate showStage linkPrefix="/listings" />
              ))
            )}
          </CardContent>
        </Card>

        {/* Under Contract */}
        <Card className="border-amber-500/20">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-amber-400" />
              Under Contract
            </CardTitle>
            <Badge variant="outline" className="text-[10px] px-2 h-5 text-amber-400 border-amber-400/40">
              {panels?.underContract?.length ?? 0}
            </Badge>
          </CardHeader>
          <CardContent>
            {panelsLoading ? (
              <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-12 bg-muted/30 rounded animate-pulse" />)}</div>
            ) : (panels?.underContract ?? []).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileCheck className="h-7 w-7 mx-auto mb-2 opacity-30" />
                <p className="text-xs">No deals under contract</p>
                <p className="text-[10px] mt-1 text-muted-foreground/60">Set a listing stage to "Under Contract" to track it here</p>
              </div>
            ) : (
              (panels?.underContract ?? []).map(p => (
                <PropertyRow key={p.id} property={p} showStage linkPrefix="/listings" />
              ))
            )}
          </CardContent>
        </Card>

        {/* Recently Sold */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-400" />
              Recently Sold
            </CardTitle>
            <Badge variant="outline" className="text-[10px] px-2 h-5 text-green-400 border-green-400/40">
              {panels?.recentlySold?.length ?? 0}
            </Badge>
          </CardHeader>
          <CardContent>
            {panelsLoading ? (
              <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-12 bg-muted/30 rounded animate-pulse" />)}</div>
            ) : (panels?.recentlySold ?? []).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <TrendingUp className="h-7 w-7 mx-auto mb-2 opacity-30" />
                <p className="text-xs">No recently sold properties</p>
                <p className="text-[10px] mt-1 text-muted-foreground/60">Set a property status to "Recently Sold" to track comps here</p>
              </div>
            ) : (
              (panels?.recentlySold ?? []).map(p => (
                <PropertyRow key={p.id} property={p} showCapRate />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Off-Market Offer Activity */}
      {recentOffers && recentOffers.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-orange-400" />
            Off-Market Offer Activity
            <span className="text-[10px] font-normal text-muted-foreground/60">(last 30 days)</span>
          </h2>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {recentOffers.map(item => (
              <Link key={item.propertyId} href={`/properties/${item.propertyId}`}>
                <Card className="border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10 transition-colors cursor-pointer">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{item.propertyName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.offerCount} unsolicited offer{item.offerCount !== 1 ? "s" : ""}
                          {item.latestAmount ? ` · Latest: $${(item.latestAmount / 1_000_000).toFixed(2)}M` : ""}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px] px-1.5 h-5 text-orange-400 border-orange-400/40 shrink-0">
                        {new Date(item.latestAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
