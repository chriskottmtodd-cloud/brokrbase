import { AlertTriangle, ExternalLink, UserCheck } from "lucide-react";
import { Link } from "wouter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export interface DuplicateMatch {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
}

interface DuplicateContactWarningProps {
  matches: DuplicateMatch[];
  onProceedAnyway: () => void;
  onCancel: () => void;
  isPending?: boolean;
}

/**
 * Shown inline (inside a form) when the backend finds potential duplicate contacts.
 * The user can navigate to an existing contact OR proceed to create a new one.
 */
export function DuplicateContactWarning({
  matches,
  onProceedAnyway,
  onCancel,
  isPending,
}: DuplicateContactWarningProps) {
  if (matches.length === 0) return null;

  return (
    <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-200">
      <AlertTriangle className="h-4 w-4 text-amber-400" />
      <AlertTitle className="text-amber-300 font-semibold">
        Possible duplicate{matches.length > 1 ? "s" : ""} found
      </AlertTitle>
      <AlertDescription className="mt-2 space-y-3">
        <p className="text-amber-200/80 text-sm">
          {matches.length === 1
            ? "A contact with a similar name, email, or phone already exists:"
            : `${matches.length} contacts with similar details already exist:`}
        </p>
        <div className="space-y-2">
          {matches.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <UserCheck className="h-4 w-4 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-amber-100 text-sm truncate">
                    {m.firstName} {m.lastName}
                    {m.company ? (
                      <span className="text-amber-300/70 font-normal"> · {m.company}</span>
                    ) : null}
                  </p>
                  {(m.email || m.phone) && (
                    <p className="text-amber-300/60 text-xs truncate">
                      {[m.email, m.phone].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              </div>
              <Link href={`/contacts/${m.id}`}>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-3 shrink-0 border-amber-500/40 text-amber-300 hover:bg-amber-500/20 hover:text-amber-100 bg-transparent text-xs"
                >
                  View <ExternalLink className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="border-amber-500/40 text-amber-300 hover:bg-amber-500/20 hover:text-amber-100 bg-transparent"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onProceedAnyway}
            disabled={isPending}
            className="bg-amber-600 hover:bg-amber-500 text-white border-0"
          >
            {isPending ? "Creating…" : "Create anyway"}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
