/**
 * DealResolver — shared component for tiered property matching.
 *
 * Handles 5 scenarios:
 * 1. Auto-linked (high confidence active match) → undo toast
 * 2. Ambiguous (multiple active matches) → "Which one?" picker
 * 3. Inactive match → confirm tap
 * 4. No match, similar exist → "New or one of these?"
 * 5. No match, nothing similar → pre-filled creation card
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Building2, Check, Plus, AlertTriangle, X, ChevronRight,
} from "lucide-react";

export interface ResolvedProperty {
  id: number;
  name: string;
  address?: string | null;
  city?: string | null;
  propertyType?: string;
  unitCount?: number | null;
  ownerName?: string | null;
}

interface Alternative {
  id: number;
  name: string;
  city?: string | null;
  confidence: string;
  tier: string;
  reason: string;
}

export interface DealResolution {
  detectedPropertyId: number | null;
  detectedPropertyName: string | null;
  confidence: "high" | "medium" | "low";
  tier: "active" | "inactive" | "none";
  alternatives: Alternative[];
  isNew: boolean;
}

interface DealResolverProps {
  resolution: DealResolution;
  /** Called when user confirms or selects a property */
  onResolved: (propertyId: number) => void;
  /** Called when user wants to create a new property */
  onCreateNew: (extractedName: string) => void;
  /** Called when user dismisses / undoes an auto-link */
  onUndo?: () => void;
  /** All properties for the "wrong deal?" swap picker */
  allProperties?: Array<{ id: number; name: string; city: string | null }>;
}

export function DealResolver({
  resolution,
  onResolved,
  onCreateNew,
  onUndo,
}: DealResolverProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const { detectedPropertyId, detectedPropertyName, confidence, tier, alternatives, isNew } = resolution;

  // ─── Scenario 1: High-confidence active match → auto-linked with undo toast ──
  if (detectedPropertyId && confidence === "high" && tier === "active") {
    // Fire the auto-link
    onResolved(detectedPropertyId);

    // Show undo toast
    toast(`Linked → ${detectedPropertyName}`, {
      action: {
        label: "Undo",
        onClick: () => {
          onUndo?.();
        },
      },
      duration: 5000,
    });

    return null; // No UI needed — toast handles it
  }

  // ─── Scenario 2: Multiple active matches → "Which one?" ─────────────────────
  if (!detectedPropertyId && alternatives.length > 1 && !isNew) {
    return (
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-amber-400 text-sm font-medium">
            <AlertTriangle className="w-4 h-4" />
            Which "{detectedPropertyName}"?
          </div>
          <div className="space-y-2">
            {alternatives.map((alt) => (
              <button
                key={alt.id}
                onClick={() => onResolved(alt.id)}
                className="w-full text-left px-3 py-2 rounded-md bg-zinc-800/50 hover:bg-zinc-700/50 transition-colors flex items-center justify-between group"
              >
                <div>
                  <span className="text-sm text-zinc-200">{alt.name}</span>
                  {alt.city && (
                    <span className="text-xs text-zinc-500 ml-2">{alt.city}</span>
                  )}
                  <span className="text-xs text-zinc-600 ml-2">({alt.reason})</span>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400" />
              </button>
            ))}
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-xs text-zinc-500 hover:text-zinc-400"
          >
            Skip
          </button>
        </CardContent>
      </Card>
    );
  }

  // ─── Scenario 3: Single inactive match → confirm tap ─────────────────────────
  if (detectedPropertyId && tier === "inactive") {
    return (
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-zinc-400">
                Is this <span className="text-zinc-200 font-medium">"{detectedPropertyName}"</span>?
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                Found in your database but not recently active
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDismissed(true)}
                className="text-zinc-500"
              >
                <X className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                onClick={() => onResolved(detectedPropertyId)}
              >
                <Check className="w-4 h-4 mr-1" />
                Yes
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── Scenario 4: No match, similar exist → "New or one of these?" ────────────
  if (isNew && alternatives.length > 0) {
    return (
      <Card className="border-purple-500/30 bg-purple-500/5">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-purple-400 text-sm font-medium">
            <Building2 className="w-4 h-4" />
            I don't recognize "{detectedPropertyName}". New deal or one of these?
          </div>
          <div className="space-y-2">
            {alternatives.map((alt) => (
              <button
                key={alt.id}
                onClick={() => onResolved(alt.id)}
                className="w-full text-left px-3 py-2 rounded-md bg-zinc-800/50 hover:bg-zinc-700/50 transition-colors flex items-center justify-between group"
              >
                <div>
                  <span className="text-sm text-zinc-200">{alt.name}</span>
                  {alt.city && (
                    <span className="text-xs text-zinc-500 ml-2">{alt.city}</span>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400" />
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onCreateNew(detectedPropertyName ?? "")}
            className="w-full mt-1"
          >
            <Plus className="w-4 h-4 mr-1" />
            It's a new deal
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ─── Scenario 5: No match, nothing similar → pre-filled creation card ────────
  if (isNew && alternatives.length === 0 && detectedPropertyName) {
    return (
      <Card className="border-green-500/30 bg-green-500/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
                <Plus className="w-4 h-4" />
                New deal detected
              </div>
              <div className="text-sm text-zinc-300 mt-1">
                "{detectedPropertyName}"
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                Not in your database — want to add it?
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDismissed(true)}
                className="text-zinc-500"
              >
                Skip
              </Button>
              <Button
                size="sm"
                onClick={() => onCreateNew(detectedPropertyName)}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── Medium confidence single match → confirm with badge ─────────────────────
  if (detectedPropertyId && confidence === "medium") {
    return (
      <Card className="border-zinc-700 bg-zinc-800/30">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-zinc-500" />
              <span className="text-sm text-zinc-300">{detectedPropertyName}</span>
              <Badge variant="outline" className="text-xs text-amber-400 border-amber-500/30">
                {tier === "active" ? "active deal" : "check match"}
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDismissed(true)}
                className="text-zinc-500"
              >
                <X className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                onClick={() => onResolved(detectedPropertyId)}
              >
                <Check className="w-4 h-4 mr-1" />
                Confirm
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
