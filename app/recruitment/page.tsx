"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Upload,
  FileText,
  ImageIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────────────

const POSITIONS = [
  "President",
  "Vice President",
  "General Secretary",
  "Treasurer",
  "Joint Secretary",
  "Organizing Secretary",
  "Publication Secretary",
  "Executive Member",
  "Member",
];

const BATCHES = Array.from({ length: 15 }, (_, i) => {
  const year = 2026 - i;
  const suffix =
    year % 10 === 1
      ? "st"
      : year % 10 === 2
        ? "nd"
        : year % 10 === 3
          ? "rd"
          : "th";
  return `${year}${suffix}`;
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^(?:\+?880|0)?1[3-9]\d{8}$/;
const STUDENT_ID_REGEX = /^\d{8,10}$/;

const MAX_CV_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB
const CLIENT_UPLOAD_TIMEOUT = 120_000; // 2 minutes for slow mobile
const CLIENT_MAX_RETRIES = 3;

// ─── Types ───────────────────────────────────────────────────────────────────

interface FormData {
  name: string;
  email: string;
  studentId: string;
  phone: string;
  batch: string;
  completedCredit: string;
  cgpa: string;
  positions: string[];
}

interface FileState {
  file: File | null;
  uploading: boolean;
  url: string;
  error: string;
  progress: number;
  retryCount: number;
}

interface FormErrors {
  [key: string]: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RecruitmentPage() {
  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    studentId: "",
    phone: "",
    batch: "",
    completedCredit: "",
    cgpa: "",
    positions: [],
  });

  const initialFileState: FileState = {
    file: null,
    uploading: false,
    url: "",
    error: "",
    progress: 0,
    retryCount: 0,
  };

  const [cv, setCv] = useState<FileState>(initialFileState);
  const [photo, setPhoto] = useState<FileState>(initialFileState);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [isOnline, setIsOnline] = useState(true);

  const cvInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Online / offline detection ──────────────────────────────────────────

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    setIsOnline(navigator.onLine);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Cleanup progress timer
  useEffect(() => {
    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, []);

  // ─── Validation ──────────────────────────────────────────────────────────

  const validateField = useCallback(
    (field: string, value: string | string[]): string => {
      switch (field) {
        case "name":
          if (!value || (value as string).trim().length < 2)
            return "Name must be at least 2 characters";
          return "";
        case "email":
          if (!value || !EMAIL_REGEX.test(value as string))
            return "Enter a valid email address";
          return "";
        case "studentId":
          if (!value || !STUDENT_ID_REGEX.test(value as string))
            return "Must be 8-10 digits (e.g., 232002184)";
          return "";
        case "phone":
          if (
            !value ||
            !PHONE_REGEX.test((value as string).replace(/\s/g, ""))
          )
            return "Enter a valid Bangladeshi phone number";
          return "";
        case "batch":
          if (!value) return "Select your batch";
          return "";
        case "completedCredit": {
          const credit = Number(value);
          if (!value || isNaN(credit) || credit < 0 || credit > 200)
            return "Must be between 0 and 200";
          return "";
        }
        case "cgpa": {
          const cgpa = Number(value);
          if (!value || isNaN(cgpa) || cgpa < 0 || cgpa > 4.0)
            return "Must be between 0.00 and 4.00";
          return "";
        }
        case "positions":
          if (!value || (value as string[]).length === 0)
            return "Select at least one position";
          return "";
        default:
          return "";
      }
    },
    []
  );

  const validateAll = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    for (const key of Object.keys(formData)) {
      const error = validateField(
        key,
        formData[key as keyof FormData] as string | string[]
      );
      if (error) newErrors[key] = error;
    }

    if (!cv.url) newErrors.cv = "CV upload is required";
    if (!photo.url) newErrors.photo = "Photo upload is required";

    setErrors(newErrors);

    // Scroll to first error on mobile
    if (Object.keys(newErrors).length > 0) {
      const firstErrorKey = Object.keys(newErrors)[0];
      const el =
        document.getElementById(firstErrorKey) ||
        document.querySelector(`[data-field="${firstErrorKey}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }

    return Object.keys(newErrors).length === 0;
  }, [formData, cv.url, photo.url, validateField]);

  // ─── Field handlers ──────────────────────────────────────────────────────

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      const error = validateField(field, value);
      setErrors((prev) => {
        const copy = { ...prev };
        if (error) copy[field] = error;
        else delete copy[field];
        return copy;
      });
    }
  };

  const handlePositionToggle = (position: string) => {
    setFormData((prev) => {
      const newPositions = prev.positions.includes(position)
        ? prev.positions.filter((p) => p !== position)
        : [...prev.positions, position];
      return { ...prev, positions: newPositions };
    });
    if (errors.positions) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy.positions;
        return copy;
      });
    }
  };

  // ─── Simulated progress animation ───────────────────────────────────────

  const startProgressAnimation = (
    setter: React.Dispatch<React.SetStateAction<FileState>>
  ) => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    let current = 10;
    progressTimerRef.current = setInterval(() => {
      current += Math.random() * 3 + 0.5;
      if (current >= 85) {
        current = 85;
        if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      }
      setter((prev) =>
        prev.uploading ? { ...prev, progress: Math.round(current) } : prev
      );
    }, 500);
  };

  const stopProgressAnimation = () => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  // ─── File upload with client-side retry ──────────────────────────────────

  const uploadFile = async (
    file: File,
    type: "cv" | "photo",
    setter: React.Dispatch<React.SetStateAction<FileState>>
  ) => {
    setter((prev) => ({
      ...prev,
      file,
      uploading: true,
      error: "",
      progress: 5,
      retryCount: 0,
    }));

    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[type];
      return copy;
    });

    startProgressAnimation(setter);

    for (let attempt = 0; attempt < CLIENT_MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          setter((prev) => ({
            ...prev,
            progress: 5,
            retryCount: attempt,
          }));
          await new Promise((r) => setTimeout(r, 1500 * attempt));
          startProgressAnimation(setter);
        }

        const formDataObj = new globalThis.FormData();
        formDataObj.append("file", file);
        formDataObj.append("type", type);

        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          CLIENT_UPLOAD_TIMEOUT
        );

        const response = await fetch("/api/recruitment/upload", {
          method: "POST",
          body: formDataObj,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        stopProgressAnimation();
        setter((prev) => ({ ...prev, progress: 90 }));

        const result = await response.json();

        if (!response.ok) {
          if (response.status === 400) {
            setter((prev) => ({
              ...prev,
              uploading: false,
              error: result.error || "Upload failed",
              progress: 0,
              retryCount: 0,
            }));
            return;
          }
          if (attempt < CLIENT_MAX_RETRIES - 1) continue;
          setter((prev) => ({
            ...prev,
            uploading: false,
            error: result.error || "Upload failed. Please try again.",
            progress: 0,
            retryCount: 0,
          }));
          return;
        }

        setter((prev) => ({
          ...prev,
          uploading: false,
          url: result.url,
          error: "",
          progress: 100,
          retryCount: 0,
        }));
        return;
      } catch (err: unknown) {
        stopProgressAnimation();
        const errName = err instanceof Error ? err.name : "";

        if (errName === "AbortError") {
          if (attempt < CLIENT_MAX_RETRIES - 1) continue;
          setter((prev) => ({
            ...prev,
            uploading: false,
            error: "Upload timed out. Check your connection and try again.",
            progress: 0,
            retryCount: 0,
          }));
          return;
        }

        if (attempt < CLIENT_MAX_RETRIES - 1) continue;

        setter((prev) => ({
          ...prev,
          uploading: false,
          error: !navigator.onLine
            ? "You are offline. Connect to the internet and try again."
            : "Upload failed due to network issues. Please try again.",
          progress: 0,
          retryCount: 0,
        }));
        return;
      }
    }
  };

  const handleFileSelect = (
    file: File,
    type: "cv" | "photo",
    setter: React.Dispatch<React.SetStateAction<FileState>>
  ) => {
    const isCV = type === "cv";
    const maxSize = isCV ? MAX_CV_SIZE : MAX_PHOTO_SIZE;
    const allowedTypes = isCV
      ? ["application/pdf"]
      : ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      setter((prev) => ({
        ...prev,
        error: isCV
          ? "Only PDF files are allowed"
          : "Only JPG, PNG, or WebP files are allowed",
      }));
      return;
    }

    if (file.size > maxSize) {
      setter((prev) => ({
        ...prev,
        error: `File too large (${formatFileSize(file.size)}). Max ${formatFileSize(maxSize)}`,
      }));
      return;
    }

    uploadFile(file, type, setter);
  };

  const handleCvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFileSelect(file, "cv", setCv);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFileSelect(file, "photo", setPhoto);
  };

  const retryUpload = (type: "cv" | "photo") => {
    const state = type === "cv" ? cv : photo;
    const setter = type === "cv" ? setCv : setPhoto;
    if (state.file) {
      uploadFile(state.file, type, setter);
    }
  };

  const clearFile = (type: "cv" | "photo") => {
    stopProgressAnimation();
    if (type === "cv") {
      setCv({ ...initialFileState });
      if (cvInputRef.current) cvInputRef.current.value = "";
    } else {
      setPhoto({ ...initialFileState });
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  // ─── Submit ──────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");

    if (!isOnline) {
      setSubmitError(
        "You are offline. Please connect to the internet and try again."
      );
      return;
    }

    if (!validateAll()) return;

    setSubmitting(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60_000);

      const response = await fetch("/api/recruitment/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim().toLowerCase(),
          studentId: formData.studentId.trim(),
          phone: formData.phone.trim(),
          batch: formData.batch,
          completedCredit: Number(formData.completedCredit),
          cgpa: Number(formData.cgpa),
          cvUrl: cv.url,
          photoUrl: photo.url,
          positions: formData.positions,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const result = await response.json();

      if (!response.ok) {
        setSubmitError(result.error || "Submission failed. Please try again.");
        setSubmitting(false);
        return;
      }

      setShowSuccess(true);
    } catch (err: unknown) {
      const errName = err instanceof Error ? err.name : "";
      if (errName === "AbortError") {
        setSubmitError("Submission timed out. Please try again.");
      } else if (!navigator.onLine) {
        setSubmitError(
          "You are offline. Please connect to the internet and try again."
        );
      } else {
        setSubmitError(
          "Network error. Please check your connection and try again."
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ─── File upload UI helper ──────────────────────────────────────────────

  const FileUploadBox = ({
    type,
    state,
    inputRef,
    onChange,
    accept,
    label,
    hint,
    icon: Icon,
  }: {
    type: "cv" | "photo";
    state: FileState;
    inputRef: React.RefObject<HTMLInputElement | null>;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    accept: string;
    label: string;
    hint: string;
    icon: typeof FileText;
  }) => (
    <div className="space-y-2" data-field={type}>
      <Label className="text-sm font-medium">{label} *</Label>
      <div
        className={`relative min-h-[140px] rounded-xl border-2 border-dashed p-4 text-center transition-all duration-200 sm:p-6 ${
          state.url
            ? "border-primary/50 bg-primary/5"
            : state.error || errors[type]
              ? "border-destructive/50 bg-destructive/5"
              : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50 active:bg-muted/80"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={onChange}
          className="hidden"
          disabled={state.uploading}
        />

        {state.uploading ? (
          <div className="flex flex-col items-center justify-center space-y-3 py-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary sm:h-10 sm:w-10" />
            <p className="text-sm font-medium text-muted-foreground">
              {state.retryCount > 0
                ? `Retrying (${state.retryCount}/${CLIENT_MAX_RETRIES - 1})...`
                : "Uploading..."}
            </p>
            {state.file && (
              <p className="text-xs text-muted-foreground/70">
                {state.file.name} ({formatFileSize(state.file.size)})
              </p>
            )}
            <div className="h-2 w-full max-w-[200px] overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${state.progress}%` }}
              />
            </div>
            <p className="text-xs tabular-nums text-muted-foreground/60">
              {state.progress}%
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => clearFile(type)}
              className="mt-1 h-8 text-xs text-muted-foreground hover:text-destructive"
            >
              Cancel
            </Button>
          </div>
        ) : state.url ? (
          <div className="flex flex-col items-center justify-center space-y-2 py-2">
            <CheckCircle2 className="h-8 w-8 text-primary sm:h-10 sm:w-10" />
            <p className="max-w-full truncate text-sm font-medium text-primary">
              {state.file?.name || "Uploaded"}
            </p>
            {state.file && (
              <p className="text-xs text-muted-foreground/70">
                {formatFileSize(state.file.size)}
              </p>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => clearFile(type)}
              className="h-8 text-xs text-muted-foreground hover:text-destructive"
            >
              <X className="mr-1 h-3 w-3" />
              Remove
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center space-y-2 py-2"
          >
            <div className="rounded-full bg-muted p-3">
              <Icon className="h-6 w-6 text-muted-foreground sm:h-7 sm:w-7" />
            </div>
            <p className="text-sm font-medium">
              Tap to {type === "photo" ? "take or select photo" : "select file"}
            </p>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </button>
        )}
      </div>

      {/* Error with retry button */}
      {(state.error || errors[type]) && !state.uploading && (
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <div className="flex-1">
            <p className="text-sm text-destructive">
              {state.error || errors[type]}
            </p>
            {state.file && state.error && !errors[type] && (
              <button
                type="button"
                onClick={() => retryUpload(type)}
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
              >
                <RefreshCw className="h-3 w-3" />
                Tap to retry
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="container mx-auto max-w-2xl px-3 py-6 sm:px-4 sm:py-12">
      {/* Offline banner */}
      {!isOnline && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-400">
          <WifiOff className="h-4 w-4 shrink-0" />
          <p>You are offline. Some features may not work.</p>
        </div>
      )}

      {/* Header */}
      <div className="mb-6 text-center sm:mb-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">
          Join <span className="text-primary">GUCC</span>
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground sm:mt-2 sm:text-base">
          Apply to become a member of Green University Computer Club
        </p>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="px-4 pb-4 pt-5 sm:px-6 sm:pb-6 sm:pt-6">
          <CardTitle className="text-lg sm:text-xl">
            Application Form
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Fill out the form below. All fields marked with * are required.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-6 sm:px-6">
          <form
            ref={formRef}
            onSubmit={handleSubmit}
            className="space-y-6 sm:space-y-8"
            noValidate
          >
            {/* ─── Personal Info ─────────────────────────────────────── */}
            <fieldset className="space-y-4">
              <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:text-sm">
                Personal Information
              </legend>

              {/* Name */}
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-sm">
                  Full Name *
                </Label>
                <Input
                  id="name"
                  placeholder="Enter your full name"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  aria-invalid={!!errors.name}
                  autoComplete="name"
                  className="h-11 text-base sm:h-10 sm:text-sm"
                />
                {errors.name && (
                  <p className="flex items-center gap-1 text-xs text-destructive sm:text-sm">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    {errors.name}
                  </p>
                )}
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm">
                  Email *
                </Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  placeholder="your.email@example.com"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  aria-invalid={!!errors.email}
                  autoComplete="email"
                  className="h-11 text-base sm:h-10 sm:text-sm"
                />
                {errors.email && (
                  <p className="flex items-center gap-1 text-xs text-destructive sm:text-sm">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    {errors.email}
                  </p>
                )}
              </div>

              {/* Student ID & Phone */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="studentId" className="text-sm">
                    Student ID *
                  </Label>
                  <Input
                    id="studentId"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="232002184"
                    value={formData.studentId}
                    onChange={(e) =>
                      handleInputChange("studentId", e.target.value)
                    }
                    aria-invalid={!!errors.studentId}
                    className="h-11 text-base sm:h-10 sm:text-sm"
                  />
                  {errors.studentId && (
                    <p className="flex items-center gap-1 text-xs text-destructive sm:text-sm">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      {errors.studentId}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-sm">
                    Phone Number *
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    placeholder="01XXXXXXXXX"
                    value={formData.phone}
                    onChange={(e) => handleInputChange("phone", e.target.value)}
                    aria-invalid={!!errors.phone}
                    autoComplete="tel"
                    className="h-11 text-base sm:h-10 sm:text-sm"
                  />
                  {errors.phone && (
                    <p className="flex items-center gap-1 text-xs text-destructive sm:text-sm">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      {errors.phone}
                    </p>
                  )}
                </div>
              </div>
            </fieldset>

            {/* ─── Academic Info ──────────────────────────────────────── */}
            <fieldset className="space-y-4">
              <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:text-sm">
                Academic Information
              </legend>

              {/* Batch */}
              <div className="space-y-1.5">
                <Label className="text-sm">Batch *</Label>
                <Select
                  value={formData.batch}
                  onValueChange={(val) => handleInputChange("batch", val)}
                >
                  <SelectTrigger
                    aria-invalid={!!errors.batch}
                    className="h-11 text-base sm:h-10 sm:text-sm"
                  >
                    <SelectValue placeholder="Select your batch" />
                  </SelectTrigger>
                  <SelectContent>
                    {BATCHES.map((batch) => (
                      <SelectItem
                        key={batch}
                        value={batch}
                        className="text-base sm:text-sm"
                      >
                        {batch} Batch
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.batch && (
                  <p className="flex items-center gap-1 text-xs text-destructive sm:text-sm">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    {errors.batch}
                  </p>
                )}
              </div>

              {/* Credit & CGPA — always 2 cols */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="completedCredit" className="text-sm">
                    Completed Credit *
                  </Label>
                  <Input
                    id="completedCredit"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="200"
                    step="1"
                    placeholder="e.g., 90"
                    value={formData.completedCredit}
                    onChange={(e) =>
                      handleInputChange("completedCredit", e.target.value)
                    }
                    aria-invalid={!!errors.completedCredit}
                    className="h-11 text-base sm:h-10 sm:text-sm"
                  />
                  {errors.completedCredit && (
                    <p className="flex items-center gap-1 text-xs text-destructive sm:text-sm">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      {errors.completedCredit}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cgpa" className="text-sm">
                    CGPA *
                  </Label>
                  <Input
                    id="cgpa"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="4"
                    step="0.01"
                    placeholder="e.g., 3.75"
                    value={formData.cgpa}
                    onChange={(e) => handleInputChange("cgpa", e.target.value)}
                    aria-invalid={!!errors.cgpa}
                    className="h-11 text-base sm:h-10 sm:text-sm"
                  />
                  {errors.cgpa && (
                    <p className="flex items-center gap-1 text-xs text-destructive sm:text-sm">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      {errors.cgpa}
                    </p>
                  )}
                </div>
              </div>
            </fieldset>

            {/* ─── File Uploads ──────────────────────────────────────── */}
            <fieldset className="space-y-4">
              <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:text-sm">
                Documents
              </legend>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FileUploadBox
                  type="cv"
                  state={cv}
                  inputRef={cvInputRef}
                  onChange={handleCvChange}
                  accept=".pdf,application/pdf"
                  label="CV / Resume"
                  hint="PDF only, max 10 MB"
                  icon={FileText}
                />
                <FileUploadBox
                  type="photo"
                  state={photo}
                  inputRef={photoInputRef}
                  onChange={handlePhotoChange}
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  label="Photo"
                  hint="JPG, PNG or WebP, max 5 MB"
                  icon={ImageIcon}
                />
              </div>
            </fieldset>

            {/* ─── Positions ─────────────────────────────────────────── */}
            <fieldset className="space-y-3 sm:space-y-4" data-field="positions">
              <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:text-sm">
                Preferred Position(s)
              </legend>
              <p className="text-xs text-muted-foreground sm:text-sm">
                Select one or more positions you&apos;re interested in.
              </p>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
                {POSITIONS.map((position) => (
                  <label
                    key={position}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all duration-150 active:scale-[0.98] hover:bg-muted/50 has-[button[data-state=checked]]:border-primary has-[button[data-state=checked]]:bg-primary/5 sm:p-3.5"
                  >
                    <Checkbox
                      checked={formData.positions.includes(position)}
                      onCheckedChange={() => handlePositionToggle(position)}
                    />
                    <span className="text-sm">{position}</span>
                  </label>
                ))}
              </div>
              {errors.positions && (
                <p className="flex items-center gap-1 text-xs text-destructive sm:text-sm">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  {errors.positions}
                </p>
              )}
            </fieldset>

            {/* ─── Submit Error ───────────────────────────────────────── */}
            {submitError && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 sm:p-4">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p className="text-xs text-destructive sm:text-sm">
                  {submitError}
                </p>
              </div>
            )}

            {/* ─── Submit Button ──────────────────────────────────────── */}
            <Button
              type="submit"
              className="h-12 w-full text-base font-medium sm:h-11 sm:text-sm"
              size="lg"
              disabled={
                submitting || cv.uploading || photo.uploading || !isOnline
              }
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : !isOnline ? (
                <>
                  <WifiOff className="mr-2 h-4 w-4" />
                  Offline
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Submit Application
                </>
              )}
            </Button>

            {/* Connection indicator */}
            {isOnline && (
              <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground/50">
                <Wifi className="h-3 w-3" />
                Connected
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      {/* ─── Success Dialog ────────────────────────────────────────────── */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent className="mx-4 max-w-sm sm:mx-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Application Submitted!
            </DialogTitle>
            <DialogDescription className="text-sm">
              Thank you for applying to GUCC! We have received your application
              and will review it shortly. You&apos;ll receive an email
              notification about the status of your application.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end pt-2">
            <Button
              onClick={() => (window.location.href = "/")}
              className="h-11 sm:h-10"
            >
              Back to Home
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
