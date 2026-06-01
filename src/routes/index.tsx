import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  DEFAULT_OPTIONS,
  loadImage,
  processSignature,
  SignatureError,
  toSignatureError,
  validateImageFile,
  type ProcessOptions,
} from "@/lib/signature-processor";
import { UploadQuota } from "@/lib/upload-quota";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Upload, Download, ImageIcon, Wand2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Signify — Clean & Bold Signature Maker" },
      {
        name: "description",
        content:
          "Upload any signature image. Instantly remove the background, convert to bold black strokes, and download a transparent PNG.",
      },
      { property: "og:title", content: "Signify — Clean & Bold Signature Maker" },
      {
        property: "og:description",
        content:
          "Upload any signature image. Instantly remove the background and get a bold black transparent PNG.",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.png",
      },
    ],
  }),
  component: Index,
});

/** Surface a SignatureError as a toast with optional hint sub-line. */
function reportError(err: SignatureError) {
  toast.error(err.userMessage, { description: err.hint });
}

function Index() {
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  const [opts, setOpts] = useState<ProcessOptions>(DEFAULT_OPTIONS);
  const [outUrl, setOutUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [conversionPrompt, setConversionPrompt] = useState<{
    name: string;
  } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const quota = useMemo(() => new UploadQuota(), []);

  const run = useCallback(async (url: string, options: ProcessOptions) => {
    setProcessing(true);
    try {
      const img = imgRef.current ?? (await loadImage(url));
      imgRef.current = img;
      const canvas = processSignature(img, options);
      const blob: Blob | null = await new Promise((res) =>
        canvas.toBlob((b) => res(b), "image/png"),
      );
      if (!blob) {
        throw new SignatureError("encode_failed", "Couldn't encode the output PNG.");
      }
      setOutUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch (err) {
      console.error(err);
      setOutUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      reportError(toSignatureError(err));
    } finally {
      setProcessing(false);
    }
  }, []);

  useEffect(() => {
    if (srcUrl) run(srcUrl, opts);
  }, [srcUrl, opts, run]);

  useEffect(() => {
    return () => {
      if (srcUrl) URL.revokeObjectURL(srcUrl);
      if (outUrl) URL.revokeObjectURL(outUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFile = (file: File) => {
    // 1. Throttle / quota first — cheapest reject path
    try {
      quota.consume();
    } catch (err) {
      reportError(toSignatureError(err));
      return;
    }

    // 2. Validate file format / size
    const err = validateImageFile(file);
    if (err) {
      if (err.code === "needs_conversion") {
        setConversionPrompt({ name: file.name || "this file" });
        return;
      }
      reportError(err);
      return;
    }

    imgRef.current = null;
    const url = URL.createObjectURL(file);
    setSrcUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };


  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground text-background">
              <Wand2 className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Signify</span>
          </div>
          <a
            href="#how"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            How it works
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <section className="mb-10 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Turn any signature into a clean, bold PNG
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Upload a photo or scan of your signature in any color, any background.
            We strip the background, boost the strokes, and give you a transparent
            black signature ready to use anywhere.
          </p>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Upload / Original */}
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <Label className="text-sm font-medium">Original</Label>
              <label className="inline-flex">
                <input
                  type="file"
                  accept="image/*,.heic,.heif,.tif,.tiff,.avif"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
                />
                <Button asChild size="sm" variant="secondary">
                  <span className="cursor-pointer">
                    <Upload className="mr-2 h-4 w-4" /> Choose image
                  </span>
                </Button>
              </label>
            </div>
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              className="flex aspect-4/3 items-center justify-center rounded-md border-2 border-dashed border-border bg-muted/30"
              style={{
                backgroundImage:
                  "linear-gradient(45deg, var(--muted) 25%, transparent 25%), linear-gradient(-45deg, var(--muted) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--muted) 75%), linear-gradient(-45deg, transparent 75%, var(--muted) 75%)",
                backgroundSize: "20px 20px",
                backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
              }}
            >
              {srcUrl ? (
                <img
                  src={srcUrl}
                  alt="uploaded signature"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <div className="text-center text-sm text-muted-foreground">
                  <ImageIcon className="mx-auto mb-2 h-8 w-8 opacity-50" />
                  Drop an image here or click "Choose image"
                </div>
              )}
            </div>
          </Card>

          {/* Output */}
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <Label className="text-sm font-medium">
                Result {processing && <span className="ml-2 text-xs text-muted-foreground">processing…</span>}
              </Label>
              <Button
                size="sm"
                disabled={!outUrl}
                onClick={() => {
                  if (!outUrl) return;
                  const a = document.createElement("a");
                  a.href = outUrl;
                  a.download = "signature.png";
                  a.click();
                }}
              >
                <Download className="mr-2 h-4 w-4" /> Download PNG
              </Button>
            </div>
            <div
              className="flex aspect-4/3 items-center justify-center rounded-md border border-border"
              style={{
                backgroundImage:
                  "linear-gradient(45deg, var(--muted) 25%, transparent 25%), linear-gradient(-45deg, var(--muted) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--muted) 75%), linear-gradient(-45deg, transparent 75%, var(--muted) 75%)",
                backgroundSize: "20px 20px",
                backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
              }}
            >
              {outUrl ? (
                <img
                  src={outUrl}
                  alt="processed signature"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <div className="text-sm text-muted-foreground">
                  Your bold, transparent signature will appear here
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Controls */}
        <Card className="mt-6 p-6">
          <h2 className="mb-4 text-sm font-semibold">Fine-tune</h2>
          <div className="grid gap-6 sm:grid-cols-3">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>Ink sensitivity</Label>
                <span className="text-xs text-muted-foreground">{opts.threshold}</span>
              </div>
              <Slider
                value={[opts.threshold]}
                min={60}
                max={230}
                step={1}
                onValueChange={(v) => setOpts((o) => ({ ...o, threshold: v[0] }))}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Higher = catch lighter strokes. Lower = only the darkest ink.
              </p>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>Boldness</Label>
                <span className="text-xs text-muted-foreground">{opts.boldness}px</span>
              </div>
              <Slider
                value={[opts.boldness]}
                min={0}
                max={10}
                step={1}
                onValueChange={(v) => setOpts((o) => ({ ...o, boldness: v[0] }))}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Thicken the strokes.
              </p>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Auto-crop</Label>
                <Switch
                  checked={opts.trim}
                  onCheckedChange={(v) => setOpts((o) => ({ ...o, trim: v }))}
                />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label>Padding</Label>
                  <span className="text-xs text-muted-foreground">{opts.padding}px</span>
                </div>
                <Slider
                  value={[opts.padding]}
                  min={0}
                  max={120}
                  step={2}
                  onValueChange={(v) => setOpts((o) => ({ ...o, padding: v[0] }))}
                />
              </div>
            </div>
          </div>
        </Card>

        <section id="how" className="mt-16 grid gap-6 sm:grid-cols-3">
          {[
            { t: "1. Upload", d: "Photo, scan, JPG, PNG — any color, any background." },
            { t: "2. Process", d: "We detect ink, remove the paper, and thicken the strokes." },
            { t: "3. Download", d: "Get a transparent PNG with crisp black strokes." },
          ].map((s) => (
            <Card key={s.t} className="p-5">
              <div className="text-sm font-semibold">{s.t}</div>
              <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
            </Card>
          ))}
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        Built with Signify — processed entirely in your browser. Nothing is uploaded.
      </footer>

      <AlertDialog
        open={conversionPrompt !== null}
        onOpenChange={(open) => !open && setConversionPrompt(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert this file first</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="block">
                <span className="font-medium text-foreground">
                  {conversionPrompt?.name}
                </span>{" "}
                is in a format (HEIC, TIFF, or AVIF) that browsers can't decode
                directly. Convert it to PNG or JPG and try again.
              </span>
              <span className="mt-3 block text-sm">
                <span className="font-medium text-foreground">Quick options:</span>
                <ul className="mt-1 list-inside list-disc space-y-1">
                  <li>
                    <span className="font-medium">iPhone:</span> Settings → Camera →
                    Formats → "Most Compatible" before re-taking, or share the photo
                    and choose JPEG.
                  </li>
                  <li>
                    <span className="font-medium">macOS:</span> Open in Preview → File
                    → Export → choose PNG or JPEG.
                  </li>
                  <li>
                    <span className="font-medium">Windows / online:</span> Use any
                    image converter (e.g. squoosh.app) to save as PNG.
                  </li>
                </ul>
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setConversionPrompt(null)}>
              Got it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

