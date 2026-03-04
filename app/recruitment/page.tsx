"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  CreditCard,
  ExternalLink,
  Clock,
  Mail,
  BookOpen,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────────────

const POSITIONS = [
  "President",
  "Vice-President",
  "General Secretary",
  "Joint General Secretary",
  "Treasurer",
  "Organizing Secretary",
  "Joint Organizing Secretary",
  "Event Coordinator",
  "Programming Secretary",
  "Information Secretary",
  "Joint Information Secretary",
  "Outreach Secretary",
  "Publication Secretary",
  "Joint Publication Secretary",
  "Cultural Secretary",
  "Graphics and Multimedia Coordinators",
  "Photography Secretary",
  "Photo and Video Editor",
  "Sports Secretary",
  "Executive Members",
] as const;

const SEMESTERS = [
  "1st",
  "2nd",
  "3rd",
  "4th",
  "5th",
  "6th",
  "7th",
  "8th",
  "Others",
] as const;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^(?:\+?880|0)?1[3-9]\d{8}$/;
const STUDENT_ID_REGEX = /^\d{9}$/;

const MAX_CV_SIZE = 50 * 1024 * 1024;
const MAX_PHOTO_SIZE = 50 * 1024 * 1024;
const MAX_ID_SIZE = 50 * 1024 * 1024;
const CLIENT_UPLOAD_TIMEOUT = 180_000;
const CLIENT_MAX_RETRIES = 4;

const APPLICATION_DEADLINE = "13 March 2026 (Friday) 11:59 PM";

// ─── Direct-to-GAS upload (bypasses Vercel ~4.5 MB body limit) ───────────────

const GAS_UPLOAD_URL =
  "https://script.google.com/macros/s/AKfycbx8JQnkB9Do0PZt0WADzCFuRojLB5Ze2nMOZV1hgdqAFN5H7wpoaze3YPsT1RAeeq5H/exec";

type FileCategory = "cv" | "photo" | "idCard";

const ACCEPTED_TYPES: Record<FileCategory, string[]> = {
  cv: [
    "application/pdf",
    "application/x-pdf",
    "application/acrobat",
    "application/vnd.pdf",
    "text/pdf",
    "text/x-pdf",
  ],
  photo: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
  idCard: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
};

const ACCEPTED_EXTENSIONS: Record<FileCategory, string[]> = {
  cv: ["pdf"],
  photo: ["jpg", "jpeg", "png", "webp"],
  idCard: ["jpg", "jpeg", "png", "webp"],
};

const FILE_LABELS: Record<FileCategory, string> = {
  cv: "CV (PDF)",
  photo: "Photo",
  idCard: "ID Card",
};

function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

function isValidUploadType(file: File, category: FileCategory): boolean {
  const mime = (file.type || "").toLowerCase().trim();
  const ext = getFileExtension(file.name);
  if (mime && ACCEPTED_TYPES[category].includes(mime)) return true;
  if (ext && ACCEPTED_EXTENSIONS[category].includes(ext)) return true;
  return false;
}

/**
 * Read a file as base64 with real progress tracking.
 * Returns an abortable handle so cancel / unmount can stop the read.
 */
function fileToBase64(
  file: File,
  onProgress?: (fraction: number) => void,
): { promise: Promise<string>; abort: () => void } {
  const reader = new FileReader();
  const promise = new Promise<string>((resolve, reject) => {
    if (onProgress) {
      reader.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
    }
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read the file. It may be corrupted."));
    reader.onabort = () => {
      const err = new Error("File reading cancelled");
      err.name = "AbortError";
      reject(err);
    };
    reader.readAsDataURL(file);
  });
  return { promise, abort: () => reader.abort() };
}

function isRetryableGASStatus(status: number): boolean {
  return [429, 500, 502, 503, 504].includes(status);
}

// Teal color tokens for light / dark
const TEAL = {
  text: "text-[#006380] dark:text-[#5ec4db]",
  border: "border-[#006380] dark:border-[#5ec4db]",
  bgSubtle: "bg-[#006380]/5 dark:bg-[#5ec4db]/10",
  bgIcon: "bg-[#006380]/10 dark:bg-[#5ec4db]/15",
  focusBorder: "focus-visible:border-[#006380] dark:focus-visible:border-[#5ec4db]",
  selectFocusBorder: "focus:border-[#006380] dark:focus:border-[#5ec4db] data-[state=open]:border-[#006380] dark:data-[state=open]:border-[#5ec4db]",
  radio: "peer-checked:border-[#006380] dark:peer-checked:border-[#5ec4db]",
  radioDot: "bg-[#006380] dark:bg-[#5ec4db]",
  progressBar: "bg-[#006380] dark:bg-[#5ec4db]",
  spinner: "text-[#006380] dark:text-[#5ec4db]",
  link: "text-[#006380] dark:text-[#5ec4db] decoration-[#006380]/30 dark:decoration-[#5ec4db]/30 hover:text-[#007a99] dark:hover:text-[#7dd3e8]",
  btnBg: "bg-[#006380] hover:bg-[#005566] dark:bg-[#1a8fa8] dark:hover:bg-[#157d94]",
  uploadHover: "hover:border-[#006380]/50 dark:hover:border-[#5ec4db]/40 hover:bg-[#006380]/5 dark:hover:bg-[#5ec4db]/10 active:bg-[#006380]/10 dark:active:bg-[#5ec4db]/15",
  deadlineBg: "bg-[#006380]/5 dark:bg-[#5ec4db]/10 border-[#006380]/20 dark:border-[#5ec4db]/20",
  deadlineIcon: "text-[#006380] dark:text-[#5ec4db]",
  clearBtn: "text-[#006380] dark:text-[#5ec4db] hover:bg-[#006380]/5 dark:hover:bg-[#5ec4db]/10 hover:text-[#005566] dark:hover:text-[#7dd3e8]",
} as const;

// ─── Types ───────────────────────────────────────────────────────────────────

interface FormData {
  fullName: string;
  studentId: string;
  email: string;
  mobile: string;
  gender: string;
  semester: string;
  batch: string;
  cgpa: string;
  completedCredits: string;
  preferredPosition: string;
  clubWork: string;
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

/** Allow only digits and at most one decimal point (for CGPA, max 4.00) */
function sanitizeCgpaInput(value: string): string {
  // Strip everything except digits and dots
  let cleaned = value.replace(/[^0-9.]/g, "");
  // Allow only the first dot
  const parts = cleaned.split(".");
  if (parts.length > 2) cleaned = parts[0] + "." + parts.slice(1).join("");
  // Limit to reasonable length (e.g. "4.00")
  cleaned = cleaned.slice(0, 4);
  // Prevent leading dot alone → user must type digit first
  if (cleaned === ".") return "";
  // If it parses to > 4, clamp properly
  const num = parseFloat(cleaned);
  if (!isNaN(num) && num > 4) {
    if (cleaned.includes(".")) {
      const [intPart, decPart] = cleaned.split(".");
      if (parseInt(intPart, 10) > 4) return "4";
      // Integer part is 4 — clamp any non-zero decimal digit to 0
      return intPart + "." + decPart.replace(/[1-9]/g, "0");
    }
    return "4";
  }
  return cleaned;
}

/** Allow only digits, clamped to 200 (for credits) */
function sanitizeCreditsInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 3); // max 3 digits
  // Clamp to 200
  if (digits && parseInt(digits, 10) > 200) return "200";
  return digits;
}

