import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Wand2, Loader2, User, Copy, CheckCircle2,
} from "lucide-react";
import type { EmailAnalysis, CoachingPoint } from "./types";

interface EditingChatProps {
  analysis: EmailAnalysis;
  tone: "tight" | "balanced" | "conversational";
  setTone: (v: "tight" | "balanced" | "conversational") => void;
  chatMessages: ChatMessage[];
  chatInput: string;
  setChatInput: (v: string) => void;
  isChatting: boolean;
  sendChatEdit: (instruction: string) => void;
  handleChatKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  copyChatDraft: (idx: number, text: string) => void;
  copiedChat: number | null;
  marketIntelData?: {
    marketName?: string | null;
    entries: Array<{ content: string; marketName?: string | null; source?: string | null }>;
  } | null;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  isEmail?: boolean;
}

export function EditingChat({
  analysis, tone, setTone,
  chatMessages, chatInput, setChatInput,
  isChatting, sendChatEdit, handleChatKeyDown,
  copyChatDraft, copiedChat,
  marketIntelData,
}: EditingChatProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isChatting]);

  return (
    <div className="border border-border/60 rounded-lg bg-card overflow-hidden">
      {/* Chat header */}
      <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <Wand2 className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Continue Editing</span>
          <span className="text-xs text-muted-foreground hidden sm:inline">— refine until it's right</span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          {(["tight", "balanced", "conversational"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTone(t)}
              title={t === "tight" ? "Tight — maximally direct" : t === "balanced" ? "Balanced — context-aware" : "Conversational — warm & natural"}
              className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                tone === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border/60 hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {t === "tight" ? "⚡" : t === "balanced" ? "⚖️" : "💬"} {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
          {chatMessages.length > 0 && (
            <span className="text-[10px] text-muted-foreground ml-1">{Math.ceil(chatMessages.length / 2)} rev.</span>
          )}
        </div>
      </div>

      {/* Quick-action chips from coaching points */}
      {analysis.coachingPoints.length > 0 && chatMessages.length === 0 && (
        <div className="px-4 pt-3 pb-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-2">Apply a coaching suggestion</p>
          <div className="flex flex-wrap gap-1.5">
            {analysis.coachingPoints.slice(0, 5).map((pt, i) => (
              <button
                key={i}
                onClick={() => sendChatEdit(pt.text)}
                disabled={isChatting}
                className="text-[11px] px-2.5 py-1 rounded-full border border-border/60 bg-background/50 text-muted-foreground hover:border-primary/50 hover:text-foreground hover:bg-primary/5 transition-all disabled:opacity-40 text-left"
              >
                {pt.text.length > 70 ? pt.text.slice(0, 70) + "…" : pt.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Market intel quick-action chips */}
      {marketIntelData && marketIntelData.entries.length > 0 && chatMessages.length === 0 && (
        <div className="px-4 pt-2 pb-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-2 flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-400" />
            Market Intel — {marketIntelData.marketName ?? "Your Market"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {marketIntelData.entries.slice(0, 6).map((entry, i) => (
              <button
                key={i}
                onClick={() => sendChatEdit(`Weave in this market stat from my knowledge base: "${entry.content.slice(0, 200)}"`)}
                disabled={isChatting}
                className="text-[11px] px-2.5 py-1 rounded-full border border-violet-500/30 bg-violet-500/5 text-violet-400 hover:border-violet-400/60 hover:text-violet-300 hover:bg-violet-500/10 transition-all disabled:opacity-40 text-left"
              >
                {entry.content.length > 60 ? entry.content.slice(0, 60) + "…" : entry.content}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat message thread */}
      {chatMessages.length > 0 && (
        <div className="px-4 py-3 space-y-3 max-h-96 overflow-y-auto">
          {chatMessages.map((msg, i) => (
            <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Wand2 className="h-3 w-3 text-primary" />
                </div>
              )}
              <div className={`max-w-[85%] space-y-1.5 ${
                msg.role === "user"
                  ? "bg-primary/10 border border-primary/20 rounded-2xl rounded-tr-sm px-3 py-2"
                  : "bg-background/60 border border-border/50 rounded-2xl rounded-tl-sm px-3 py-2.5"
              }`}>
                {msg.isEmail ? (
                  <>
                    <pre className="whitespace-pre-wrap text-sm text-foreground font-sans leading-relaxed">{msg.text}</pre>
                    <div className="flex items-center gap-2 pt-1 border-t border-border/30">
                      <button
                        onClick={() => copyChatDraft(i, msg.text)}
                        className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                      >
                        {copiedChat === i
                          ? <><CheckCircle2 className="h-3 w-3 text-green-400" /> Copied</>
                          : <><Copy className="h-3 w-3" /> Copy this version</>
                        }
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-foreground">{msg.text}</p>
                )}
              </div>
              {msg.role === "user" && (
                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <User className="h-3 w-3 text-muted-foreground" />
                </div>
              )}
            </div>
          ))}
          {isChatting && (
            <div className="flex gap-2.5 justify-start">
              <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <Wand2 className="h-3 w-3 text-primary" />
              </div>
              <div className="bg-background/60 border border-border/50 rounded-2xl rounded-tl-sm px-3 py-2.5">
                <div className="flex gap-1 items-center">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      )}

      {/* Input row */}
      <div className="px-4 pb-4 pt-2 flex gap-2 items-end">
        <Textarea
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={handleChatKeyDown}
          placeholder={chatMessages.length === 0
            ? marketIntelData && marketIntelData.entries.length > 0
              ? `Edit the email or ask a question — e.g. "add the vacancy stat", "how would I open with the market data?", "make it shorter"…`
              : "Tell me what to change — e.g. \"make it shorter\", \"soften the tone a bit\", \"add the Payette price\"…"
            : "Another edit or question…"
          }
          rows={2}
          disabled={isChatting}
          className="bg-background/50 border-border text-sm resize-none flex-1"
        />
        <Button
          onClick={() => sendChatEdit(chatInput)}
          disabled={isChatting || !chatInput.trim()}
          size="sm"
          className="h-10 px-3 shrink-0"
        >
          {isChatting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
