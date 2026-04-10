import { useState, useCallback } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { ActivityDetailModal } from "@/components/ActivityDetailModal";
import { ContactHeader } from "./ContactHeader";
import { ContactInfoSection } from "./ContactInfoSection";
import { NotesJournal } from "../property-detail/NotesJournal";
import { ActivityTimeline } from "../property-detail/ActivityTimeline";
import { LinkedProperties } from "./LinkedProperties";
import { OpenTasks } from "../property-detail/OpenTasks";

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const contactId = parseInt(id ?? "0");
  const [openActivityId, setOpenActivityId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: contact, isLoading } = trpc.contacts.byId.useQuery(
    { id: contactId },
    { enabled: !!contactId },
  );
  const { data: activities = [], refetch: refetchActivities } = trpc.activities.list.useQuery(
    { contactId, limit: 20 },
    { enabled: !!contactId },
  );
  const { data: linkedProperties = [] } = trpc.contactLinks.listForContact.useQuery(
    { contactId },
    { enabled: !!contactId },
  );
  const { data: tasks = [] } = trpc.tasks.list.useQuery(
    { contactId, status: "pending" },
    { enabled: !!contactId },
  );

  const updateContact = trpc.contacts.update.useMutation({
    onSuccess: () => {
      utils.contacts.byId.invalidate({ id: contactId });
      utils.contacts.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = useCallback(
    async (key: string, value: any) => {
      await updateContact.mutateAsync({
        id: contactId,
        [key]: value,
      });
    },
    [contactId, updateContact],
  );

  const handleSaveNotes = useCallback(
    async (notes: string) => {
      await updateContact.mutateAsync({
        id: contactId,
        notes: notes || undefined,
      });
    },
    [contactId, updateContact],
  );

  if (!contactId) return <div className="p-6">Invalid contact ID</div>;
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!contact) return <div className="p-6">Contact not found</div>;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <ContactHeader contact={contact} onSave={handleSave} />

      <Separator />

      <ContactInfoSection contact={contact} onSave={handleSave} />

      <Separator />

      {/* Notes + Activity side by side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <NotesJournal notes={contact.notes ?? ""} onSave={handleSaveNotes} />
        <ActivityTimeline activities={activities} onOpenActivity={setOpenActivityId} />
      </div>

      {(linkedProperties as any[]).length > 0 && (
        <>
          <Separator />
          <LinkedProperties linkedProperties={linkedProperties} />
        </>
      )}

      {(tasks as any[]).length > 0 && (
        <>
          <Separator />
          <OpenTasks tasks={tasks} />
        </>
      )}

      <ActivityDetailModal
        activityId={openActivityId}
        open={openActivityId !== null}
        onClose={() => setOpenActivityId(null)}
        onChanged={() => refetchActivities()}
      />
    </div>
  );
}
