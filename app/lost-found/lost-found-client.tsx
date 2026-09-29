"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { uploadImage } from "@/lib/media/client";
import { useSession } from "@/lib/api/use-session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { lostFoundContactMethods } from "@/lib/lost-found/config";
import type {
  ContactMethod,
  LostFoundMessage,
  LostFoundPost,
  LostFoundStatus,
  LostFoundType,
} from "@/lib/lost-found/types";
import { CalendarDays, Filter, Inbox, MapPin, Search, ShieldCheck } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";



const statusLabels: Record<LostFoundStatus, string> = {
  pending: "Pending",
  active: "Active",
  resolved: "Resolved",
  rejected: "Rejected",
};

const statusStyles: Record<LostFoundStatus, string> = {
  pending: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  active: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  resolved: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  rejected: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

const typeStyles: Record<LostFoundType, string> = {
  lost: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  found: "bg-sky-500/15 text-sky-400 border-sky-500/30",
};

const typeLabels: Record<LostFoundType, string> = {
  lost: "Lost",
  found: "Found",
};

const initialFilters = {
  status: "active" as LostFoundStatus | "all",
  type: "all" as LostFoundType | "all",
  category: "all",
  location: "",
  q: "",
  dateFrom: "",
  dateTo: "",
};

export interface LostFoundViewer {
  userId: string;
  email: string;
  isModerator: boolean;
  /** Posting and messaging need an approved membership. */
  active: boolean;
}

export function LostFoundClient({ config }: { config: { categories: string[]; locations: string[] } }) {
  // Who is looking comes from the shared browser session, so the page itself can be cached.
  const session = useSession();
  const viewer = useMemo<LostFoundViewer | null>(() => (session?.signedIn && session.id && session.email
    ? { userId: session.id, email: session.email, isModerator: Boolean(session.caps?.["lostfound.moderate"]), active: session.status === "ACTIVE" }
    : null), [session]);
  const lostFoundCategories = config.categories;
  const lostFoundLocations = config.locations;
  const userEmail = viewer?.email ?? null;
  const userId = viewer?.userId ?? null;
  // The board's tab, also opened by the buttons at the top and by #browse / #report / #inbox links.
  const [tab, setTab] = useState("browse");
  const [confirm, confirmDialog, ask] = useConfirm();
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.slice(1);
      if (["browse", "report", "inbox", "mine"].includes(h)) setTab(h);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);
  const openTab = (t: string) => {
    setTab(t);
    document.getElementById("board")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const [posts, setPosts] = useState<LostFoundPost[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [filters, setFilters] = useState(initialFilters);
  // What's typed in the text filters; applied after a short pause, not on every key.
  const [typed, setTyped] = useState({ q: "", location: "" });
  useEffect(() => {
    const t = setTimeout(() => setFilters((prev) => (prev.q === typed.q && prev.location === typed.location ? prev : { ...prev, ...typed })), 350);
    return () => clearTimeout(t);
  }, [typed]);
  const resetFilters = () => {
    setTyped({ q: "", location: "" });
    setFilters(initialFilters);
  };
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [inboxMessages, setInboxMessages] = useState<LostFoundMessage[]>([]);
  const [isLoadingInbox, setIsLoadingInbox] = useState(false);
  const [myPosts, setMyPosts] = useState<LostFoundPost[] | null>(null);
  // A post sent back for changes is fixed by posting it again: the old one goes once the new one is in.
  const [replacing, setReplacing] = useState<string | null>(null);

  const [formValues, setFormValues] = useState({
    type: "lost" as LostFoundType,
    title: "",
    category: "",
    description: "",
    location: "",
    occurred_at: "",
    contact_method: "in_app" as ContactMethod,
    contact_value: "",
  });

  // Moderation rights come from the lostfound.moderate permission, decided on the server.
  const isAdmin = useMemo(() => Boolean(viewer?.isModerator), [viewer]);

  const loadPosts = async () => {
    setIsLoadingPosts(true);
    try {
      const params = new URLSearchParams();
      if (filters.status && filters.status !== "all") params.set("status", filters.status);
      if (filters.type && filters.type !== "all") params.set("type", filters.type);
      if (filters.category && filters.category !== "all") params.set("category", filters.category);
      if (filters.location) params.set("location", filters.location);
      if (filters.q) params.set("q", filters.q);
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.set("dateTo", filters.dateTo);

      // Signed-in lists can show more (contact details, your own posts): they're never shared-cached.
      if (userId) params.set("m", "1");
      const res = await fetch(`/api/lost-found?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setPosts(data);
      }
    } finally {
      setIsLoadingPosts(false);
    }
  };

  const loadInbox = async () => {
    if (!userEmail) return;
    setIsLoadingInbox(true);
    try {
      const res = await fetch("/api/lost-found/inbox", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setInboxMessages(data);
      }
    } finally {
      setIsLoadingInbox(false);
    }
  };

  useEffect(() => {
    // Wait for the session check, so a signed-in member loads their view once.
    if (session === undefined) return;
    loadPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on filter or viewer changes only
  }, [filters, userId, session === undefined]);

  const loadMine = async () => {
    if (!userId) return;
    const res = await fetch("/api/lost-found?mine=1", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setMyPosts(await res.json());
  };
  useEffect(() => {
    if (tab === "mine" && userId) loadMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load when the tab opens
  }, [tab, userId]);

  const fixAndRepost = (post: LostFoundPost) => {
    setFormValues({
      type: post.type, title: post.title, category: post.category, description: post.description, location: post.location,
      occurred_at: (post.occurred_at ?? "").slice(0, 10), contact_method: post.contact_method, contact_value: post.contact_value ?? "",
    });
    setReplacing(post.id);
    setFormSuccess(null);
    setFormError(null);
    openTab("report");
  };

  useEffect(() => {
    if (userEmail) {
      loadInbox();
    } else {
      setInboxMessages([]);
    }
  }, [userEmail]);

  const resetForm = () => {
    setFormValues({
      type: "lost",
      title: "",
      category: "",
      description: "",
      location: "",
      occurred_at: "",
      contact_method: "in_app",
      contact_value: "",
    });
    setImageFile(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!formValues.category) {
      setFormError("Please choose a category.");
      return;
    }

    if (!userEmail) {
      setFormError("You must be logged in to post.");
      return;
    }

    setIsSubmitting(true);

    try {
      let imageMediaId: string | null = null;

      if (imageFile) {
        const uploaded = await uploadImage(imageFile, { purpose: "lostfound" });
        if (!uploaded.ok) {
          setFormError(uploaded.error || "Image upload failed. Please try again.");
          setIsSubmitting(false);
          return;
        }
        imageMediaId = uploaded.id;
      }

      const res = await fetch("/api/lost-found", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formValues,
          imageMediaId,
          contact_value: formValues.contact_method === "in_app" ? null : formValues.contact_value,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || "Failed to create post.");
        return;
      }

      if (replacing) {
        await fetch(`/api/lost-found/${replacing}`, { method: "DELETE" }).catch(() => null);
        setReplacing(null);
      }
      setFormSuccess("Post submitted. It will appear after a moderator approves it. You can follow it under My posts.");
      resetForm();
      loadPosts();
      setMyPosts(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolve = async (postId: string) => {
    await fetch(`/api/lost-found/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });
    loadPosts();
  };

  const handleAdminUpdate = async (postId: string, status: LostFoundStatus) => {
    let reason: string | null = null;
    if (status === "rejected") {
      reason = await ask({ title: "Ask the author to fix this post?", input: { label: "What needs fixing? (the author sees this)", minLength: 3 }, confirmLabel: "Send back" });
      if (!reason) return;
    }
    await fetch("/api/lost-found/admin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: postId, status, reason }),
    });
    loadPosts();
  };

  const handleRemoveImage = async (postId: string) => {
    if (!(await confirm({ title: "Remove this photo?", description: "The author is told why.", confirmLabel: "Remove photo", destructive: true }))) return;
    await fetch("/api/lost-found/admin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: postId, removeImage: true }),
    });
    loadPosts();
  };

  const handleReport = async (postId: string) => {
    const reason = await ask({ title: "Report this post", description: "Moderators will review it.", input: { label: "What's wrong with it?", minLength: 3 }, confirmLabel: "Send report", destructive: true });
    if (!reason) return;
    const res = await fetch(`/api/lost-found/${postId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report: reason }),
    });
    setNotice(res.ok ? "Thanks, the moderators will take a look." : "Couldn't send the report. Try again.");
  };

  const handleMessageSend = async (postId: string, message: string): Promise<{ ok: boolean; conversationId?: string; error?: string }> => {
    const res = await fetch("/api/lost-found/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId, message }),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, conversationId: data.conversationId ?? data.id } : { ok: false, error: data.error };
  };

  const heroStats = [
    { label: "Verified posts", value: posts.filter((post) => post.status === "active").length },
    { label: "Resolved", value: posts.filter((post) => post.status === "resolved").length },
    { label: "Pending review", value: posts.filter((post) => post.status === "pending").length },
  ];

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-950 via-slate-950 to-slate-950 text-foreground">
      {confirmDialog}
      {notice && <p role="status" className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-lg border bg-background p-3 text-center text-sm shadow-lg" onClick={() => setNotice(null)}>{notice}</p>}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-60 bg-[linear-gradient(120deg,rgba(16,185,129,0.2),rgba(14,116,144,0.15),rgba(15,23,42,0.8))]" />
        <div className="container relative z-10 py-16 md:py-24">
          <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] items-center">
            <div className="space-y-6">
              <Badge className="border border-emerald-400/40 bg-emerald-500/10 text-emerald-200">
                Lost & Found Hub
              </Badge>
              <h1 className="text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
                Keep campus items traceable, not spammy.
              </h1>
              <p className="text-base text-slate-200/80 md:text-lg">
                Report lost or found items with verified student accounts. Every post is reviewed
                before going live, and messaging happens securely inside the platform.
              </p>
              <div className="flex flex-wrap gap-3">
                {!userEmail ? (
                  <Button asChild className="bg-emerald-500 text-slate-950 hover:bg-emerald-400">
                    <Link href="/auth/login?next=%2Flost-found%23report">Sign in to post</Link>
                  </Button>
                ) : (
                  <Button type="button" className="bg-emerald-500 text-slate-950 hover:bg-emerald-400" onClick={() => openTab("report")}>
                    Create a report
                  </Button>
                )}
                <Button type="button" variant="outline" className="border-emerald-400/40 bg-transparent text-emerald-100 hover:bg-emerald-500/10 hover:text-emerald-50" onClick={() => openTab("browse")}>
                  Browse active posts
                </Button>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-slate-200/70">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-300" />
                  University email required
                </div>
                <div className="flex items-center gap-2">
                  <Inbox className="h-4 w-4 text-emerald-300" />
                  In-app messaging only
                </div>
              </div>
            </div>
            <Card className="border-emerald-500/30 bg-slate-950/60 text-slate-100 shadow-xl">
              <CardHeader>
                <CardTitle className="text-lg">Live pulse</CardTitle>
                <CardDescription className="text-slate-300">
                  Track momentum across active and resolved items.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {heroStats.map((stat) => (
                  <div
                    key={stat.label}
                    className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-slate-950/70 px-4 py-3"
                  >
                    <span className="text-sm text-slate-300">{stat.label}</span>
                    <span className="text-2xl font-semibold text-emerald-200">{stat.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section id="board" className="container -mt-8 scroll-mt-20 pb-16">
        <Card className="border border-slate-800 bg-slate-950/80 shadow-2xl">
          <CardHeader>
            <CardTitle className="text-2xl">Lost & Found Board</CardTitle>
            <CardDescription className="text-slate-400">
              Structured reports with filters, moderation, and private messaging.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <TabsList className={`grid h-auto w-full bg-slate-900/60 ${isAdmin ? "grid-cols-3 md:grid-cols-5" : "grid-cols-2 sm:grid-cols-4"}`}>
                <TabsTrigger value="browse" className="min-h-10">Browse</TabsTrigger>
                <TabsTrigger value="report" className="min-h-10">Report</TabsTrigger>
                <TabsTrigger value="mine" className="min-h-10">My posts</TabsTrigger>
                <TabsTrigger value="inbox" className="min-h-10">Inbox</TabsTrigger>
                {isAdmin && <TabsTrigger value="admin">Admin</TabsTrigger>}
              </TabsList>

              <TabsContent value="browse" className="space-y-6 pt-6">
                <Card className="border border-slate-800 bg-slate-950/60">
                  <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <CardTitle className="text-lg">Search and filter</CardTitle>
                      <CardDescription className="text-slate-400">
                        Active posts show by default. Narrow results by category, date, or location.
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      className="border-slate-700 text-slate-200"
                      onClick={resetFilters}
                    >
                      Reset filters
                    </Button>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="search">Keyword</Label>
                      <div className="relative">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <Input
                          id="search"
                          type="search"
                          value={typed.q}
                          onChange={(e) => setTyped((prev) => ({ ...prev, q: e.target.value }))}
                          placeholder="Wallet, phone, ID"
                          className="pl-9"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select
                        value={filters.type}
                        onValueChange={(value) =>
                          setFilters((prev) => ({ ...prev, type: value as LostFoundType | "all" }))
                        }
                      >
                        <SelectTrigger aria-label="Type">
                          <SelectValue placeholder="All" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="lost">Lost</SelectItem>
                          <SelectItem value="found">Found</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select
                        value={filters.status}
                        onValueChange={(value) =>
                          setFilters((prev) => ({ ...prev, status: value as LostFoundStatus | "all" }))
                        }
                      >
                        <SelectTrigger aria-label="Status">
                          <SelectValue placeholder="Active" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                          <SelectItem value="rejected">Rejected</SelectItem>
                          <SelectItem value="all">All</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select
                        value={filters.category}
                        onValueChange={(value) => setFilters((prev) => ({ ...prev, category: value }))}
                      >
                        <SelectTrigger aria-label="Category">
                          <SelectValue placeholder="All categories" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          {lostFoundCategories.map((category) => (
                            <SelectItem key={category} value={category}>
                              {category}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="location">Location</Label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <Input
                          id="location"
                          value={typed.location}
                          onChange={(e) => setTyped((prev) => ({ ...prev, location: e.target.value }))}
                          placeholder="CSE Building, Library"
                          className="pl-9"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Date range</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <Input
                          type="date"
                          aria-label="From date"
                          value={filters.dateFrom}
                          onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
                        />
                        <Input
                          type="date"
                          aria-label="To date"
                          value={filters.dateTo}
                          onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <Filter className="h-4 w-4" />
                    <span role="status">{isLoadingPosts ? "Loading posts…" : `${posts.length} ${posts.length === 1 ? "post" : "posts"}`}</span>
                  </div>
                  <Button
                    variant="outline"
                    className="border-emerald-500/40 text-emerald-100"
                    onClick={loadPosts}
                  >
                    Refresh
                  </Button>
                </div>

                {!isLoadingPosts && posts.length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-8 text-center text-sm text-slate-300">
                    <p>No posts match these filters.</p>
                    <div className="mt-3 flex flex-wrap justify-center gap-2">
                      <Button type="button" variant="outline" className="border-slate-700 text-slate-200" onClick={resetFilters}>Reset filters</Button>
                      <Button type="button" className="bg-emerald-500 text-slate-950 hover:bg-emerald-400" onClick={() => openTab("report")}>Report an item</Button>
                    </div>
                  </div>
                )}
                <div className="grid gap-6 lg:grid-cols-2">
                  {posts.map((post) => (
                    <Card key={post.id} className="border border-slate-800 bg-slate-950/60">
                      <CardHeader className="space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <CardTitle className="text-xl">{post.title}</CardTitle>
                            <CardDescription className="text-slate-400">
                              {post.category} · {post.location}
                            </CardDescription>
                          </div>
                          <div className="flex flex-col gap-2">
                            <Badge className={`border ${statusStyles[post.status]}`}>
                              {statusLabels[post.status]}
                            </Badge>
                            <Badge className={`border ${typeStyles[post.type]}`}>
                              {typeLabels[post.type]}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <CalendarDays className="h-4 w-4" />
                          {new Date(post.occurred_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" })}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-sm text-slate-200/80">{post.description}</p>
                        {post.image_url && (
                          <div className="overflow-hidden rounded-lg border border-slate-800">
                            <img
                              src={post.image_url}
                              alt={post.title}
                              className="h-48 w-full object-cover"
                            />
                          </div>
                        )}
                        <Separator className="bg-slate-800" />
                        <div className="flex flex-wrap items-center gap-3">
                          {post.contact_method === "in_app" ? (
                            post.is_owner ? null : (
                              <MessageDialog
                                postId={post.id}
                                onSend={handleMessageSend}
                                disabled={!viewer?.active}
                              />
                            )
                          ) : (
                            <Button
                              variant="outline"
                              className="border-emerald-500/40 text-emerald-100"
                              disabled={!userEmail}
                            >
                              {viewer?.active ? post.contact_value : userEmail ? "Visible to approved members" : "Log in to view contact"}
                            </Button>
                          )}
                          {userId && post.is_owner && post.status === "active" && (
                            <Button
                              variant="outline"
                              className="border-slate-700 text-slate-200"
                              onClick={() => handleResolve(post.id)}
                            >
                              Mark resolved
                            </Button>
                          )}
                          {userId && !post.is_owner && (
                            <button type="button" onClick={() => handleReport(post.id)} className="ml-auto text-xs text-slate-400 underline hover:text-slate-200">
                              Report
                            </button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="report" className="pt-6">
                <Card className="border border-slate-800 bg-slate-950/60">
                  <CardHeader>
                    <CardTitle className="text-lg">Create a report</CardTitle>
                    <CardDescription className="text-slate-400">
                      Only verified university emails can post. Every submission is reviewed.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {replacing && (
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-sm text-sky-100" role="status">
                        <span>Fix what the moderator asked for, then submit. Your earlier post is replaced.</span>
                        <button type="button" className="underline" onClick={() => { setReplacing(null); resetForm(); }}>Start a new post instead</button>
                      </div>
                    )}
                    {!userEmail ? (
                      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
                        Please log in with your university email to create a post.
                      </div>
                    ) : !viewer?.active ? (
                      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
                        Posting opens once your GUCC membership is approved.
                      </div>
                    ) : (
                      <form className="space-y-6" onSubmit={handleSubmit}>
                        <p className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 text-xs text-slate-300">
                          Please don&apos;t post photos that show ID numbers, phone numbers or other private details. A moderator reviews every post first.
                        </p>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Type</Label>
                            <Select
                              value={formValues.type}
                              onValueChange={(value) =>
                                setFormValues((prev) => ({ ...prev, type: value as LostFoundType }))
                              }
                            >
                              <SelectTrigger aria-label="Type">
                                <SelectValue placeholder="Lost" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="lost">Lost item</SelectItem>
                                <SelectItem value="found">Found item</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="title">Title</Label>
                            <Input
                              id="title"
                              value={formValues.title}
                              onChange={(e) =>
                                setFormValues((prev) => ({ ...prev, title: e.target.value }))
                              }
                              placeholder="Lost black wallet"
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Category</Label>
                            <Select
                              value={formValues.category}
                              onValueChange={(value) =>
                                setFormValues((prev) => ({ ...prev, category: value }))
                              }
                            >
                              <SelectTrigger aria-label="Category">
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                              <SelectContent>
                                {lostFoundCategories.map((category) => (
                                  <SelectItem key={category} value={category}>
                                    {category}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Location</Label>
                            <Select
                              value={formValues.location}
                              onValueChange={(value) =>
                                setFormValues((prev) => ({ ...prev, location: value }))
                              }
                            >
                              <SelectTrigger aria-label="Location">
                                <SelectValue placeholder="Select location" />
                              </SelectTrigger>
                              <SelectContent>
                                {lostFoundLocations.map((location) => (
                                  <SelectItem key={location} value={location}>
                                    {location}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="occurred">Date and time</Label>
                            <Input
                              id="occurred"
                              type="datetime-local"
                              value={formValues.occurred_at}
                              onChange={(e) =>
                                setFormValues((prev) => ({ ...prev, occurred_at: e.target.value }))
                              }
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="image">Image (optional)</Label>
                            <Input
                              id="image"
                              type="file"
                              accept="image/*"
                              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="description">Description</Label>
                          <Textarea
                            id="description"
                            value={formValues.description}
                            onChange={(e) =>
                              setFormValues((prev) => ({ ...prev, description: e.target.value }))
                            }
                            placeholder="Include distinctive details, colors, and any identifying marks."
                            required
                          />
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Contact option</Label>
                            <Select
                              value={formValues.contact_method}
                              onValueChange={(value) =>
                                setFormValues((prev) => ({
                                  ...prev,
                                  contact_method: value as ContactMethod,
                                }))
                              }
                            >
                              <SelectTrigger aria-label="Contact option">
                                <SelectValue placeholder="Choose contact" />
                              </SelectTrigger>
                              <SelectContent>
                                {lostFoundContactMethods.map((method) => (
                                  <SelectItem key={method.value} value={method.value}>
                                    {method.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {formValues.contact_method !== "in_app" && (
                            <div className="space-y-2">
                              <Label htmlFor="contact">Contact detail</Label>
                              <Input
                                id="contact"
                                value={formValues.contact_value}
                                onChange={(e) =>
                                  setFormValues((prev) => ({
                                    ...prev,
                                    contact_value: e.target.value,
                                  }))
                                }
                                placeholder={
                                  formValues.contact_method === "email"
                                    ? "student@green.edu.bd"
                                    : "+8801..."
                                }
                                required
                              />
                            </div>
                          )}
                        </div>
                        {formError && (
                          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
                            {formError}
                          </div>
                        )}
                        {formSuccess && (
                          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                            {formSuccess}
                          </div>
                        )}
                        <Button
                          type="submit"
                          className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                          disabled={isSubmitting}
                        >
                          {isSubmitting ? "Submitting..." : "Submit report"}
                        </Button>
                      </form>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="mine" className="pt-6">
                <Card className="border border-slate-800 bg-slate-950/60">
                  <CardHeader>
                    <CardTitle className="text-lg">My posts</CardTitle>
                    <CardDescription className="text-slate-400">
                      Where each of your posts stands. Posts go live after a moderator checks them.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!userId ? (
                      <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-300">
                        <a href="/auth/login?next=/lost-found%23mine" className="underline">Sign in</a> to see your posts.
                      </div>
                    ) : myPosts === null ? (
                      <p className="text-sm text-slate-400" role="status">Loading your posts…</p>
                    ) : myPosts.length === 0 ? (
                      <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-300">
                        You haven&apos;t posted anything yet.{" "}
                        <button type="button" className="underline" onClick={() => openTab("report")}>Report a lost or found item</button>
                      </div>
                    ) : (
                      <ul className="space-y-3">
                        {myPosts.map((post) => (
                          <li key={post.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className={typeStyles[post.type]}>{typeLabels[post.type]}</Badge>
                              <Badge variant="outline" className={statusStyles[post.status]}>{post.status === "rejected" ? "Needs changes" : post.status === "pending" ? "Waiting for review" : statusLabels[post.status]}</Badge>
                              <span className="text-xs text-slate-400">{new Date(post.created_at).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium" })}</span>
                            </div>
                            <p className="mt-2 font-medium text-slate-100">{post.title}</p>
                            {post.status === "rejected" && (
                              <div className="mt-2 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">
                                <p className="font-medium">What the moderator asked for</p>
                                <p className="mt-1 whitespace-pre-wrap">{post.reject_reason || "No reason was given."}</p>
                              </div>
                            )}
                            <div className="mt-3 flex flex-wrap gap-2">
                              {post.status === "rejected" && (
                                <Button type="button" size="sm" className="min-h-10" onClick={() => fixAndRepost(post)}>Fix and post again</Button>
                              )}
                              {post.status === "active" && (
                                <Button type="button" size="sm" variant="outline" className="min-h-10 border-slate-700 text-slate-200" onClick={async () => { await handleResolve(post.id); loadMine(); }}>Mark resolved</Button>
                              )}
                              <Button type="button" size="sm" variant="ghost" className="min-h-10 text-rose-300 hover:text-rose-200" onClick={async () => {
                                if (!(await confirm({ title: "Delete this post?", description: "It disappears from the board. This can't be undone.", confirmLabel: "Delete post", destructive: true }))) return;
                                const res = await fetch(`/api/lost-found/${post.id}`, { method: "DELETE" }).catch(() => null);
                                setNotice(res?.ok ? "Post deleted." : "Couldn't delete it. Try again.");
                                loadMine();
                                loadPosts();
                              }}>Delete</Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="inbox" className="pt-6">
                <Card className="border border-slate-800 bg-slate-950/60">
                  <CardHeader>
                    <CardTitle className="text-lg">Inbox</CardTitle>
                    <CardDescription className="text-slate-400">
                      Messages about your posts. Conversations continue in Messages.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {!userEmail ? (
                      <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-300">
                        Log in to see your inbox.
                      </div>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          className="border-slate-700 text-slate-200"
                          onClick={loadInbox}
                        >
                          {isLoadingInbox ? "Refreshing..." : "Refresh inbox"}
                        </Button>
                        {inboxMessages.length === 0 ? (
                          <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-300">
                            No messages yet.
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {inboxMessages.map((message) => (
                              <Card key={message.id} className="border border-slate-800 bg-slate-950/60">
                                <CardHeader>
                                  <CardTitle className="text-base">
                                    {message.post?.title || "Lost & Found"}
                                  </CardTitle>
                                  <CardDescription className="text-slate-400">
                                    From {message.sender_email} · {new Date(message.created_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" })}
                                  </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                  <p className="text-sm text-slate-200/80">{message.body}</p>
                                  <a href={`/dashboard/chat/${message.conversation_id}`} className="inline-flex rounded-md border border-emerald-500/40 px-3 py-1.5 text-sm text-emerald-100 hover:bg-emerald-500/10">
                                    Reply in Messages
                                  </a>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {isAdmin && (
                <TabsContent value="admin" className="pt-6">
                  <Card className="border border-slate-800 bg-slate-950/60">
                    <CardHeader>
                      <CardTitle className="text-lg">Admin moderation</CardTitle>
                      <CardDescription className="text-slate-400">
                        Approve, reject, or resolve posts flagged as pending.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {posts.filter((post) => post.status === "pending").length === 0 ? (
                        <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-300">
                          No pending posts right now.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {posts
                            .filter((post) => post.status === "pending")
                            .map((post) => (
                              <Card key={post.id} className="border border-slate-800 bg-slate-950/60">
                                <CardHeader>
                                  <CardTitle className="text-base">{post.title}</CardTitle>
                                  <CardDescription className="text-slate-400">
                                    {post.category} · {post.location}
                                  </CardDescription>
                                </CardHeader>
                                <CardContent className="flex flex-wrap gap-3">
                                  <Button
                                    className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                                    onClick={() => handleAdminUpdate(post.id, "active")}
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    variant="outline"
                                    className="border-rose-500/40 text-rose-200"
                                    onClick={() => handleAdminUpdate(post.id, "rejected")}
                                  >
                                    Reject
                                  </Button>
                                  <Button
                                    variant="outline"
                                    className="border-slate-700 text-slate-200"
                                    onClick={() => handleAdminUpdate(post.id, "resolved")}
                                  >
                                    Mark resolved
                                  </Button>
                                  {post.image_url && (
                                    <Button variant="outline" className="border-slate-700 text-slate-200" onClick={() => handleRemoveImage(post.id)}>
                                      Remove photo
                                    </Button>
                                  )}
                                </CardContent>
                              </Card>
                            ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function MessageDialog({
  postId,
  onSend,
  disabled,
  buttonLabel = "Message",
}: {
  postId: string;
  onSend: (postId: string, message: string) => Promise<{ ok: boolean; conversationId?: string; error?: string }>;
  disabled?: boolean;
  buttonLabel?: string;
}) {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [conversation, setConversation] = useState<string | null>(null);

  const handleSend = async () => {
    if (!message.trim()) {
      setFeedback("Message cannot be empty.");
      return;
    }

    setIsSending(true);
    setFeedback(null);
    const result = await onSend(postId, message.trim());
    setIsSending(false);

    if (result.ok) {
      setMessage("");
      setFeedback("Message sent.");
      setConversation(result.conversationId ?? null);
    } else {
      setFeedback(result.error ?? "Failed to send message.");
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="border-emerald-500/40 text-emerald-100"
          disabled={disabled}
        >
          {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="border border-slate-800 bg-slate-950 text-slate-100">
        <DialogHeader>
          <DialogTitle>Send a message</DialogTitle>
          <DialogDescription className="text-slate-400">
            Keep details specific and concise so the owner can respond quickly.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Share where you saw the item or how to verify ownership."
          />
          {feedback && (
            <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 text-sm text-slate-300">
              {feedback}
              {conversation && <> <a href={`/dashboard/chat/${conversation}`} className="underline">Continue in Messages</a></>}
            </div>
          )}
          <Button
            className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
            onClick={handleSend}
            disabled={isSending}
          >
            {isSending ? "Sending..." : "Send message"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
