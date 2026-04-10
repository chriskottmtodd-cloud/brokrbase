import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, MoreHorizontal, Trash2, User as UserIcon } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const PRIORITIES = [
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cold", label: "Cold" },
  { value: "inactive", label: "Inactive" },
] as const;

interface Props {
  contact: Record<string, any>;
  onSave: (key: string, value: any) => Promise<void>;
}

export function ContactHeader({ contact, onSave }: Props) {
  const [, setLocation] = useLocation();
  const [editingName, setEditingName] = useState(false);
  const [editingCompany, setEditingCompany] = useState(false);
  const [firstDraft, setFirstDraft] = useState("");
  const [lastDraft, setLastDraft] = useState("");
  const [companyDraft, setCompanyDraft] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);
  const companyRef = useRef<HTMLInputElement>(null);

  const deleteContact = trpc.contacts.delete.useMutation({
    onSuccess: () => {
      toast.success("Contact deleted");
      setLocation("/contacts");
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (editingName && firstRef.current) {
      firstRef.current.focus();
      firstRef.current.select();
    }
  }, [editingName]);

  useEffect(() => {
    if (editingCompany && companyRef.current) {
      companyRef.current.focus();
      companyRef.current.select();
    }
  }, [editingCompany]);

  const initials = `${(contact.firstName?.[0] ?? "").toUpperCase()}${(contact.lastName?.[0] ?? "").toUpperCase()}`;

  const saveName = async () => {
    if (firstDraft && (firstDraft !== contact.firstName || lastDraft !== contact.lastName)) {
      await onSave("firstName", firstDraft);
      await onSave("lastName", lastDraft);
    }
    setEditingName(false);
  };

  const saveCompany = async () => {
    if (companyDraft !== (contact.company ?? "")) {
      await onSave("company", companyDraft || null);
    }
    setEditingCompany(false);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/contacts")} className="gap-1 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Contacts
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            {editingName ? (
              <div className="flex items-center gap-1.5">
                <Input
                  ref={firstRef}
                  value={firstDraft}
                  onChange={(e) => setFirstDraft(e.target.value)}
                  placeholder="First"
                  className="text-2xl font-semibold h-auto py-0.5 px-1 border-transparent focus:border-border w-[45%]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); saveName(); }
                    if (e.key === "Escape") setEditingName(false);
                  }}
                />
                <Input
                  value={lastDraft}
                  onChange={(e) => setLastDraft(e.target.value)}
                  placeholder="Last"
                  className="text-2xl font-semibold h-auto py-0.5 px-1 border-transparent focus:border-border w-[45%]"
                  onBlur={saveName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); saveName(); }
                    if (e.key === "Escape") setEditingName(false);
                  }}
                />
              </div>
            ) : (
              <h1
                className="text-2xl font-semibold cursor-text hover:bg-muted/50 rounded px-1 -ml-1 transition-colors"
                onClick={() => {
                  setFirstDraft(contact.firstName);
                  setLastDraft(contact.lastName);
                  setEditingName(true);
                }}
              >
                {contact.firstName} {contact.lastName}
              </h1>
            )}

            {editingCompany ? (
              <Input
                ref={companyRef}
                value={companyDraft}
                onChange={(e) => setCompanyDraft(e.target.value)}
                placeholder="Company"
                className="text-sm h-auto py-0.5 px-1 -ml-1 mt-0.5 border-transparent focus:border-border text-muted-foreground"
                onBlur={saveCompany}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); saveCompany(); }
                  if (e.key === "Escape") setEditingCompany(false);
                }}
              />
            ) : (
              <div
                className="text-sm text-muted-foreground cursor-text hover:bg-muted/50 rounded px-1 -ml-1 py-0.5 mt-0.5 transition-colors"
                onClick={() => {
                  setCompanyDraft(contact.company ?? "");
                  setEditingCompany(true);
                }}
              >
                {contact.company || <span className="italic text-muted-foreground/60">Add company...</span>}
              </div>
            )}

            <div className="flex items-center gap-2 mt-2">
              <Select
                value={contact.priority}
                onValueChange={(v) => onSave("priority", v)}
              >
                <SelectTrigger className="h-7 text-xs w-auto min-w-[80px] border-transparent hover:border-border transition-colors capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <button
                type="button"
                onClick={() => onSave("isOwner", !contact.isOwner)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  contact.isOwner
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "text-muted-foreground/50 border-dashed border-muted-foreground/30 hover:border-muted-foreground/50"
                }`}
              >
                Owner
              </button>

              <button
                type="button"
                onClick={() => onSave("isBuyer", !contact.isBuyer)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  contact.isBuyer
                    ? "bg-green-50 text-green-700 border-green-200"
                    : "text-muted-foreground/50 border-dashed border-muted-foreground/30 hover:border-muted-foreground/50"
                }`}
              >
                Buyer
              </button>
            </div>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setShowDelete(true)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Delete Contact
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{contact.firstName} {contact.lastName}</strong> will be permanently deleted.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteContact.mutate({ id: contact.id })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