// ─── Animated card wrapper ───────────────────────────────────────────────────

function AnimatedCard({
  children,
  index,
  className = "",
  hasError = false,
}: {
  children: React.ReactNode;
  index: number;
  className?: string;
  hasError?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px 60px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <Card
      ref={ref}
      className={`rounded-none shadow-sm will-change-[transform,opacity] transition-all duration-500 ease-out ${
        visible
          ? "translate-y-0 opacity-100"
          : "translate-y-4 opacity-0"
      } ${
        hasError
          ? "ring-1 ring-red-500/40 dark:ring-red-400/30"
          : ""
      } ${className}`}
      style={{ transitionDelay: `${Math.min(index * 40, 300)}ms` }}
    >
      {children}
    </Card>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RecruitmentPage() {
  const [formData, setFormData] = useState<FormData>({
    fullName: "",
    studentId: "",
    email: "",
    mobile: "",
    gender: "",
    semester: "",
    batch: "",
    cgpa: "",
    completedCredits: "",
    preferredPosition: "",
    clubWork: "",
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
  const [idCard, setIdCard] = useState<FileState>(initialFileState);
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [isOnline, setIsOnline] = useState(true);
  const [dragType, setDragType] = useState<string | null>(null);

  const cvInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const idCardInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const uploadAbortRefs = useRef<Record<string, { abort: () => void } | null>>({
    cv: null,
    photo: null,
    idCard: null,
  });
  const progressTimerRefs = useRef<Record<string, ReturnType<typeof setInterval> | null>>({
    cv: null,
    photo: null,
    idCard: null,
  });

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

  useEffect(() => {
    return () => {
      // Abort any in-flight uploads when component unmounts
      Object.values(uploadAbortRefs.current).forEach((handle) => {
        if (handle) handle.abort();
      });
      Object.values(progressTimerRefs.current).forEach((timer) => {
        if (timer) clearInterval(timer);
      });
    };
  }, []);

  // ─── Validation ──────────────────────────────────────────────────────────

  const validateField = useCallback(
    (field: string, value: string): string => {
      switch (field) {
        case "fullName":
          if (!value || value.trim().length < 2)
            return "Full name must be at least 2 characters";
          if (value.trim().length > 100) return "Name is too long";
          return "";
        case "studentId":
          if (!value) return "Student ID is required";
          if (!STUDENT_ID_REGEX.test(value.trim()))
            return "Student ID must be exactly 9 digits (e.g., 232002184)";
          return "";
        case "email":
          if (!value) return "Email is required";
          if (!EMAIL_REGEX.test(value.trim()))
            return "Please enter a valid email address";
          return "";
        case "mobile":
          if (!value) return "Mobile number is required";
          if (!PHONE_REGEX.test(value.replace(/[\s-]/g, "")))
            return "Enter a valid Bangladeshi mobile number (e.g., 01XXXXXXXXX)";
          return "";
        case "gender":
          if (!value) return "Please select your gender";
          return "";
        case "semester":
          if (!value) return "Please select your current semester";
          return "";
        case "batch":
          if (!value || value.trim().length === 0) return "Batch is required";
          return "";
        case "cgpa": {
          if (!value) return "CGPA is required";
          const cgpa = parseFloat(value);
          if (isNaN(cgpa) || cgpa < 0 || cgpa > 4.0)
            return "CGPA must be between 0.00 and 4.00";
          return "";
        }
        case "completedCredits": {
          if (!value) return "Completed credits is required";
          const credits = parseInt(value, 10);
          if (isNaN(credits) || credits < 0 || credits > 200)
            return "Credits must be between 0 and 200";
          return "";
        }
        case "preferredPosition":
          if (!value) return "Please select your preferred position";
          return "";
        default:
          return "";
      }
    },
    []
  );

  const validateAll = useCallback((): boolean => {
    const newErrors: FormErrors = {};
    const requiredFields: (keyof FormData)[] = [
      "fullName",
      "studentId",
      "email",
      "mobile",
      "gender",
      "semester",
      "batch",
      "cgpa",
      "completedCredits",
      "preferredPosition",
    ];

    // Mark all as touched
    const allTouched: Record<string, boolean> = {};
    for (const key of requiredFields) allTouched[key] = true;
    setTouched((prev) => ({ ...prev, ...allTouched }));

    for (const key of requiredFields) {
      const error = validateField(key, formData[key]);
      if (error) newErrors[key] = error;
    }

    if (!cv.url) newErrors.cv = "CV upload is required";
    if (!photo.url) newErrors.photo = "Photo upload is required";
    if (!idCard.url) newErrors.idCard = "Student ID card image is required";

    setErrors(newErrors);

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
  }, [formData, cv.url, photo.url, idCard.url, validateField]);

  // ─── Field handlers ──────────────────────────────────────────────────────

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Re-validate if already touched or has error
    if (errors[field] || touched[field]) {
      const error = validateField(field, value);
      setErrors((prev) => {
        const copy = { ...prev };
        if (error) copy[field] = error;
        else delete copy[field];
        return copy;
      });
    }
  };

  const handleBlur = (field: keyof FormData) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const error = validateField(field, formData[field]);
    setErrors((prev) => {
      const copy = { ...prev };
      if (error) copy[field] = error;
      else delete copy[field];
      return copy;
    });
  };

  // ─── File upload (direct to Google Apps Script — no Vercel size limit) ──
  //
  //  Progress phases:
  //    0 →  8 %  FileReader reads file to base64 (real onprogress)
  //   10 → 95 %  fetch() uploads to GAS (smooth asymptotic estimate,
  //              scales with file size, never stops moving)
  //       100 %  Done (response received)

  /** Start a smooth asymptotic progress animation scaled by file size. */
  const startUploadProgress = (
    type: string,
    fileSize: number,
    setter: React.Dispatch<React.SetStateAction<FileState>>,
  ) => {
    if (progressTimerRefs.current[type]) clearInterval(progressTimerRefs.current[type]!);
    const startTime = Date.now();
    // Estimate how long upload + GAS processing takes (base64 ≈ 1.37× raw size)
    // Assume ~300 KB/s effective throughput to GAS (conservative)
    const estimatedMs = Math.max(4000, (fileSize * 1.37) / (300 * 1024) * 1000);

    progressTimerRefs.current[type] = setInterval(() => {
      const elapsed = Date.now() - startTime;
      // Asymptotic curve: fast start, slows down, never reaches 95%
      // progress = 10 + 85 × (1 − e^(−elapsed / τ))  where τ scales with file size
      const fraction = 1 - Math.exp((-elapsed * 1.5) / estimatedMs);
      const pct = Math.min(95, 10 + Math.round(fraction * 85));
      setter((prev) =>
        prev.uploading ? { ...prev, progress: pct } : prev
      );
    }, 300);
  };

  const stopUploadProgress = (type: string) => {
    if (progressTimerRefs.current[type]) {
      clearInterval(progressTimerRefs.current[type]!);
      progressTimerRefs.current[type] = null;
    }
  };

  const uploadFile = async (
    file: File,
    type: FileCategory,
    setter: React.Dispatch<React.SetStateAction<FileState>>
  ) => {
    // ── Client-side validation ────────────────────────────────────────────
    const label = FILE_LABELS[type];

    if (file.size === 0) {
      setter((prev) => ({
        ...prev,
        file: null,
        error: `${label} file is empty. Please select a valid file.`,
      }));
      return;
    }

    if (!isValidUploadType(file, type)) {
      const exts = ACCEPTED_EXTENSIONS[type].map((e) => `.${e}`).join(", ");
      setter((prev) => ({
        ...prev,
        file: null,
        error: `Invalid ${label} format. Accepted formats: ${exts}`,
      }));
      return;
    }

    // ── Begin upload ──────────────────────────────────────────────────────
    setter((prev) => ({
      ...prev,
      file,
      uploading: true,
      error: "",
      progress: 1,
      retryCount: 0,
    }));

    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[type];
      return copy;
    });

    // ── Phase 1: Convert to base64 with real progress (0→8%) ─────────────
    let base64: string;
    const readerHandle = fileToBase64(file, (fraction) => {
      setter((prev) =>
        prev.uploading ? { ...prev, progress: Math.max(1, Math.round(fraction * 8)) } : prev
      );
    });
    uploadAbortRefs.current[type] = readerHandle;

    try {
      base64 = await readerHandle.promise;
    } catch (err) {
      if (!uploadAbortRefs.current[type]) return; // user cancelled
      if ((err as Error).name === "AbortError") return;
      setter((prev) => ({
        ...prev,
        uploading: false,
        error: "Failed to read the file. It may be corrupted — please try a different file.",
        progress: 0,
      }));
      return;
    }

    // Cancelled during read?
    if (!uploadAbortRefs.current[type]) return;

    setter((prev) => (prev.uploading ? { ...prev, progress: 9 } : prev));

    // Resolve MIME to send to GAS (browser may leave it blank)
    const ext = getFileExtension(file.name);
    const resolvedMime =
      file.type ||
      (type === "cv"
        ? "application/pdf"
        : `image/${ext === "png" ? "png" : ext === "webp" ? "webp" : "jpeg"}`);

    const payload = JSON.stringify({
      file: base64,
      fileName: file.name,
      fileType: resolvedMime,
      type, // "cv" | "photo" | "idCard"
    });

    setter((prev) => (prev.uploading ? { ...prev, progress: 10 } : prev));

    // ── Phase 2: Upload via fetch with smooth estimated progress (10→95%) ──
    for (let attempt = 0; attempt < CLIENT_MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          setter((prev) => ({ ...prev, progress: 10, retryCount: attempt }));
          const delay = 1500 * Math.pow(2, attempt - 1);
          await new Promise((r) => setTimeout(r, delay));
          if (!uploadAbortRefs.current[type]) return; // cancelled during delay
        }

        const controller = new AbortController();
        uploadAbortRefs.current[type] = controller;
        const timeoutId = setTimeout(
          () => controller.abort(),
          CLIENT_UPLOAD_TIMEOUT,
        );

        // Start smooth progress animation (scales with file size, never stops)
        startUploadProgress(type, file.size, setter);

        // POST directly to Google Apps Script (simple request, no CORS preflight)
        const response = await fetch(GAS_UPLOAD_URL, {
          method: "POST",
          body: payload,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        stopUploadProgress(type);

        // Cancelled during fetch?
        if (!uploadAbortRefs.current[type]) return;

        setter((prev) => (prev.uploading ? { ...prev, progress: 96 } : prev));

        // ── Parse response ────────────────────────────────────────────────
        let responseText: string;
        try {
          responseText = await response.text();
        } catch {
          if (!uploadAbortRefs.current[type]) return;
          if (attempt < CLIENT_MAX_RETRIES - 1) continue;
          setter((prev) => ({
            ...prev,
            uploading: false,
            error: "Failed to read upload service response. Please try again.",
            progress: 0,
            retryCount: 0,
          }));
          return;
        }

        // GAS may return an HTML error page on transient failures
        const trimmed = responseText.trimStart().toLowerCase();
        if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")) {
          if (attempt < CLIENT_MAX_RETRIES - 1) continue;
          setter((prev) => ({
            ...prev,
            uploading: false,
            error: "Upload service is temporarily unavailable. Please wait a moment and try again.",
            progress: 0,
            retryCount: 0,
          }));
          return;
        }

        if (!responseText.trim()) {
          if (attempt < CLIENT_MAX_RETRIES - 1) continue;
          setter((prev) => ({
            ...prev,
            uploading: false,
            error: "Upload service returned an empty response. Please try again.",
            progress: 0,
            retryCount: 0,
          }));
          return;
        }

        setter((prev) => (prev.uploading ? { ...prev, progress: 97 } : prev));

        let result: Record<string, unknown>;
        try {
          result = JSON.parse(responseText);
        } catch {
          if (attempt < CLIENT_MAX_RETRIES - 1) continue;
          setter((prev) => ({
            ...prev,
            uploading: false,
            error: "Invalid response from upload service. Please try again.",
            progress: 0,
            retryCount: 0,
          }));
          return;
        }

        // ── Handle explicit GAS errors ────────────────────────────────────
        if (result.success === false || result.error) {
          const msg = String(result.message || result.error || "Upload failed");
          setter((prev) => ({
            ...prev,
            uploading: false,
            error: msg,
            progress: 0,
            retryCount: 0,
          }));
          return;
        }

        // ── Non-OK HTTP status (retryable?) ───────────────────────────────
        if (!response.ok) {
          if (isRetryableGASStatus(response.status) && attempt < CLIENT_MAX_RETRIES - 1) continue;
          setter((prev) => ({
            ...prev,
            uploading: false,
            error: "Upload failed after multiple attempts. Please try again.",
            progress: 0,
            retryCount: 0,
          }));
          return;
        }

        // ── Extract file URL ──────────────────────────────────────────────
        const fileUrl = (
          result.url || result.fileUrl || result.link || result.fileLink
        ) as string | undefined;

        if (!fileUrl) {
          if (attempt < CLIENT_MAX_RETRIES - 1) continue;
          setter((prev) => ({
            ...prev,
            uploading: false,
            error: "Upload completed but the file URL was not returned. Please try again.",
            progress: 0,
            retryCount: 0,
          }));
          return;
        }

        // ── Success !
        setter((prev) => ({
          ...prev,
          uploading: false,
          url: fileUrl,
          error: "",
          progress: 100,
          retryCount: 0,
        }));
        return;
      } catch (err: unknown) {
        stopUploadProgress(type);
        // If user cancelled (clearFile already reset state), stop silently
        if (!uploadAbortRefs.current[type]) return;

        const errName = err instanceof Error ? err.name : "";

        if (errName === "AbortError") {
          if (attempt < CLIENT_MAX_RETRIES - 1) continue;
          setter((prev) => ({
            ...prev,
            uploading: false,
            error: "Upload timed out after multiple attempts. Please check your connection and try again.",
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
    type: "cv" | "photo" | "idCard",
    setter: React.Dispatch<React.SetStateAction<FileState>>,
    maxSize: number,
  ) => {
    // Use the robust MIME + extension validation (handles empty/unknown MIME on mobile)
    if (!isValidUploadType(file, type)) {
      const exts = ACCEPTED_EXTENSIONS[type].map((e) => `.${e}`).join(", ");
      setter((prev) => ({ ...prev, error: `Invalid file format. Accepted: ${exts}`, url: "", file: null }));
      return;
    }
    if (file.size > maxSize) {
      setter((prev) => ({
        ...prev,
        error: `File too large (${formatFileSize(file.size)}). Max ${formatFileSize(maxSize)}`,
        url: "",
        file: null,
      }));
      return;
    }
    if (file.size === 0) {
      setter((prev) => ({ ...prev, error: "File is empty. Please select a valid file.", url: "", file: null }));
      return;
    }
    uploadFile(file, type, setter);
  };

  const handleCvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFileSelect(file, "cv", setCv, MAX_CV_SIZE);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFileSelect(file, "photo", setPhoto, MAX_PHOTO_SIZE);
  };

  const handleIdCardChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFileSelect(file, "idCard", setIdCard, MAX_ID_SIZE);
  };

  const retryUpload = (type: "cv" | "photo" | "idCard") => {
    const stateMap = { cv, photo, idCard };
    const setterMap = { cv: setCv, photo: setPhoto, idCard: setIdCard };
    const state = stateMap[type];
    const setter = setterMap[type];
    if (state.file) uploadFile(state.file, type, setter);
  };

  const clearFile = (type: "cv" | "photo" | "idCard") => {
    stopUploadProgress(type);
    // Abort any in-flight upload (FileReader or fetch) for this type
    if (uploadAbortRefs.current[type]) {
      uploadAbortRefs.current[type]!.abort();
      uploadAbortRefs.current[type] = null;
    }
    const refMap = { cv: cvInputRef, photo: photoInputRef, idCard: idCardInputRef };
    const setterMap = { cv: setCv, photo: setPhoto, idCard: setIdCard };
    setterMap[type]({ ...initialFileState });
    const ref = refMap[type];
    if (ref.current) ref.current.value = "";
  };

  // ─── Drag and drop ──────────────────────────────────────────────────────

  const handleDrop = (
    e: React.DragEvent<HTMLDivElement>,
    type: "cv" | "photo" | "idCard",
    setter: React.Dispatch<React.SetStateAction<FileState>>,
    maxSize: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDragType(null);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    // Don't start a new upload while one is already in progress for this slot
    const stateMap = { cv, photo, idCard };
    if (stateMap[type].uploading) return;
    handleFileSelect(file, type, setter, maxSize);
  };

  const handleDragOver = (e: React.DragEvent, type: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragType(type);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragType(null);
  };

  // ─── Clear form ──────────────────────────────────────────────────────────

  const handleClearForm = () => {
    setFormData({
      fullName: "",
      studentId: "",
      email: "",
      mobile: "",
      gender: "",
      semester: "",
      batch: "",
      cgpa: "",
      completedCredits: "",
      preferredPosition: "",
      clubWork: "",
    });
    // Abort any in-flight uploads
    (["cv", "photo", "idCard"] as const).forEach((type) => {
      stopUploadProgress(type);
      if (uploadAbortRefs.current[type]) {
        uploadAbortRefs.current[type]!.abort();
        uploadAbortRefs.current[type] = null;
      }
    });
    setCv(initialFileState);
    setPhoto(initialFileState);
    setIdCard(initialFileState);
    setErrors({});
    setTouched({});
    setSubmitError("");
    if (cvInputRef.current) cvInputRef.current.value = "";
    if (photoInputRef.current) photoInputRef.current.value = "";
    if (idCardInputRef.current) idCardInputRef.current.value = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ─── Submit ──────────────────────────────────────────────────────────────

  const submittingRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return; // guard against double-click
    setSubmitError("");

    if (!isOnline) {
      setSubmitError(
        "You are offline. Please connect to the internet and try again."
      );
      return;
    }

    if (!validateAll()) return;

    setSubmitting(true);
    submittingRef.current = true;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60_000);

      const response = await fetch("/api/recruitment/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.fullName.trim(),
          studentId: formData.studentId.trim(),
          email: formData.email.trim().toLowerCase(),
          phone: formData.mobile.trim(),
          gender: formData.gender,
          semester: formData.semester,
          batch: formData.batch.trim(),
          cgpa: formData.cgpa.trim(),
          completedCredit: formData.completedCredits.trim(),
          positions: formData.preferredPosition,
          clubWork: formData.clubWork.trim(),
          cvUrl: cv.url,
          photoUrl: photo.url,
          idCardUrl: idCard.url,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      let result: { error?: string; success?: boolean };
      try {
        result = await response.json();
      } catch {
        setSubmitError("Received an invalid response from the server. Please try again.");
        setSubmitting(false);
        return;
      }

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
      submittingRef.current = false;
    }
  };

  // ─── Shared input class ─────────────────────────────────────────────────

  const inputClass = `h-11 rounded-none border-0 border-b-2 border-muted-foreground/30 dark:border-muted-foreground/20 bg-transparent px-0 text-base shadow-none transition-colors duration-200 ${TEAL.focusBorder} focus-visible:ring-0 sm:h-10 sm:text-sm`;

  const selectTriggerClass = `h-11 rounded-none border-0 border-b-2 border-muted-foreground/30 dark:border-muted-foreground/20 bg-transparent px-0 text-base shadow-none transition-colors duration-200 ${TEAL.selectFocusBorder} focus:ring-0 sm:h-10 sm:text-sm`;

  // ─── File upload UI ─────────────────────────────────────────────────────

  const FileUploadBox = ({
    type,
    state,
    inputRef,
    onChange,
    accept,
    label,
    hint,
    icon: Icon,
    maxSize,
    required = true,
  }: {
    type: "cv" | "photo" | "idCard";
    state: FileState;
    inputRef: React.RefObject<HTMLInputElement | null>;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    accept: string;
    label: string;
    hint: string;
    icon: typeof FileText;
    maxSize: number;
    required?: boolean;
  }) => {
    const isDragging = dragType === type;

    return (
      <div className="space-y-2" data-field={type}>
        {label && (
          <Label className="text-sm font-medium text-foreground">
            {label} {required && <span className="text-red-500">*</span>}
          </Label>
        )}
        <div
          onDrop={(e) =>
            handleDrop(e, type, type === "cv" ? setCv : type === "photo" ? setPhoto : setIdCard, maxSize)
          }
          onDragOver={(e) => handleDragOver(e, type)}
          onDragLeave={handleDragLeave}
          className={`relative min-h-[140px] rounded-xl border-2 border-dashed p-4 text-center transition-all duration-200 ease-out sm:p-6 ${
            isDragging
              ? `${TEAL.border} ${TEAL.bgSubtle} scale-[1.01]`
              : state.url
                ? "border-emerald-500/50 bg-emerald-500/5 dark:border-emerald-400/35 dark:bg-emerald-400/8"
                : state.error || errors[type]
                  ? "border-red-500/50 bg-red-500/5 dark:border-red-400/35 dark:bg-red-400/8"
                  : `border-muted-foreground/20 dark:border-muted-foreground/20 ${TEAL.uploadHover}`
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
              <Loader2 className={`h-8 w-8 animate-spin sm:h-10 sm:w-10 ${TEAL.spinner}`} />
              <p className="text-sm font-medium text-foreground/80">
                {state.retryCount > 0
                  ? `Retrying (${state.retryCount}/${CLIENT_MAX_RETRIES - 1})...`
                  : state.progress < 10
                    ? "Reading file..."
                    : state.progress >= 90
                      ? "Almost done..."
                      : "Uploading..."}
              </p>
              {state.file && (
                <p className="max-w-full truncate text-xs text-muted-foreground">
                  {state.file.name} ({formatFileSize(state.file.size)})
                </p>
              )}
              <div
                className="h-2 w-full max-w-[220px] overflow-hidden rounded-full bg-muted dark:bg-muted/60"
                role="progressbar"
                aria-valuenow={state.progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${label || type} upload progress`}
              >
                <div
                  className={`h-full rounded-full transition-all duration-400 ease-out ${TEAL.progressBar}`}
                  style={{ width: `${state.progress}%` }}
                />
              </div>
              <p className="text-xs tabular-nums text-muted-foreground">
                {state.progress}%
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => clearFile(type)}
                className="mt-1 h-8 text-xs text-muted-foreground hover:text-red-500 dark:hover:text-red-400"
              >
                Cancel
              </Button>
            </div>
          ) : state.url ? (
            <div className="flex flex-col items-center justify-center space-y-2 py-2 animate-in fade-in-0 zoom-in-95 duration-300">
              <CheckCircle2 className="h-8 w-8 text-emerald-500 dark:text-emerald-400 sm:h-10 sm:w-10" />
              <p className="max-w-full truncate text-sm font-medium text-emerald-600 dark:text-emerald-400">
                {state.file?.name || "Uploaded"}
              </p>
              {state.file && (
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(state.file.size)}
                </p>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => clearFile(type)}
                className="h-8 text-xs text-muted-foreground hover:text-red-500 dark:hover:text-red-400"
              >
                <X className="mr-1 h-3 w-3" />
                Remove
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center space-y-2 py-2 cursor-pointer group"
            >
              <div className={`rounded-full p-3 transition-colors duration-200 ${TEAL.bgIcon} group-hover:scale-105`}>
                <Icon className={`h-6 w-6 sm:h-7 sm:w-7 ${TEAL.text}`} />
              </div>
              <p className="text-sm font-medium text-foreground/90">
                {isDragging ? "Drop file here" : "Click or drag to upload"}
              </p>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </button>
          )}
        </div>

        {(state.error || errors[type]) && !state.uploading && (
          <div className="flex items-start gap-2 animate-in fade-in-0 slide-in-from-top-1 duration-200">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500 dark:text-red-400" />
            <div className="flex-1">
              <p className="text-sm text-red-500 dark:text-red-400">{state.error || errors[type]}</p>
              {state.file && state.error && !errors[type] && (
                <button
                  type="button"
                  onClick={() => retryUpload(type)}
                  className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${TEAL.text} underline-offset-2 hover:underline`}
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
  };

  // ─── Error helper ─────────────────────────────────────────────────────

  const FieldError = ({ field }: { field: string }) =>
    errors[field] ? (
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400 sm:text-sm animate-in fade-in-0 slide-in-from-top-1 duration-200">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        {errors[field]}
      </p>
    ) : null;

  // ─── Character counter for Student ID ────────────────────────────

  const studentIdCount = formData.studentId.length;

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-linear-to-b from-background to-muted/20 dark:from-background dark:to-background">
      {/* Offline banner */}
      {!isOnline && (
        <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-500/90 dark:bg-amber-600/90 px-4 py-2.5 text-sm font-medium text-amber-950 dark:text-amber-50 backdrop-blur-sm animate-in slide-in-from-top-full duration-300">
          <WifiOff className="h-4 w-4 shrink-0" />
          <p>You are offline. Some features may not work.</p>
        </div>
      )}

      <div className="container mx-auto max-w-[720px] px-3 py-6 sm:px-4 sm:py-10 md:px-6">
        {/* ─── Banner Image ─────────────────────────────────────────── */}
        <div className="mb-0 overflow-hidden rounded-t-xl shadow-lg">
          <Image
            src="/recruitment-banner.png"
            alt="Call for Executive Members: GUCC ExCom 2026-27"
            width={1568}
            height={400}
            className="block w-full h-auto"
            draggable={false}
            priority
            sizes="(max-width: 768px) 100vw, 720px"
          />
        </div>

        {/* ─── Title & Description Card ────────────────────────────── */}
        <Card className="rounded-none rounded-b-none border-t-0 shadow-sm">
          <div className={`border-t-4 ${TEAL.border}`} />
          <CardContent className="px-4 py-5 sm:px-6 sm:py-6">
            <h2 className="mb-4 text-xl font-bold leading-tight text-foreground sm:text-2xl lg:text-[26px]">
              Call for Executive Members: GUCC ExCom 2026-27
            </h2>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
              <p>
                The inception of the{" "}
                <strong className="text-foreground">Green University Computer Club (GUCC)</strong>{" "}
                dates back to October 19, 2013, marking the commencement of a
                dedicated journey towards upholding the honor and dignity of
                the{" "}
                <strong className="text-foreground">
                  Department of Computer Science and Engineering (CSE)
                </strong>{" "}
                at the{" "}
                <strong className="text-foreground">
                  Green University of Bangladesh (GUB)
                </strong>
                .
              </p>
              <p>
                The{" "}
                <strong className="text-foreground">
                  Green University Computer Club (GUCC)
                </strong>
                , with the kind approval of the respected{" "}
                <strong className="text-foreground">Chairperson</strong> of the{" "}
                <strong className="text-foreground">Department of CSE</strong>,{" "}
                <strong className="text-foreground">GUB</strong>, and the
                honorable{" "}
                <strong className="text-foreground">Moderator of GUCC</strong>,
                is excited to announce the{" "}
                <strong className="text-foreground">
                  Call for Applications
                </strong>{" "}
                for the formation of the upcoming &ldquo;
                <strong className="text-foreground">
                  GUCC Executive Committee 2026-27
                </strong>
                &rdquo;. This is a fantastic opportunity for passionate and
                dedicated individuals to take on leadership roles and contribute
                to the growth and success of the flagship club of GUB.
              </p>

              <div>
                <strong className="text-foreground">
                  Eligibility Criteria &amp; Additional Requirements:
                </strong>
                <br />
                Kindly read the{" "}
                <strong className="text-foreground">Main Circular</strong>{" "}
                and the{" "}
                <strong className="text-foreground">Eligibility &amp; Position Requirements</strong>{" "}
                provided below thoroughly before proceeding with your
                application.
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <a
                  href="https://drive.google.com/file/d/1VJZBZSLUVl7FFsYLDYZuW1aCPaLAWN2h/view?usp=sharing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors ${TEAL.link} ${TEAL.deadlineBg}`}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Main Circular
                </a>
                <Link
                  href="/recruitment/rules"
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors ${TEAL.link} ${TEAL.deadlineBg}`}
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  Eligibility &amp; Position Requirements
                </Link>
              </div>

              <p className="italic text-muted-foreground">
                <strong className="text-foreground/90 dark:text-foreground/85">
                  The selection committee reserves all the rights to consider any
                  applicant ineligible for any other factors. All the information
                  collected through this form will be kept confidential and no
                  information will be shared to any third party without your
                  consent.
                </strong>
              </p>

              <div className={`flex items-center gap-2.5 rounded-lg border p-3.5 ${TEAL.deadlineBg}`}>
                <Clock className={`h-4 w-4 shrink-0 ${TEAL.deadlineIcon}`} />
                <p className="text-sm font-semibold text-foreground">
                  Application Deadline: {APPLICATION_DEADLINE}
                </p>
              </div>

              <div className="space-y-1.5 text-sm">
                <p>
                  <strong className="text-foreground">For any query inbox us: </strong>
                  <a
                    href="https://www.facebook.com/GreenUniversityComputerClub"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`font-semibold underline underline-offset-2 ${TEAL.link}`}
                  >
                    Green University Computer Club: GUCC (FB Page)
                  </a>
                </p>
                <p className="flex flex-wrap items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  <strong className="text-foreground">You can also mail us at: </strong>
                  <a
                    href="mailto:gucc@green.edu.bd"
                    className={`font-semibold underline underline-offset-2 ${TEAL.link}`}
                  >
                    gucc@green.edu.bd
                  </a>
                </p>
                <p>
                  <strong className="text-foreground">To remain updated join: </strong>
                  <a
                    href="https://m.facebook.com/groups/greenuniversitycomputerclub2021/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`font-semibold underline underline-offset-2 ${TEAL.link}`}
                  >
                    Green University Computer Club: GUCC (FB Group)
                  </a>
                </p>
              </div>
            </div>

            <div className="mt-5 border-t border-border/60 dark:border-border/50 pt-4">
              <p className="text-xs text-muted-foreground">
                <span className="text-red-500 dark:text-red-400">*</span> Indicates required
                question
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ─── Form ─────────────────────────────────────────────────── */}
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="space-y-4 sm:space-y-5"
          noValidate
        >
          {/* ── Section 1: Full Name ─────────────────────────────── */}
          <AnimatedCard index={0} hasError={!!errors.fullName}>
            <CardContent className="px-4 py-5 sm:px-6 sm:py-6">
              <div className="space-y-1.5" id="fullName">
                <Label htmlFor="fullName-input" className="text-sm font-medium text-foreground">
                  Full Name <span className="text-red-500 dark:text-red-400">*</span>
                </Label>
                <Input
                  id="fullName-input"
                  placeholder="Your answer"
                  value={formData.fullName}
                  onChange={(e) => handleInputChange("fullName", e.target.value)}
                  onBlur={() => handleBlur("fullName")}
                  aria-invalid={!!errors.fullName}
                  autoComplete="name"
                  className={inputClass}
                />
                <FieldError field="fullName" />
              </div>
            </CardContent>
          </AnimatedCard>

          {/* ── Section 2: Student ID ────────────────────────────── */}
          <AnimatedCard index={1} hasError={!!errors.studentId}>
            <CardContent className="px-4 py-5 sm:px-6 sm:py-6">
              <div className="space-y-1.5" id="studentId">
                <Label htmlFor="studentId-input" className="text-sm font-medium text-foreground">
                  Student ID <span className="text-red-500 dark:text-red-400">*</span>
                </Label>
                <Input
                  id="studentId-input"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={9}
                  placeholder="e.g., 232002184"
                  value={formData.studentId}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 9);
                    handleInputChange("studentId", val);
                  }}
                  onBlur={() => handleBlur("studentId")}
                  aria-invalid={!!errors.studentId}
                  className={inputClass}
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Must be exactly 9 digits
                  </p>
                  <p className={`text-xs tabular-nums transition-colors ${
                    studentIdCount === 9
                      ? "text-emerald-500 dark:text-emerald-400"
                      : studentIdCount > 0
                        ? "text-muted-foreground"
                        : "text-transparent"
                  }`}>
                    {studentIdCount}/9
                  </p>
                </div>
                <FieldError field="studentId" />
              </div>
            </CardContent>
          </AnimatedCard>

          {/* ── Section 3: Email ──────────────────────────────────── */}
          <AnimatedCard index={2} hasError={!!errors.email}>
            <CardContent className="px-4 py-5 sm:px-6 sm:py-6">
              <div className="space-y-1.5" id="email">
                <Label htmlFor="email-input" className="text-sm font-medium text-foreground">
                  Email <span className="text-red-500 dark:text-red-400">*</span>
                </Label>
                <Input
                  id="email-input"
                  type="email"
                  inputMode="email"
                  placeholder="your.email@example.com"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  onBlur={() => handleBlur("email")}
                  aria-invalid={!!errors.email}
                  autoComplete="email"
                  className={inputClass}
                />
                <FieldError field="email" />
              </div>
            </CardContent>
          </AnimatedCard>

          {/* ── Section 4: Mobile Number ─────────────────────────── */}
          <AnimatedCard index={3} hasError={!!errors.mobile}>
            <CardContent className="px-4 py-5 sm:px-6 sm:py-6">
              <div className="space-y-1.5" id="mobile">
                <Label htmlFor="mobile-input" className="text-sm font-medium text-foreground">
                  Mobile Number <span className="text-red-500 dark:text-red-400">*</span>
                </Label>
                <Input
                  id="mobile-input"
                  type="tel"
                  inputMode="tel"
                  placeholder="01XXXXXXXXX"
                  value={formData.mobile}
                  onChange={(e) => handleInputChange("mobile", e.target.value)}
                  onBlur={() => handleBlur("mobile")}
                  aria-invalid={!!errors.mobile}
                  autoComplete="tel"
                  className={inputClass}
                />
                <FieldError field="mobile" />
              </div>
            </CardContent>
          </AnimatedCard>

          {/* ── Section 5: Gender ─────────────────────────────────── */}
          <AnimatedCard index={4} hasError={!!errors.gender}>
            <CardContent className="px-4 py-5 sm:px-6 sm:py-6">
              <div className="space-y-3" id="gender" data-field="gender">
                <Label className="text-sm font-medium text-foreground">
                  Gender <span className="text-red-500 dark:text-red-400">*</span>
                </Label>
                <div className="space-y-2.5">
                  {["Male", "Female"].map((option) => (
                    <label
                      key={option}
                      className="flex cursor-pointer items-center gap-3 group rounded-lg px-2 py-1.5 -mx-2 transition-colors hover:bg-muted/50"
                    >
                      <div className="relative flex h-5 w-5 items-center justify-center">
                        <input
                          type="radio"
                          name="gender"
                          value={option}
                          checked={formData.gender === option}
                          onChange={(e) =>
                            handleInputChange("gender", e.target.value)
                          }
                          className="peer sr-only"
                        />
                        <div className={`h-5 w-5 rounded-full border-2 border-muted-foreground/30 dark:border-muted-foreground/25 transition-all duration-200 ${TEAL.radio} peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background`} />
                        <div className={`absolute h-2.5 w-2.5 scale-0 rounded-full transition-transform duration-200 peer-checked:scale-100 ${TEAL.radioDot}`} />
                      </div>
                      <span className="text-sm text-foreground select-none">{option}</span>
                    </label>
                  ))}
                </div>
                <FieldError field="gender" />
              </div>
            </CardContent>
          </AnimatedCard>

          {/* ── Section 6: Current Semester ────────────────────────── */}
          <AnimatedCard index={5} hasError={!!errors.semester}>
            <CardContent className="px-4 py-5 sm:px-6 sm:py-6">
              <div className="space-y-1.5" id="semester" data-field="semester">
                <Label className="text-sm font-medium text-foreground">
                  Current Semester (Spring-2026) <span className="text-red-500 dark:text-red-400">*</span>
                </Label>
                <Select
                  value={formData.semester}
                  onValueChange={(val) => handleInputChange("semester", val)}
                >
                  <SelectTrigger
                    aria-invalid={!!errors.semester}
                    className={selectTriggerClass}
                  >
                    <SelectValue placeholder="Choose" />
                  </SelectTrigger>
                  <SelectContent>
                    {SEMESTERS.map((sem) => (
                      <SelectItem
                        key={sem}
                        value={sem}
                        className="text-base sm:text-sm"
                      >
                        {sem}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError field="semester" />
              </div>
            </CardContent>
          </AnimatedCard>

          {/* ── Section 7: Batch ──────────────────────────────────── */}
          <AnimatedCard index={6} hasError={!!errors.batch}>
            <CardContent className="px-4 py-5 sm:px-6 sm:py-6">
              <div className="space-y-1.5" id="batch">
                <Label htmlFor="batch-input" className="text-sm font-medium text-foreground">
                  Batch <span className="text-red-500 dark:text-red-400">*</span>
                </Label>
                <Input
                  id="batch-input"
                  placeholder="Your answer"
                  value={formData.batch}
                  onChange={(e) => handleInputChange("batch", e.target.value)}
                  onBlur={() => handleBlur("batch")}
                  aria-invalid={!!errors.batch}
                  className={inputClass}
                />
                <FieldError field="batch" />
              </div>
            </CardContent>
          </AnimatedCard>

          {/* ── Section 8: CGPA ───────────────────────────────────── */}
          <AnimatedCard index={7} hasError={!!errors.cgpa}>
            <CardContent className="px-4 py-5 sm:px-6 sm:py-6">
              <div className="space-y-1.5" id="cgpa">
                <Label htmlFor="cgpa-input" className="text-sm font-medium text-foreground">
                  Current CGPA (Till Fall-2025 Semester){" "}
                  <span className="text-red-500 dark:text-red-400">*</span>
                </Label>
                <Input
                  id="cgpa-input"
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g., 3.75"
                  value={formData.cgpa}
                  onChange={(e) => handleInputChange("cgpa", sanitizeCgpaInput(e.target.value))}
                  onBlur={() => handleBlur("cgpa")}
                  aria-invalid={!!errors.cgpa}
                  autoComplete="off"
                  className={inputClass}
                />
                <FieldError field="cgpa" />
              </div>
            </CardContent>
          </AnimatedCard>

          {/* ── Section 9: Completed Credits ──────────────────────── */}
          <AnimatedCard index={8} hasError={!!errors.completedCredits}>
            <CardContent className="px-4 py-5 sm:px-6 sm:py-6">
              <div className="space-y-1.5" id="completedCredits">
                <Label
                  htmlFor="completedCredits-input"
                  className="text-sm font-medium text-foreground"
                >
                  Completed Credits (Till Fall-2025 Semester){" "}
                  <span className="text-red-500 dark:text-red-400">*</span>
                </Label>
                <Input
                  id="completedCredits-input"
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g., 90"
                  value={formData.completedCredits}
                  onChange={(e) =>
                    handleInputChange("completedCredits", sanitizeCreditsInput(e.target.value))
                  }
                  onBlur={() => handleBlur("completedCredits")}
                  aria-invalid={!!errors.completedCredits}
                  autoComplete="off"
                  className={inputClass}
                />
                <FieldError field="completedCredits" />
              </div>
            </CardContent>
          </AnimatedCard>

          {/* ── Section 10: Preferred Position ─────────────────────── */}
          <AnimatedCard index={9} hasError={!!errors.preferredPosition}>
            <CardContent className="px-4 py-5 sm:px-6 sm:py-6">
              <div
                className="space-y-1.5"
                id="preferredPosition"
                data-field="preferredPosition"
              >
                <Label className="text-sm font-medium text-foreground">
                  Your Preferred Position (Only One){" "}
                  <span className="text-red-500 dark:text-red-400">*</span>
                </Label>
                <Select
                  value={formData.preferredPosition}
                  onValueChange={(val) =>
                    handleInputChange("preferredPosition", val)
                  }
                >
                  <SelectTrigger
                    aria-invalid={!!errors.preferredPosition}
                    className={selectTriggerClass}
                  >
                    <SelectValue placeholder="Choose" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {POSITIONS.map((pos) => (
                      <SelectItem
                        key={pos}
                        value={pos}
                        className="text-base sm:text-sm"
                      >
                        {pos}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError field="preferredPosition" />
              </div>
            </CardContent>
          </AnimatedCard>

          {/* ── Section 11: Club / Organization Work (Optional) ────── */}
          <AnimatedCard index={10}>
            <CardContent className="px-4 py-5 sm:px-6 sm:py-6">
              <div className="space-y-1.5" id="clubWork">
                <Label htmlFor="clubWork-input" className="text-sm font-medium text-foreground">
                  <strong>
                    Are you currently working in any club/branch/society/chapter/mentorship
                    program/wing at GUB?
                  </strong>
                </Label>
                <p className="text-xs italic text-muted-foreground sm:text-sm">
                  [If yes, please write your designation and organization name
                  (Example: Sports Secretary, XYZ Club). If no, please skip.]
                </p>
                <Textarea
                  id="clubWork-input"
                  placeholder="Your answer"
                  value={formData.clubWork}
                  onChange={(e) =>
                    handleInputChange("clubWork", e.target.value)
                  }
                  rows={3}
                  className={`min-h-20 rounded-none border-0 border-b-2 border-muted-foreground/30 dark:border-muted-foreground/20 bg-transparent px-0 text-base shadow-none transition-colors duration-200 resize-none ${TEAL.focusBorder} focus-visible:ring-0 sm:text-sm`}
                />
              </div>
            </CardContent>
          </AnimatedCard>

          {/* ── Section 12: CV Upload ─────────────────────────────── */}
          <AnimatedCard index={11} hasError={!!errors.cv}>
            <CardContent className="px-4 py-5 sm:px-6 sm:py-6">
              <FileUploadBox
                type="cv"
                state={cv}
                inputRef={cvInputRef}
                onChange={handleCvChange}
                accept=".pdf,application/pdf"
                label="Upload your latest CV (Must be PDF)"
                hint="PDF only · Max 50 MB"
                icon={FileText}
                maxSize={MAX_CV_SIZE}
              />
            </CardContent>
          </AnimatedCard>

          {/* ── Section 13: Photo Upload ──────────────────────────── */}
          <AnimatedCard index={12} hasError={!!errors.photo}>
            <CardContent className="px-4 py-5 sm:px-6 sm:py-6">
              <FileUploadBox
                type="photo"
                state={photo}
                inputRef={photoInputRef}
                onChange={handlePhotoChange}
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                label="Upload your latest formal photo (Passport Size)"
                hint="JPG, PNG, or WebP · Max 50 MB"
                icon={ImageIcon}
                maxSize={MAX_PHOTO_SIZE}
              />
            </CardContent>
          </AnimatedCard>

          {/* ── Section 14: ID Card Upload ─────────────────────────── */}
          <AnimatedCard index={13} hasError={!!errors.idCard}>
            <CardContent className="px-4 py-5 sm:px-6 sm:py-6">
              <div className="space-y-1.5 mb-2">
                <Label className="text-sm font-medium text-foreground">
                  <strong>Upload the front side image of your GUB student ID Card</strong>{" "}
                  <span className="text-red-500 dark:text-red-400">*</span>
                </Label>
                <p className="text-xs italic text-muted-foreground sm:text-sm">
                  (If you currently do not have your student ID card, please
                  upload the screenshot of the Profile Section of your Student
                  Portal. Make sure the full section is visible in the
                  screenshot)
                </p>
              </div>
              <FileUploadBox
                type="idCard"
                state={idCard}
                inputRef={idCardInputRef}
                onChange={handleIdCardChange}
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                label=""
                hint="JPG, PNG, or WebP · Max 50 MB"
                icon={CreditCard}
                maxSize={MAX_ID_SIZE}
              />
            </CardContent>
          </AnimatedCard>

          {/* ─── Submit Error ───────────────────────────────────────── */}
          {submitError && (
            <div className="flex items-start gap-2.5 rounded-lg border border-red-500/30 dark:border-red-400/25 bg-red-500/5 dark:bg-red-400/8 p-4 animate-in fade-in-0 slide-in-from-top-2 duration-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500 dark:text-red-400" />
              <p className="text-sm text-red-500 dark:text-red-400">{submitError}</p>
            </div>
          )}

          {/* ─── Submit & Clear Buttons ─────────────────────────────── */}
          <div className="flex flex-col-reverse gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="submit"
              className={`h-11 px-8 text-base font-medium text-white shadow-sm transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:h-10 sm:text-sm active:scale-[0.98] ${TEAL.btnBg}`}
              disabled={
                submitting ||
                cv.uploading ||
                photo.uploading ||
                idCard.uploading ||
                !isOnline
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
                  Submit
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={handleClearForm}
              disabled={submitting}
              className={`h-10 text-sm font-medium ${TEAL.clearBtn}`}
            >
              Clear form
            </Button>
          </div>

          {/* Connection indicator */}
          {isOnline && (
            <p className="flex items-center justify-center gap-1.5 pb-4 text-[11px] text-muted-foreground/50">
              <Wifi className="h-3 w-3" />
              Connected
            </p>
          )}
        </form>

        {/* ─── Footer note ────────────────────────────────────────── */}
        <div className="mt-2 pb-8 text-center">
          <p className="text-xs text-muted-foreground/50">
            Never submit passwords through this form.
          </p>
        </div>
      </div>

      {/* ─── Success Dialog ────────────────────────────────────────── */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent className="mx-4 max-w-sm sm:mx-auto sm:max-w-lg">
          <DialogHeader className="text-center sm:text-left">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 dark:bg-emerald-400/15 sm:mx-0">
              <CheckCircle2 className="h-8 w-8 text-emerald-500 dark:text-emerald-400" />
            </div>
            <DialogTitle className="text-xl font-bold text-foreground">
              Thank you for applying to GUCC! 🎉
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-2 text-sm leading-relaxed text-muted-foreground">
                <p>
                  Your application to join the{" "}
                  <strong className="text-foreground">Green University Computer Club (GUCC)</strong>{" "}
                  has been successfully submitted. We&apos;ve received all your details.
                </p>

                <div className="space-y-2">
                  <p className="font-medium text-foreground">In the meantime:</p>
                  <ul className="list-inside space-y-1.5 text-[13px] sm:text-sm">
                    <li className="flex items-start gap-2">
                      <span className="mt-1 block h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                      <span>
                        Follow us on our{" "}
                        <a
                          href="https://gucc.green.edu.bd/socials"
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`font-semibold underline underline-offset-2 transition-colors ${TEAL.link}`}
                        >
                          Social Media
                        </a>{" "}
                        for updates, events, and tech tips.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 block h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                      <span>
                        Check your email (including spam folder) for future updates on your application.
                      </span>
                    </li>
                  </ul>
                </div>

                <p>
                  We&apos;re excited about the possibility of welcoming you to our community of
                  coders, innovators, and tech enthusiasts. Let&apos;s build something awesome
                  together!
                </p>

                <p className="text-xs text-muted-foreground/70">
                  Questions? Email us at{" "}
                  <a
                    href="mailto:gucc@green.edu.bd"
                    className={`font-semibold underline underline-offset-2 transition-colors ${TEAL.link}`}
                  >
                    gucc@green.edu.bd
                  </a>
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2.5 pt-3 sm:flex-row sm:justify-end sm:gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowSuccess(false);
                handleClearForm();
              }}
              className="h-10"
            >
              Submit Another
            </Button>
            <Button
              onClick={() => (window.location.href = "/")}
              className={`h-10 text-white ${TEAL.btnBg}`}
            >
              Back to Home
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
