import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Radar,
  Phone,
  Mail,
  User,
  Building2,
  Clock,
  Flame,
  Thermometer,
  Snowflake,
  MinusCircle,
  ChevronRight,
  RefreshCw,
  Info,
  CalendarClock,
  BellOff,
  BellRing,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { LogActivityModal } from "./ActivityLog";

const DEFAULT_THRESHOLDS = { hot: 7, warm: 14, cold: 30, inactive: 60 };

type StaleContact = {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  isOwner: boolean;
  isBuyer: boolean;
  priority: "hot" | "warm" | "cold" | "inactive";
  lastContactedAt: Date | null;
  daysSince: number | null;
  threshold: number;
  daysOverdue: number | null;
  neverContacted: boolean;
};

type SnoozedContact = {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  isOwner: boolean;
  isBuyer: boolean;
  priority: "hot" | "warm" | "cold" | "inactive";
  snoozedUntil: Date | null;
  daysUntilUnsnooze: number;
};

const priorityConfig = {
  hot: { label: "Hot", icon: <Flame className="h-3.5 w-3.5" />, color: "text-red-400", bg: "bg-red-500/10 border-red-500/30", badgeClass: "bg-red-500/20 text-red-400 border-red-500/30", borderLeft: "border-l-red-500" },
  warm: { label: "Warm", icon: <Thermometer className="h-3.5 w-3.5" />, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30", badgeClass: "bg-orange-500/20 text-orange-400 border-orange-500/30", borderLeft: "border-l-orange-500" },
  cold: { label: "Cold", icon: <Snowflake className="h-3.5 w-3.5" />, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30", badgeClass: "bg-blue-500/20 text-blue-400 border-blue-500/30", borderLeft: "border-l-blue-500" },
  inactive: { label: "Inactive", icon: <MinusCircle className="h-3.5 w-3.5" />, color: "text-muted-foreground", bg: "bg-muted/10 border-muted/30", badgeClass: "bg-muted/20 text-muted-foreground border-muted/30", borderLeft: "border-l-muted" },
};

const SNOOZE_OPTIONS = [
  { label: "30 days", days: 30 },
  { label: "45 days", days: 45 },
  { label: "60 days", days: 60 },
  { label: "90 days", days: 90 },
];

export default function FollowUpRadar() {
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [roleFilter, setRoleFilter] = useState<"all" | "owners" | "buyers">("all");
  const [logActivityFor, setLogActivityFor] = useState<{ contactId: number; contactName: string } | null>(null);
  const [showSnoozed, setShowSnoozed] = useState(false);

  const queryInput = useMemo(() => ({
    thresholds,
    isOwner: roleFilter === "owners" ? true : roleFilter === "buyers" ? false : undefined,
    isBuyer: roleFilter === "buyers" ? true : roleFilter === "owners" ? false : undefined,
  }), [thresholds, roleFilter]);

  const { data: radarData, isLoading, refetch } = trpc.followUp.staleContacts.useQuery(queryInput);

  const overdueContacts = (radarData?.overdue ?? []) as StaleContact[];
  const snoozedContacts = (radarData?.snoozed ?? []) as SnoozedContact[];

  const utils = trpc.useUtils();

  const snoozeMutation = trpc.followUp.snooze.useMutation({
    onSuccess: (_, vars) => {
      toast.success(`Contact snoozed for ${vars.days} days — they'll reappear when the snooze expires.`);
      utils.followUp.staleContacts.invalidate();
    },
    onError: (e) => toast.error("Snooze failed: " + e.message),
  });

  const unsnoozeMutation = trpc.followUp.unsnooze.useMutation({
    onSuccess: () => {
      toast.success("Contact unsnoozed — they're back on the Radar.");
      utils.followUp.staleContacts.invalidate();
    },
    onError: (e) => toast.error("Unsnooze failed: " + e.message),
  });

  // Group overdue by priority
  const grouped = useMemo(() => {
    const groups: Record<string, StaleContact[]> = { hot: [], warm: [], cold: [], inactive: [] };
    overdueContacts.forEach(c => {
      const p = c.priority as keyof typeof groups;
      if (groups[p]) groups[p].push(c);
    });
    return groups;
  }, [overdueContacts]);

  const formatLastAttempt = (c: StaleContact) => {
    if (c.neverContacted) return "Never contacted";
    if (c.daysSince === 0) return "Today";
    if (c.daysSince === 1) return "Yesterday";
    return `${c.daysSince} days ago`;
  };

  const overdueLabel = (c: StaleContact) => {
    if (c.neverContacted) return "Never attempted";
    if ((c.daysOverdue ?? 0) === 0) return "Due today";
    return `${c.daysOverdue}d overdue`;
  };

  const overdueColor = (c: StaleContact) => {
    if (c.neverContacted) return "text-purple-400";
    const d = c.daysOverdue ?? 0;
    if (d >= 14) return "text-red-400";
    if (d >= 7) return "text-orange-400";
    return "text-yellow-400";
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Radar className="h-6 w-6 text-primary" />
            Follow-Up Radar
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Contacts overdue for an attempt — any logged activity resets the clock, regardless of outcome
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />Refresh
        </Button>
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-2 bg-muted/20 border border-border rounded-lg px-4 py-3">
        <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          <strong className="text-foreground">Any attempt counts</strong> — voicemails, no-answers, and emails all reset the clock.
          Use <strong className="text-foreground">Snooze</strong> to temporarily park contacts who aren't ready yet — they'll reappear automatically when the snooze expires.
        </p>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border bg-card">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Show</p>
            <Tabs value={roleFilter} onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}>
              <TabsList className="w-full">
                <TabsTrigger value="all" className="flex-1">All Contacts</TabsTrigger>
                <TabsTrigger value="owners" className="flex-1 gap-1.5"><Building2 className="h-3.5 w-3.5" />Owners</TabsTrigger>
                <TabsTrigger value="buyers" className="flex-1 gap-1.5"><User className="h-3.5 w-3.5" />Buyers</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Current Thresholds</p>
            <div className="grid grid-cols-4 gap-2">
              {(["hot", "warm", "cold", "inactive"] as const).map(p => (
                <div key={p} className={`rounded-md border px-2 py-1.5 text-center ${priorityConfig[p].bg}`}>
                  <div className={`flex items-center justify-center gap-1 ${priorityConfig[p].color} mb-0.5`}>
                    {priorityConfig[p].icon}
                    <span className="text-[10px] font-semibold uppercase">{priorityConfig[p].label}</span>
                  </div>
                  <span className="text-sm font-bold text-foreground">{thresholds[p]}d</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Threshold Sliders */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            Adjust Follow-Up Windows
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4 space-y-4">
          {(["hot", "warm", "cold", "inactive"] as const).map(priority => (
            <div key={priority} className="flex items-center gap-4">
              <div className={`flex items-center gap-1.5 w-24 shrink-0 ${priorityConfig[priority].color}`}>
                {priorityConfig[priority].icon}
                <span className="text-sm font-medium">{priorityConfig[priority].label}</span>
              </div>
              <div className="flex-1">
                <Slider
                  value={[thresholds[priority]]}
                  onValueChange={([v]) => setThresholds(prev => ({ ...prev, [priority]: v }))}
                  min={1}
                  max={90}
                  step={1}
                  className="w-full"
                />
              </div>
              <div className="w-16 text-right">
                <span className="text-sm font-semibold text-foreground">{thresholds[priority]} days</span>
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7"
            onClick={() => setThresholds(DEFAULT_THRESHOLDS)}
          >
            Reset to defaults
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {isLoading ? (
        <Card className="border-border bg-card">
          <CardContent className="py-10 flex items-center justify-center gap-2">
            <RefreshCw className="h-5 w-5 text-muted-foreground animate-spin" />
            <span className="text-sm text-muted-foreground">Scanning contacts...</span>
          </CardContent>
        </Card>
      ) : overdueContacts.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="py-12 flex flex-col items-center gap-3">
            <div className="p-3 rounded-full bg-green-500/10 border border-green-500/20">
              <Radar className="h-6 w-6 text-green-400" />
            </div>
            <p className="text-sm font-medium text-foreground">You're all caught up!</p>
            <p className="text-xs text-muted-foreground text-center max-w-sm">
              No contacts are overdue for a follow-up attempt based on your current thresholds.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              <span className="text-foreground font-semibold">{overdueContacts.length}</span> contact{overdueContacts.length !== 1 ? "s" : ""} need attention
            </p>
          </div>

          {(["hot", "warm", "cold", "inactive"] as const).map(priority => {
            const group = grouped[priority];
            if (!group || group.length === 0) return null;
            const cfg = priorityConfig[priority];
            return (
              <div key={priority} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <span className={cfg.color}>{cfg.icon}</span>
                  <h3 className={`text-sm font-semibold ${cfg.color}`}>{cfg.label} Priority</h3>
                  <Badge variant="outline" className={`text-[10px] ${cfg.badgeClass}`}>{group.length}</Badge>
                  <span className="text-xs text-muted-foreground">— follow up every {thresholds[priority]} days</span>
                </div>

                <div className="space-y-1.5">
                  {group.map(contact => (
                    <Card
                      key={contact.id}
                      className={`border-border bg-card hover:bg-muted/5 transition-colors border-l-2 ${cfg.borderLeft}`}
                    >
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {/* Avatar */}
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${cfg.bg} ${cfg.color} border`}>
                            {contact.firstName[0]}{contact.lastName[0]}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Link href={`/contacts/${contact.id}`}>
                                <span className="text-sm font-medium text-foreground hover:text-primary cursor-pointer">
                                  {contact.firstName} {contact.lastName}
                                </span>
                              </Link>
                              {contact.company && (
                                <span className="text-xs text-muted-foreground truncate">· {contact.company}</span>
                              )}
                              <div className="flex gap-1 ml-auto">
                                {contact.isOwner && (
                                  <Badge variant="outline" className="text-[10px] border-blue-500/40 text-blue-300 gap-0.5">
                                    <Building2 className="h-2.5 w-2.5" />Owner
                                  </Badge>
                                )}
                                {contact.isBuyer && (
                                  <Badge variant="outline" className="text-[10px] border-green-500/40 text-green-300 gap-0.5">
                                    <User className="h-2.5 w-2.5" />Buyer
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Last attempt: {formatLastAttempt(contact)}
                              </span>
                              <span className={`text-xs font-semibold ${overdueColor(contact)}`}>
                                {overdueLabel(contact)}
                              </span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {contact.phone && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 w-7 p-0"
                                title={`Log call with ${contact.firstName}`}
                                onClick={() => setLogActivityFor({ contactId: contact.id, contactName: `${contact.firstName} ${contact.lastName}` })}
                              >
                                <Phone className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {contact.email && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 w-7 p-0"
                                title={`Log email to ${contact.firstName}`}
                                onClick={() => setLogActivityFor({ contactId: contact.id, contactName: `${contact.firstName} ${contact.lastName}` })}
                              >
                                <Mail className="h-3.5 w-3.5" />
                              </Button>
                            )}

                            {/* Snooze Dropdown */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 gap-1 text-xs text-muted-foreground hover:text-foreground"
                                  title="Snooze this contact"
                                >
                                  <BellOff className="h-3.5 w-3.5" />
                                  Snooze
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                  Park for how long?
                                </div>
                                <DropdownMenuSeparator />
                                {SNOOZE_OPTIONS.map(opt => (
                                  <DropdownMenuItem
                                    key={opt.days}
                                    className="text-sm cursor-pointer"
                                    onClick={() => snoozeMutation.mutate({ contactId: contact.id, days: opt.days })}
                                  >
                                    <BellOff className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                                    {opt.label}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>

                            <Link href={`/contacts/${contact.id}`}>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                <ChevronRight className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Snoozed Contacts Section */}
      {snoozedContacts.length > 0 && (
        <div className="space-y-2">
          <button
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left px-1"
            onClick={() => setShowSnoozed(v => !v)}
          >
            <BellOff className="h-4 w-4" />
            <span className="font-medium">Snoozed Contacts</span>
            <Badge variant="outline" className="text-[10px] bg-muted/20 text-muted-foreground border-muted/30">
              {snoozedContacts.length}
            </Badge>
            <span className="text-xs ml-1">— hidden until snooze expires</span>
            <span className="ml-auto">
              {showSnoozed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </span>
          </button>

          {showSnoozed && (
            <div className="space-y-1.5">
              {snoozedContacts.map(contact => {
                const cfg = priorityConfig[contact.priority];
                const snoozeExpiry = contact.snoozedUntil
                  ? new Date(contact.snoozedUntil).toLocaleDateString()
                  : "Unknown";
                return (
                  <Card
                    key={contact.id}
                    className="border-border bg-card/50 opacity-70 hover:opacity-90 transition-opacity border-l-2 border-l-muted"
                  >
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${cfg.bg} ${cfg.color} border`}>
                          {contact.firstName[0]}{contact.lastName[0]}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link href={`/contacts/${contact.id}`}>
                              <span className="text-sm font-medium text-foreground hover:text-primary cursor-pointer">
                                {contact.firstName} {contact.lastName}
                              </span>
                            </Link>
                            {contact.company && (
                              <span className="text-xs text-muted-foreground truncate">· {contact.company}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <BellOff className="h-3 w-3" />
                              Snoozed until {snoozeExpiry}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              ({contact.daysUntilUnsnooze} day{contact.daysUntilUnsnooze !== 1 ? "s" : ""} remaining)
                            </span>
                          </div>
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 gap-1 text-xs shrink-0"
                          title="Wake up this contact now"
                          onClick={() => unsnoozeMutation.mutate({ contactId: contact.id })}
                        >
                          <BellRing className="h-3.5 w-3.5" />
                          Unsnooze
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Log Activity Modal */}
      {logActivityFor && (
        <LogActivityModal
          open={true}
          onClose={() => setLogActivityFor(null)}
          prefill={{ contactId: logActivityFor.contactId }}
          onSuccess={() => {
            setLogActivityFor(null);
            refetch();
            toast.success("Activity logged — contact clock reset!");
          }}
        />
      )}
    </div>
  );
}
