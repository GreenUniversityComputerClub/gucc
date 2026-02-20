"use client";

import { useState, useRef, useCallback } from "react";
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
}

interface FormErrors {
  [key: string]: string;
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

  const [cv, setCv] = useState<FileState>({
    file: null,
    uploading: false,
    url: "",
    error: "",
    progress: 0,
  });

  const [photo, setPhoto] = useState<FileState>({
    file: null,
    uploading: false,
    url: "",
    error: "",
    progress: 0,
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const cvInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

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

  // ─── File upload ─────────────────────────────────────────────────────────

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
      progress: 10,
    }));

    // Clear any previous file error
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[type];
      return copy;
    });

    try {
      const formDataObj = new FormData();
      formDataObj.append("file", file);
      formDataObj.append("type", type);

      setter((prev) => ({ ...prev, progress: 40 }));

      const response = await fetch("/api/recruitment/upload", {
        method: "POST",
        body: formDataObj,
      });

      setter((prev) => ({ ...prev, progress: 80 }));

      const result = await response.json();

      if (!response.ok) {
        setter((prev) => ({
          ...prev,
          uploading: false,
          error: result.error || "Upload failed",
          progress: 0,
        }));
        return;
      }

      setter((prev) => ({
        ...prev,
        uploading: false,
        url: result.url,
        progress: 100,
      }));
    } catch {
      setter((prev) => ({
        ...prev,
        uploading: false,
        error: "Network error. Please try again.",
        progress: 0,
      }));
    }
  };

  const handleCvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      setCv((prev) => ({ ...prev, error: "Only PDF files are allowed" }));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setCv((prev) => ({ ...prev, error: "Max file size is 10MB" }));
      return;
    }

    uploadFile(file, "cv", setCv);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setPhoto((prev) => ({
        ...prev,
        error: "Only JPG, PNG, or WebP files are allowed",
      }));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhoto((prev) => ({ ...prev, error: "Max file size is 5MB" }));
      return;
    }

    uploadFile(file, "photo", setPhoto);
  };

  const clearFile = (type: "cv" | "photo") => {
    if (type === "cv") {
      setCv({ file: null, uploading: false, url: "", error: "", progress: 0 });
      if (cvInputRef.current) cvInputRef.current.value = "";
    } else {
      setPhoto({
        file: null,
        uploading: false,
        url: "",
        error: "",
        progress: 0,
      });
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  // ─── Submit ──────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");

    if (!validateAll()) return;

    setSubmitting(true);

    try {
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
      });

      const result = await response.json();

      if (!response.ok) {
        setSubmitError(result.error || "Submission failed. Please try again.");
        setSubmitting(false);
        return;
      }

      setShowSuccess(true);
    } catch {
      setSubmitError("Network error. Please check your connection and try again.");
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
    <div className="space-y-2">
      <Label>{label} *</Label>
      <div
        className={`relative rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          state.url
            ? "border-primary/50 bg-primary/5"
            : state.error || errors[type]
              ? "border-destructive/50 bg-destructive/5"
              : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
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
          <div className="space-y-3">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Uploading...</p>
            <div className="mx-auto h-2 w-48 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${state.progress}%` }}
              />
            </div>
          </div>
        ) : state.url ? (
          <div className="space-y-2">
            <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
            <p className="text-sm font-medium text-primary">
              {state.file?.name || "Uploaded"}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => clearFile(type)}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="mr-1 h-3 w-3" />
              Remove
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full space-y-2"
          >
            <Icon className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Click to upload</p>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </button>
        )}
      </div>
      {(state.error || errors[type]) && (
        <p className="flex items-center gap-1 text-sm text-destructive">
          <AlertCircle className="h-3 w-3" />
          {state.error || errors[type]}
        </p>
      )}
    </div>
  );

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Join <span className="text-primary">GUCC</span>
        </h1>
        <p className="mt-2 text-muted-foreground">
          Apply to become a member of Green University Computer Club
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Application Form</CardTitle>
          <CardDescription>
            Fill out the form below to apply. All fields marked with * are
            required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* ─── Personal Info ─────────────────────────────────────── */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Personal Information
              </h3>

              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  placeholder="Enter your full name"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  aria-invalid={!!errors.name}
                />
                {errors.name && (
                  <p className="flex items-center gap-1 text-sm text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    {errors.name}
                  </p>
                )}
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your.email@example.com"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  aria-invalid={!!errors.email}
                />
                {errors.email && (
                  <p className="flex items-center gap-1 text-sm text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    {errors.email}
                  </p>
                )}
              </div>

              {/* Student ID & Phone */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="studentId">Student ID *</Label>
                  <Input
                    id="studentId"
                    placeholder="232002184"
                    value={formData.studentId}
                    onChange={(e) =>
                      handleInputChange("studentId", e.target.value)
                    }
                    aria-invalid={!!errors.studentId}
                  />
                  {errors.studentId && (
                    <p className="flex items-center gap-1 text-sm text-destructive">
                      <AlertCircle className="h-3 w-3" />
                      {errors.studentId}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number *</Label>
                  <Input
                    id="phone"
                    placeholder="01XXXXXXXXX"
                    value={formData.phone}
                    onChange={(e) => handleInputChange("phone", e.target.value)}
                    aria-invalid={!!errors.phone}
                  />
                  {errors.phone && (
                    <p className="flex items-center gap-1 text-sm text-destructive">
                      <AlertCircle className="h-3 w-3" />
                      {errors.phone}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* ─── Academic Info ──────────────────────────────────────── */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Academic Information
              </h3>

              {/* Batch */}
              <div className="space-y-2">
                <Label>Batch *</Label>
                <Select
                  value={formData.batch}
                  onValueChange={(val) => handleInputChange("batch", val)}
                >
                  <SelectTrigger aria-invalid={!!errors.batch}>
                    <SelectValue placeholder="Select your batch" />
                  </SelectTrigger>
                  <SelectContent>
                    {BATCHES.map((batch) => (
                      <SelectItem key={batch} value={batch}>
                        {batch} Batch
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.batch && (
                  <p className="flex items-center gap-1 text-sm text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    {errors.batch}
                  </p>
                )}
              </div>

              {/* Credit & CGPA */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="completedCredit">Completed Credit *</Label>
                  <Input
                    id="completedCredit"
                    type="number"
                    min="0"
                    max="200"
                    step="1"
                    placeholder="e.g., 90"
                    value={formData.completedCredit}
                    onChange={(e) =>
                      handleInputChange("completedCredit", e.target.value)
                    }
                    aria-invalid={!!errors.completedCredit}
                  />
                  {errors.completedCredit && (
                    <p className="flex items-center gap-1 text-sm text-destructive">
                      <AlertCircle className="h-3 w-3" />
                      {errors.completedCredit}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cgpa">CGPA *</Label>
                  <Input
                    id="cgpa"
                    type="number"
                    min="0"
                    max="4"
                    step="0.01"
                    placeholder="e.g., 3.75"
                    value={formData.cgpa}
                    onChange={(e) => handleInputChange("cgpa", e.target.value)}
                    aria-invalid={!!errors.cgpa}
                  />
                  {errors.cgpa && (
                    <p className="flex items-center gap-1 text-sm text-destructive">
                      <AlertCircle className="h-3 w-3" />
                      {errors.cgpa}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* ─── File Uploads ──────────────────────────────────────── */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Documents
              </h3>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FileUploadBox
                  type="cv"
                  state={cv}
                  inputRef={cvInputRef}
                  onChange={handleCvChange}
                  accept=".pdf"
                  label="CV / Resume"
                  hint="PDF only, max 10MB"
                  icon={FileText}
                />
                <FileUploadBox
                  type="photo"
                  state={photo}
                  inputRef={photoInputRef}
                  onChange={handlePhotoChange}
                  accept=".jpg,.jpeg,.png,.webp"
                  label="Photo"
                  hint="JPG, PNG or WebP, max 5MB"
                  icon={ImageIcon}
                />
              </div>
            </div>

            {/* ─── Positions ─────────────────────────────────────────── */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Preferred Position(s)
              </h3>
              <p className="text-sm text-muted-foreground">
                Select one or more positions you&apos;re interested in.
              </p>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {POSITIONS.map((position) => (
                  <label
                    key={position}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50 has-[button[data-state=checked]]:border-primary has-[button[data-state=checked]]:bg-primary/5"
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
                <p className="flex items-center gap-1 text-sm text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {errors.positions}
                </p>
              )}
            </div>

            {/* ─── Submit Error ───────────────────────────────────────── */}
            {submitError && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p className="text-sm text-destructive">{submitError}</p>
              </div>
            )}

            {/* ─── Submit Button ──────────────────────────────────────── */}
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={submitting || cv.uploading || photo.uploading}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Submit Application
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ─── Success Dialog ────────────────────────────────────────────── */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Application Submitted!
            </DialogTitle>
            <DialogDescription>
              Thank you for applying to GUCC! We have received your application
              and will review it shortly. You&apos;ll receive an email
              notification about the status of your application.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button onClick={() => (window.location.href = "/")}>
              Back to Home
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
