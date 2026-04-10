import { useState } from "react";
import { Loader2, ArrowRight, Check, Mic, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

export default function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    company: "",
    title: "",
    phone: "",
    marketFocus: "",
    signature: "",
  });

  const updateMut = trpc.users.updateMyProfile.useMutation();

  const handleSave = async () => {
    try {
      await updateMut.mutateAsync({
        company: form.company || undefined,
        title: form.title || undefined,
        phone: form.phone || undefined,
        marketFocus: form.marketFocus || undefined,
        signature: form.signature || undefined,
      });
      onComplete();
    } catch (err) {
      toast.error("Failed to save profile");
    }
  };

  const steps = [
    // Step 0: Welcome
    <div key="welcome" className="text-center space-y-4">
      <div
        className="text-4xl font-bold"
        style={{ color: "#d03238" }}
      >
        Welcome to Brokrbase
      </div>
      <p className="text-gray-600 text-lg max-w-md mx-auto">
        The CRM that updates itself. Let's get you set up in under a minute.
      </p>
      <Button
        onClick={() => setStep(1)}
        className="gap-2 mt-4"
        style={{ backgroundColor: "#d03238" }}
      >
        Get Started <ArrowRight className="h-4 w-4" />
      </Button>
    </div>,

    // Step 1: Company info
    <div key="company" className="space-y-4 max-w-sm mx-auto">
      <div className="text-center mb-2">
        <div className="text-xs text-gray-400 uppercase tracking-wide">Step 1 of 3</div>
        <h2 className="text-xl font-semibold mt-1">Your brokerage</h2>
        <p className="text-sm text-gray-500 mt-1">This shows up in emails and AI-drafted messages.</p>
      </div>
      <div>
        <Label>Company / Brokerage</Label>
        <Input
          value={form.company}
          onChange={(e) => setForm({ ...form, company: e.target.value })}
          placeholder="NAI Select"
          autoFocus
        />
      </div>
      <div>
        <Label>Title</Label>
        <Input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Broker Associate"
        />
      </div>
      <div>
        <Label>Phone</Label>
        <Input
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="(208) 555-1234"
        />
      </div>
      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={() => setStep(0)}>Back</Button>
        <Button
          onClick={() => setStep(2)}
          className="flex-1 gap-2"
          style={{ backgroundColor: "#d03238" }}
        >
          Next <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>,

    // Step 2: Market focus
    <div key="market" className="space-y-4 max-w-sm mx-auto">
      <div className="text-center mb-2">
        <div className="text-xs text-gray-400 uppercase tracking-wide">Step 2 of 3</div>
        <h2 className="text-xl font-semibold mt-1">What do you focus on?</h2>
        <p className="text-sm text-gray-500 mt-1">The AI uses this to draft better emails and understand your voice memos.</p>
      </div>
      <div>
        <Label>Market focus</Label>
        <Textarea
          rows={3}
          value={form.marketFocus}
          onChange={(e) => setForm({ ...form, marketFocus: e.target.value })}
          placeholder="e.g. Office and industrial brokerage in the Boise metro, $1M-$15M deals"
          autoFocus
        />
      </div>
      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
        <Button
          onClick={() => setStep(3)}
          className="flex-1 gap-2"
          style={{ backgroundColor: "#d03238" }}
        >
          Next <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>,

    // Step 3: You're ready
    <div key="ready" className="text-center space-y-5 max-w-md mx-auto">
      <div className="text-xs text-gray-400 uppercase tracking-wide">Step 3 of 3</div>
      <h2 className="text-xl font-semibold">You're all set</h2>
      <p className="text-sm text-gray-500">
        Here's what you can do now:
      </p>
      <div className="space-y-3 text-left">
        <div className="flex items-start gap-3 p-3 rounded-lg border">
          <Upload className="h-5 w-5 text-gray-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium">Import your data</div>
            <div className="text-xs text-gray-500">
              Upload contacts and properties from CSV, or pins from Google My Maps
            </div>
          </div>
        </div>
        <div className="flex items-start gap-3 p-3 rounded-lg border">
          <Mic className="h-5 w-5 text-gray-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium">Voice memo after a call</div>
            <div className="text-xs text-gray-500">
              Tap the mic button in the bottom-right corner. Talk about what happened — Brokrbase logs it, builds tasks, and files everything.
            </div>
          </div>
        </div>
      </div>
      <Button
        onClick={handleSave}
        disabled={updateMut.isPending}
        className="gap-2 w-full"
        style={{ backgroundColor: "#d03238" }}
      >
        {updateMut.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Check className="h-4 w-4" />
        )}
        {updateMut.isPending ? "Saving..." : "Let's go"}
      </Button>
      <button
        onClick={onComplete}
        className="text-xs text-gray-400 hover:text-gray-600"
      >
        Skip for now
      </button>
    </div>,
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-6">
      <div className="w-full max-w-lg">
        {steps[step]}
      </div>
    </div>
  );
}
