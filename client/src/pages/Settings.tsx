import { useEffect, useState } from "react";
import {
  Loader2,
  MapPin,
  Palette,
  Plus,
  Save,
  User as UserIcon,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";

// ─── Default property types + colors ────────────────────────────────────────
export const ALL_PROPERTY_TYPES = [
  { value: "apartment", label: "Apartment", defaultColor: "#d03238" },
  { value: "mhc", label: "MHC", defaultColor: "#b02a2f" },
  { value: "office", label: "Office", defaultColor: "#8b2025" },
  { value: "retail", label: "Retail", defaultColor: "#e05a5f" },
  { value: "industrial", label: "Industrial", defaultColor: "#6b7280" },
  { value: "self_storage", label: "Self Storage", defaultColor: "#9ca3af" },
  { value: "affordable_housing", label: "Affordable Housing", defaultColor: "#f07378" },
  { value: "other", label: "Other", defaultColor: "#4b5563" },
] as const;

export interface UserPreferences {
  enabledPropertyTypes?: string[];
  typeColors?: Record<string, string>;
}

export function parsePreferences(raw: string): UserPreferences {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as UserPreferences;
  } catch {
    return {};
  }
}

/** Get the enabled types for a user (defaults to all if not set) */
export function getEnabledTypes(prefs: UserPreferences) {
  const enabled = prefs.enabledPropertyTypes;
  if (!enabled || enabled.length === 0) return ALL_PROPERTY_TYPES.map((t) => t.value);
  return enabled;
}

/** Get pin color for a property type, respecting user overrides */
export function getTypeColor(prefs: UserPreferences, type: string): string {
  if (prefs.typeColors?.[type]) return prefs.typeColors[type];
  const found = ALL_PROPERTY_TYPES.find((t) => t.value === type);
  return found?.defaultColor ?? "#d03238";
}

function TeamSection() {
  const meQuery = trpc.auth.me.useQuery();
  const usersQuery = trpc.users.list.useQuery(undefined, {
    enabled: meQuery.data?.role === "admin",
  });
  const createMut = trpc.users.create.useMutation();

  const [showForm, setShowForm] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "" });

  if (meQuery.data?.role !== "admin") return null;

  const handleCreate = async () => {
    if (!newUser.name || !newUser.email || !newUser.password) {
      toast.error("All fields are required");
      return;
    }
    if (newUser.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    try {
      await createMut.mutateAsync({
        name: newUser.name,
        email: newUser.email,
        password: newUser.password,
        role: "user",
      });
      toast.success(`Created account for ${newUser.name}`);
      setNewUser({ name: "", email: "", password: "" });
      setShowForm(false);
      usersQuery.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create user");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" /> Team
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {usersQuery.data?.map((u) => (
          <div
            key={u.id}
            className="flex items-center gap-3 p-2 border rounded-md"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{u.name}</div>
              <div className="text-xs text-muted-foreground">{u.email}</div>
            </div>
            <Badge variant="outline" className="text-[10px] capitalize">
              {u.role}
            </Badge>
            {u.lastSignedIn && (
              <span className="text-[10px] text-muted-foreground">
                Last login:{" "}
                {new Date(u.lastSignedIn).toLocaleDateString()}
              </span>
            )}
          </div>
        ))}

        {showForm ? (
          <div className="space-y-3 p-3 border rounded-md bg-muted/30">
            <Field label="Name">
              <Input
                value={newUser.name}
                onChange={(e) =>
                  setNewUser({ ...newUser, name: e.target.value })
                }
                placeholder="Blake Smith"
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={newUser.email}
                onChange={(e) =>
                  setNewUser({ ...newUser, email: e.target.value })
                }
                placeholder="blake@example.com"
              />
            </Field>
            <Field label="Temporary password">
              <Input
                type="text"
                value={newUser.password}
                onChange={(e) =>
                  setNewUser({ ...newUser, password: e.target.value })
                }
                placeholder="min 6 characters"
              />
            </Field>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={createMut.isPending}
              >
                {createMut.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : null}
                Create Account
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowForm(true)}
            className="gap-1"
          >
            <Plus className="h-3.5 w-3.5" /> Add User
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

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

  const [prefs, setPrefs] = useState<UserPreferences>({});

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
      setPrefs(parsePreferences(profileQuery.data.preferences ?? ""));
    }
  }, [profileQuery.data]);

  const enabledTypes = getEnabledTypes(prefs);

  const toggleType = (value: string) => {
    const current = [...enabledTypes];
    const idx = current.indexOf(value);
    if (idx >= 0) {
      if (current.length <= 1) {
        toast.error("You need at least one property type enabled");
        return;
      }
      current.splice(idx, 1);
    } else {
      current.push(value);
    }
    setPrefs({ ...prefs, enabledPropertyTypes: current });
  };

  const setTypeColor = (value: string, color: string) => {
    setPrefs({
      ...prefs,
      typeColors: { ...prefs.typeColors, [value]: color },
    });
  };

  const handleSave = async () => {
    try {
      await updateMut.mutateAsync({
        ...form,
        preferences: JSON.stringify(prefs),
      });
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
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Property Types & Map Colors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                Toggle which property types you work with. Disabled types won't show in dropdowns or map filters.
                Pick a pin color for each type on the map.
              </p>
              <div className="space-y-2">
                {ALL_PROPERTY_TYPES.map((pt) => {
                  const isEnabled = enabledTypes.includes(pt.value);
                  const color = getTypeColor(prefs, pt.value);
                  return (
                    <div
                      key={pt.value}
                      className={`flex items-center gap-3 rounded-lg border p-2.5 transition-colors ${
                        isEnabled ? "bg-background" : "bg-muted/40 opacity-60"
                      }`}
                    >
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={() => toggleType(pt.value)}
                      />
                      <div
                        className="h-5 w-5 rounded-full border border-border shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-sm font-medium flex-1">{pt.label}</span>
                      <div className="flex items-center gap-1.5">
                        <Palette className="h-3 w-3 text-muted-foreground" />
                        <input
                          type="color"
                          value={color}
                          onChange={(e) => setTypeColor(pt.value, e.target.value)}
                          className="h-7 w-7 rounded border border-border cursor-pointer bg-transparent p-0"
                          title={`Pick color for ${pt.label}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
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
                  placeholder="e.g. office and industrial brokerage in the Denver metro, $2M–$25M deals"
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

          <TeamSection />
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
