import { useState, useCallback } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { ActivityDetailModal } from "@/components/ActivityDetailModal";
import { PropertyHeader } from "./PropertyHeader";
import { KeyMetrics } from "./KeyMetrics";
import { PropertyDetailsSection } from "./PropertyDetailsSection";
import { CustomFieldsSection } from "./CustomFieldsSection";
import { NotesJournal } from "./NotesJournal";
import { OwnerSection } from "./OwnerSection";
import { ActivityTimeline } from "./ActivityTimeline";
import { OpenTasks } from "./OpenTasks";

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const propertyId = parseInt(id ?? "0");
  const [openActivityId, setOpenActivityId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: property, isLoading } = trpc.properties.byId.useQuery(
    { id: propertyId },
    { enabled: !!propertyId },
  );
  const { data: activities = [], refetch: refetchActivities } = trpc.activities.list.useQuery(
    { propertyId, limit: 20 },
    { enabled: !!propertyId },
  );
  const { data: linkedContacts = [] } = trpc.contactLinks.listForProperty.useQuery(
    { propertyId },
    { enabled: !!propertyId },
  );
  const { data: tasks = [] } = trpc.tasks.list.useQuery(
    { propertyId, status: "pending" },
    { enabled: !!propertyId },
  );

  const updateProperty = trpc.properties.update.useMutation({
    onSuccess: () => {
      utils.properties.byId.invalidate({ id: propertyId });
      utils.properties.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = useCallback(
    async (key: string, value: any) => {
      await updateProperty.mutateAsync({
        id: propertyId,
        data: { [key]: value },
      });
    },
    [propertyId, updateProperty],
  );

  const handleSaveCustomFields = useCallback(
    async (fields: { label: string; value: string }[]) => {
      await updateProperty.mutateAsync({
        id: propertyId,
        data: { customFields: JSON.stringify(fields) },
      });
    },
    [propertyId, updateProperty],
  );

  const handleSaveNotes = useCallback(
    async (notes: string) => {
      await updateProperty.mutateAsync({
        id: propertyId,
        data: { notes: notes || null },
      });
    },
    [propertyId, updateProperty],
  );

  if (!propertyId) return <div className="p-6">Invalid property ID</div>;
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!property) return <div className="p-6">Property not found</div>;

  const customFields = (() => {
    try {
      return property.customFields ? JSON.parse(property.customFields) : [];
    } catch {
      return [];
    }
  })();

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <PropertyHeader property={property} onSave={handleSave} />

      <KeyMetrics property={property} onSave={handleSave} />

      <Separator />

      <PropertyDetailsSection property={property} onSave={handleSave} />

      <Separator />

      <CustomFieldsSection customFields={customFields} onSave={handleSaveCustomFields} />

      <Separator />

      {/* Notes + Activity side by side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <NotesJournal notes={property.notes ?? ""} onSave={handleSaveNotes} />
        <ActivityTimeline activities={activities} onOpenActivity={setOpenActivityId} />
      </div>

      <Separator />

      <OwnerSection
        property={property}
        linkedContacts={linkedContacts}
        onSave={handleSave}
      />

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
