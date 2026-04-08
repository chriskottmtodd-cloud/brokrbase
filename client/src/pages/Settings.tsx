import { useEffect, useState } from "react";
import { Loader2, Save, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

export default function Settings() {
  const profileQuery = trpc.users.getMyProfile.useQuery();
  const updateMut = trpc.users.updateMyProfile.useMutation();

  const [form, setForm] = useState({
    name: "",
    company: "",
    title: "",
    phone: "",
    marketFocus: "",
    signature: "",
    voiceNotes: "",
  });

  useEffect(() => {
    if (profileQuery.data) {
      setForm({
        name: profileQuery.data.name ?? "",
        company: profileQuery.data.company ?? "",
        title: profileQuery.data.title ?? "",
        phone: profileQuery.data.phone ?? "",
        marketFocus: profileQuery.data.marketFocus ?? "",
        signature: profileQuery.data.signature ?? "",
        voiceNotes: profileQuery.data.voiceNotes ?? "",
      });
    }
  }, [profileQuery.data]);

  const handleSave = async () => {
    try {
      await updateMut.mutateAsync(form);
      toast.success("Profile saved");
      profileQuery.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <UserIcon className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Your profile drives how Brokrbase's AI features write emails and refer to you.
          </p>
        </div>
      </div>

      {profileQuery.isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {profileQuery.error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
          <div className="font-semibold mb-1">Failed to load profile</div>
          <div className="text-xs whitespace-pre-wrap">{profileQuery.error.message}</div>
        </div>
      )}

      {profileQuery.data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Identity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Full name">
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Field>
                <Field label="Email" sub="Read-only">
                  <Input value={profileQuery.data.email} disabled />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Company / Brokerage">
                  <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
                </Field>
                <Field label="Title">
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </Field>
              </div>
              <Field label="Phone">
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Market focus</CardTitle>
            </CardHeader>
            <CardContent>
              <Field
                label="What you focus on"
                sub="Used by the AI when drafting emails and outreach. Be specific — asset classes, geography, deal sizes."
              >
                <Textarea
                  rows={3}
                  value={form.marketFocus}
                  onChange={(e) => setForm({ ...form, marketFocus: e.target.value })}
                  placeholder="e.g. multifamily and MHC investment sales across Idaho and Montana, deals 50–500 units"
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Email signature</CardTitle>
            </CardHeader>
            <CardContent>
              <Field
                label="Sign-off block"
                sub="The AI appends this to the bottom of every email it drafts."
              >
                <Textarea
                  rows={6}
                  value={form.signature}
                  onChange={(e) => setForm({ ...form, signature: e.target.value })}
                  className="font-mono text-sm"
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Voice notes (optional)</CardTitle>
            </CardHeader>
            <CardContent>
              <Field
                label="Custom voice rules"
                sub="Override or add to the default writing style."
              >
                <Textarea
                  rows={4}
                  value={form.voiceNotes}
                  onChange={(e) => setForm({ ...form, voiceNotes: e.target.value })}
                />
              </Field>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={updateMut.isPending} className="gap-2">
              {updateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {updateMut.isPending ? "Saving…" : "Save Profile"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </Label>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      {children}
    </div>
  );
}
