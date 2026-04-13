import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

interface DuplicateWarningProps {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  onUseExisting: (contact: { id: number; firstName: string; lastName: string }) => void;
  onCreateAnyway: () => void;
}

export function DuplicateWarning({
  firstName,
  lastName,
  email,
  phone,
  onUseExisting,
  onCreateAnyway,
}: DuplicateWarningProps) {
  const { data: matches } = trpc.contacts.checkDuplicate.useQuery(
    { firstName, lastName, email, phone },
    { enabled: !!firstName },
  );

  if (!matches?.length) return null;

  return (
    <div className="border border-red-300 bg-red-50 rounded-md p-2 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-red-800">
        <AlertTriangle className="h-3.5 w-3.5" />
        Possible duplicate{matches.length > 1 ? "s" : ""}
      </div>
      {matches.map((m) => (
        <div key={m.id} className="flex items-center gap-2 text-xs">
          <div className="flex-1 min-w-0">
            <span className="font-medium">{m.firstName} {m.lastName}</span>
            {m.company && <span className="text-muted-foreground"> — {m.company}</span>}
            {m.email && <span className="text-muted-foreground"> · {m.email}</span>}
          </div>
          <button
            type="button"
            className="text-primary hover:underline text-[10px] font-medium shrink-0"
            onClick={() => onUseExisting({ id: m.id, firstName: m.firstName, lastName: m.lastName ?? "" })}
          >
            Use this
          </button>
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        className="h-6 text-[10px] text-muted-foreground"
        onClick={onCreateAnyway}
      >
        Create new anyway
      </Button>
    </div>
  );
}

export function useDuplicateCheck() {
  const utils = trpc.useUtils();

  const checkForDuplicates = async (input: {
    firstName: string;
    lastName?: string;
    email?: string;
    phone?: string;
  }) => {
    const matches = await utils.contacts.checkDuplicate.fetch(input);
    return matches ?? [];
  };

  return { checkForDuplicates };
}
