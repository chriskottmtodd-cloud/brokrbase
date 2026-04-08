import { useAuth } from "@/_core/hooks/useAuth";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import Login from "@/pages/Login";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Contacts from "./pages/Contacts";
import ContactDetail from "./pages/ContactDetail";
import Properties from "./pages/Properties";
import PropertyDetail from "./pages/PropertyDetail";
import MapView from "./pages/MapView";
import Listings from "./pages/Listings";
import ListingDetail from "./pages/ListingDetail";
import Tasks from "./pages/Tasks";
import ActivityLog from "./pages/ActivityLog";
import AIAssistant from "./pages/ai-assistant";
import Notifications from "./pages/Notifications";
import FollowUpRadar from "./pages/FollowUpRadar";
import ImportProperties from "./pages/ImportProperties";
import ImportContacts from "./pages/ImportContacts";
import ImportEnriched from "./pages/ImportEnriched";
import EmailStudio from "./pages/email-studio";
import DataCleanup from "./pages/DataCleanup";
import DataExport from "./pages/DataExport";
import MarketIntel from "./pages/MarketIntel";
import MarketConfig from "./pages/MarketConfig";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/"><Redirect to="/dashboard" /></Route>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/contacts" component={Contacts} />
        <Route path="/contacts/:id" component={ContactDetail} />
        <Route path="/properties" component={Properties} />
        <Route path="/properties/:id" component={PropertyDetail} />
        <Route path="/map" component={MapView} />
        <Route path="/listings" component={Listings} />
        <Route path="/listings/:id" component={ListingDetail} />
        <Route path="/tasks" component={Tasks} />
        <Route path="/activities" component={ActivityLog} />
        <Route path="/ai" component={AIAssistant} />
        <Route path="/email-studio" component={EmailStudio} />
        <Route path="/notifications" component={Notifications} />
        <Route path="/follow-up-radar" component={FollowUpRadar} />
        <Route path="/import-properties" component={ImportProperties} />
        <Route path="/import-contacts" component={ImportContacts} />
        <Route path="/import-enriched" component={ImportEnriched} />
        <Route path="/data-cleanup" component={DataCleanup} />
        <Route path="/export" component={DataExport} />
        <Route path="/market-intel" component={MarketIntel} />
        <Route path="/markets" component={MarketConfig} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  const { isAuthenticated, loading, refresh } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1e1a15]">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <ErrorBoundary>
        <ThemeProvider defaultTheme="light">
          <Login onSuccess={() => refresh()} />
        </ThemeProvider>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster theme="light" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
