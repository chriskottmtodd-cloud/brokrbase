import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import { VoiceMemoReviewPanel, type VoiceMemoResult } from "./VoiceMemoReviewPanel";

type RecordingState = "idle" | "recording" | "uploading" | "processing" | "review";

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  return "audio/mp4"; // iOS Safari fallback
}

export function VoiceMemoButton() {
  const isMobile = useIsMobile();
  const [state, setState] = useState<RecordingState>("idle");
  const [duration, setDuration] = useState(0);
  const [reviewData, setReviewData] = useState<VoiceMemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationRef = useRef(0);

  const process = trpc.voiceMemo.process.useMutation({
    onSuccess: (data) => {
      setReviewData(data as VoiceMemoResult);
      setState("review");
    },
    onError: (err) => {
      setError(err.message);
      setState("idle");
    },
  });

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];
      durationRef.current = 0;
      setDuration(0);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const finalDuration = durationRef.current;
        setState("uploading");
        try {
          const base64 = await blobToBase64(blob);
          setState("processing");
          process.mutate({
            audioBase64: base64,
            mimeType,
            durationSeconds: finalDuration,
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to encode audio");
          setState("idle");
        }
      };

      recorder.start(1000);
      setState("recording");
      timerRef.current = setInterval(() => {
        durationRef.current += 1;
        setDuration(durationRef.current);
      }, 1000);
    } catch {
      setError("Microphone access denied. Allow mic access in your browser settings.");
      setState("idle");
    }
  }, [process]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  const reset = useCallback(() => {
    setState("idle");
    setReviewData(null);
    setDuration(0);
    setError(null);
  }, []);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, "0")}`;
  };

  return (
    <>
      <div
        className="fixed z-50"
        style={{ bottom: isMobile ? "5rem" : "1.5rem", right: "1.5rem" }}
      >
        {state === "recording" && (
          <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs font-mono px-2 py-1 rounded-full animate-pulse whitespace-nowrap">
            {formatDuration(duration)}
          </div>
        )}
        {(state === "uploading" || state === "processing") && (
          <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-amber-600 text-white text-xs px-2 py-1 rounded-full whitespace-nowrap">
            {state === "uploading" ? "Uploading…" : "Analyzing…"}
          </div>
        )}

        <Button
          size="icon"
          aria-label={state === "recording" ? "Stop recording" : "Record voice memo"}
          className={`h-14 w-14 rounded-full shadow-lg ${
            state === "recording"
              ? "bg-red-600 hover:bg-red-700 animate-pulse"
              : state === "uploading" || state === "processing"
                ? "bg-amber-600 hover:bg-amber-700"
                : "bg-primary hover:bg-primary/90"
          }`}
          onClick={
            state === "idle"
              ? startRecording
              : state === "recording"
                ? stopRecording
                : undefined
          }
          disabled={state === "uploading" || state === "processing"}
        >
          {state === "idle" && <Mic className="h-6 w-6" />}
          {state === "recording" && <Square className="h-5 w-5 fill-current" />}
          {(state === "uploading" || state === "processing") && (
            <Loader2 className="h-6 w-6 animate-spin" />
          )}
        </Button>
      </div>

      {error && (
        <div className="fixed bottom-24 right-6 z-50 bg-red-100 border border-red-300 text-red-800 text-sm px-4 py-2 rounded-lg shadow-md max-w-xs">
          {error}
          <button className="ml-2 font-bold" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}

      <Dialog
        open={state === "review"}
        onOpenChange={(open) => !open && reset()}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Voice Memo Results</DialogTitle>
          </DialogHeader>
          {reviewData && (
            <VoiceMemoReviewPanel data={reviewData} onDone={reset} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error("Failed to read audio blob"));
    reader.readAsDataURL(blob);
  });
}
