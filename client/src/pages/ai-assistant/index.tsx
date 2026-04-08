import { useState } from "react";
import { useSearch } from "wouter";
import { Sparkles, TrendingUp, MessageSquare, Zap, Activity } from "lucide-react";

import { QuickLog } from "./QuickLogTab";
import { DealAnalysis } from "./DealAnalysisTab";
import { OutreachWriter } from "./OutreachWriterTab";
import { DealMatches } from "./DealMatchesTab";

type TabId = "log" | "analysis" | "outreach" | "matches";

export default function AIAssistant() {
  // ─── URL query-param parsing (contextual launch) ────────────────────────────
  const search = useSearch();
  const urlParams = new URLSearchParams(search);
  const tabParam = urlParams.get("tab");
  const initialTab: TabId =
    tabParam === "quicklog" || tabParam === "log" ? "log" :
    tabParam === "analysis" ? "analysis" :
    tabParam === "outreach" ? "outreach" :
    tabParam === "matches" ? "matches" :
    "log";
  const urlContactId = urlParams.get("contactId") ? parseInt(urlParams.get("contactId")!) : null;
  const urlPropertyId = urlParams.get("propertyId") ? parseInt(urlParams.get("propertyId")!) : null;
  const urlListingId = urlParams.get("listingId") ? parseInt(urlParams.get("listingId")!) : null;

  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />AI Assistant
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Dump notes, log calls, process emails — everything flows back to your contacts</p>
      </div>

      <div className="flex gap-1 bg-muted/30 rounded-lg p-1 w-fit flex-wrap">
        {([
          { id: "log"      as TabId, label: "Quick Log",     icon: <Activity className="h-3.5 w-3.5" /> },
          { id: "analysis" as TabId, label: "Deal Analysis", icon: <TrendingUp className="h-3.5 w-3.5" /> },
          { id: "outreach" as TabId, label: "Outreach",      icon: <MessageSquare className="h-3.5 w-3.5" /> },
          { id: "matches"  as TabId, label: "Deal Matches",  icon: <Zap className="h-3.5 w-3.5 text-yellow-400" /> },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm transition-all ${activeTab === tab.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {tab.icon}{tab.label}
            {tab.id === "matches" && <span className="ml-0.5 bg-yellow-500 text-black text-[9px] font-bold px-1 rounded-full">AI</span>}
          </button>
        ))}
      </div>

      {activeTab === "log"      && <QuickLog urlContactId={urlContactId} urlPropertyId={urlPropertyId} urlListingId={urlListingId} />}
      {activeTab === "analysis" && <DealAnalysis />}
      {activeTab === "outreach" && <OutreachWriter />}
      {activeTab === "matches"  && <DealMatches />}
    </div>
  );
}
