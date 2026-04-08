import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import { VoiceMemoButton } from "./VoiceMemoButton";
import {
  Activity,
  Bell,
  Bot,
  Building2,
  Download,
  GitBranch,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Mail,
  Map,
  PanelLeft,
  Radar,
  Tag,
  TrendingUp,
  Upload,
  Users,
  Eraser,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import { GlobalSearch } from "./GlobalSearch";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Users, label: "Contacts", path: "/contacts" },
  { icon: Building2, label: "Properties", path: "/properties" },
  { icon: Map, label: "Map View", path: "/map" },
  { icon: Tag, label: "Listings", path: "/listings" },
  { icon: ListChecks, label: "Tasks", path: "/tasks" },
  { icon: Activity, label: "Activity Log", path: "/activities" },
  { icon: Bot, label: "AI Assistant", path: "/ai" },
  { icon: Mail, label: "Email Studio", path: "/email-studio" },
  { icon: Bell, label: "Notifications", path: "/notifications" },
  { icon: Radar, label: "Follow-Up Radar", path: "/follow-up-radar" },
  { icon: Upload, label: "Import Properties", path: "/import-properties" },
  { icon: Users, label: "Import Contacts", path: "/import-contacts" },
  { icon: Upload, label: "Import Enriched File", path: "/import-enriched" },
  { icon: Eraser, label: "Data Cleanup", path: "/data-cleanup" },
  { icon: Download, label: "Data Export", path: "/export" },
  { icon: TrendingUp, label: "Market Intel", path: "/market-intel" },
  { icon: GitBranch, label: "Markets Config", path: "/markets" },
];

// ─── Password Login Screen ───────────────────────────────────────────────────
function PasswordLoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/password-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error((data as { error?: string }).error ?? "Invalid email or password");
      }
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="flex flex-col items-center gap-6 p-8 max-w-sm w-full">
        <div className="flex items-center gap-3 mb-2">
          <Building2 className="h-10 w-10 text-primary" />
          <div>
            <h1 className="text-xl font-bold text-foreground">RE Investment CRM</h1>
            <p className="text-xs text-muted-foreground">Idaho MHC & Apartments</p>
          </div>
        </div>
        <div className="text-center space-y-1 mb-2">
          <h2 className="text-2xl font-semibold text-foreground">Sign in</h2>
          <p className="text-sm text-muted-foreground">Enter your credentials to continue</p>
        </div>
        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? <><span className="animate-spin mr-2">⟳</span>Signing in...</> : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 180;
const MAX_WIDTH = 400;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return <PasswordLoginScreen />;
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
}) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const activeMenuItem = menuItems.find((item) => item.path === location);

  // Notification count
  const { data: notifications } = trpc.notifications.list.useQuery(
    { unreadOnly: true },
    { refetchInterval: 30000 }
  );
  const unreadCount = notifications?.length ?? 0;

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="border-r border-border" disableTransition={isResizing}>
          {/* Header */}
          <SidebarHeader className="h-16 justify-center border-b border-border">
            <div className="flex items-center gap-2.5 px-2 w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed && (
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Building2 className="h-5 w-5 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground truncate leading-tight">RE CRM</p>
                    <p className="text-xs text-muted-foreground truncate">Idaho Investment Sales</p>
                  </div>
                  <GlobalSearch />
                </div>
              )}
            </div>
          </SidebarHeader>

          {/* Navigation */}
          <SidebarContent className="gap-0 py-2">
            <SidebarMenu className="px-2">
              {menuItems.map((item) => {
                const isActive = location === item.path || (item.path !== "/" && location.startsWith(item.path));
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => { setLocation(item.path); if (isMobile) toggleSidebar(); }}
                      tooltip={item.label}
                      className={`h-9 transition-all font-normal ${isActive ? "border-l-2 border-[oklch(0.68_0.14_60)] pl-[calc(0.5rem-2px)] rounded-l-none" : "border-l-2 border-transparent"}`}
                    >
                      <item.icon className={`h-4 w-4 ${isActive ? "text-[oklch(0.68_0.14_60)]" : "text-muted-foreground"}`} />
                      <span className={isActive ? "text-sidebar-foreground font-semibold" : "text-muted-foreground"}>
                        {item.label}
                      </span>
                      {item.label === "Tasks" && !isCollapsed && unreadCount > 0 && (
                        <Badge className="ml-auto h-5 min-w-5 text-xs bg-primary text-primary-foreground px-1.5">
                          {unreadCount}
                        </Badge>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          {/* Footer */}
          <SidebarFooter className="p-3 border-t border-border">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/50 transition-colors w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-8 w-8 border border-border shrink-0">
                    <AvatarFallback className="text-xs font-semibold bg-primary/20 text-primary">
                      {user?.name?.charAt(0).toUpperCase() ?? "U"}
                    </AvatarFallback>
                  </Avatar>
                  {!isCollapsed && (
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate leading-none text-foreground">{user?.name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground truncate mt-1">{user?.email ?? "—"}</p>
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        {/* Resize handle */}
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/30 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => { if (!isCollapsed) setIsResizing(true); }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset className="bg-background">
        {/* Mobile header */}
        {isMobile && (
          <div className="flex border-b border-border h-14 items-center justify-between bg-background px-3 sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg" />
              <span className="font-medium text-foreground">{activeMenuItem?.label ?? "CRM"}</span>
            </div>
            <div className="flex items-center gap-1">
              <GlobalSearch />
              {unreadCount > 0 && (
                <Button variant="ghost" size="icon" className="h-9 w-9 relative" onClick={() => setLocation("/tasks")}>
                  <Bell className="h-4 w-4" />
                  <span className="absolute top-1 right-1 h-2 w-2 bg-primary rounded-full" />
                </Button>
              )}
            </div>
          </div>
        )}
        <main className="flex-1 overflow-auto">{children}</main>
      </SidebarInset>
      <VoiceMemoButton />
    </>
  );
}
