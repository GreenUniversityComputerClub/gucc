"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, ArrowUpRight, Bell, CalendarDays, ChevronDown, Facebook, Github, Handshake, Home, Instagram, LayoutDashboard, LayoutGrid, Linkedin, LogIn, LogOut, Mail,
  MessageSquare, Newspaper, User, UserPlus, Users, Youtube,
} from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { SiteSearch } from "@/components/site-search";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/app/auth/actions";
import { refreshSession, useSession, type ClientSession } from "@/lib/api/use-session";
import { initials } from "@/lib/initials";
import { useLiveCounts } from "@/lib/api/live-counts";
import { useCloseAbove, useExclusiveOverlay } from "@/lib/overlay";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { MessagesMenu } from "@/components/notifications/messages-menu";

const seedOf = (s: ClientSession) => ({ unread: s.unread ?? 0, unreadMessages: s.unreadMessages ?? 0, openTasks: s.openTasks ?? 0 });
import { cn } from "@/lib/utils";

/** Shown only to signed-in people. */
function AccountMenu({ s: session }: { s: ClientSession }) {
  // The badge stays current: the dashboard keeps these numbers live, and every page refreshes
  // them when the tab comes back into view.
  const counts = useLiveCounts({ unread: session.unread ?? 0, unreadMessages: session.unreadMessages ?? 0, openTasks: session.openTasks ?? 0 });
  const s = { ...session, unread: counts?.unread ?? session.unread };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="relative flex h-10 w-10 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Account menu for ${s.name}`}>
          {s.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.avatarUrl} alt="" width={32} height={32} className="h-8 w-8 rounded-full border object-cover" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary" aria-hidden>
              {initials(s.name)}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate font-normal">
          <span className="block truncate font-medium">{s.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{s.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/dashboard"><LayoutDashboard className="mr-2 h-4 w-4" />Dashboard</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/dashboard/profile"><User className="mr-2 h-4 w-4" />Profile</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/dashboard/notifications"><Bell className="mr-2 h-4 w-4" />Notifications{s.unread ? ` (${s.unread})` : ""}</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/dashboard/chat"><MessageSquare className="mr-2 h-4 w-4" />Messages{counts?.unreadMessages ? ` (${counts.unreadMessages})` : ""}</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={logoutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full"><LogOut className="mr-2 h-4 w-4" />Sign out</button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface ServiceLink {
  label: string;
  href: string;
  description?: string;
}

const SOCIALS = [
  { href: "https://www.facebook.com/GreenUniversityComputerClub", label: "Facebook", icon: Facebook },
  { href: "https://www.linkedin.com/company/greenuniversitycomputerclub/", label: "LinkedIn", icon: Linkedin },
  { href: "https://www.instagram.com/GreenUniversityComputerClub/", label: "Instagram", icon: Instagram },
  { href: "https://www.youtube.com/@GreenUniversityComputerClub", label: "YouTube", icon: Youtube },
  { href: "https://github.com/GreenUniversityComputerClub", label: "GitHub", icon: Github },
];

/**
 * The site header. `executivesHref` points at the current committee and `services` fills the
 * Services menu, both from the database.
 *
 * Wide screens (1024 px and up) show every link; phones and tablets get a full-screen menu with large
 * targets. Search (Ctrl/⌘ K) is always one tap away.
 */
export function Navbar({ executivesHref = "/executives", services = [] }: { executivesHref?: string; services?: ServiceLink[] }) {
  // One menu at a time: opening this closes the dashboard menu and the assistant, and back.
  const [isMenuOpen, setIsMenuOpen] = useExclusiveOverlay("site-menu");
  const [scrolled, setScrolled] = useState(false);
  // The link under the pointer (or focus), where the gliding highlight sits.
  const [hovered, setHovered] = useState<string | null>(null);
  const pathname = usePathname();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // The dashboard has its own menu on phones and tablets (with the website's pages in it), so
  // this header doesn't offer a second one there.
  const inDashboard = pathname.startsWith("/dashboard");
  const closeMenu = useCallback(() => setIsMenuOpen(false), [setIsMenuOpen]);
  useCloseAbove(1024, isMenuOpen, closeMenu);
  // A page change (a link, Back, a redirect) closes the menu.
  useEffect(() => closeMenu(), [pathname, closeMenu]);
  const session = useSession();
  const signedIn = Boolean(session?.signedIn);
  // Signing in or out ends in a client-side navigation, so ask again who is signed in when
  // leaving the sign-in pages or the dashboard (where signing out happens).
  const lastPath = useRef(pathname);
  useEffect(() => {
    const from = lastPath.current;
    lastPath.current = pathname;
    if (from !== pathname && (from.startsWith("/auth") || from.startsWith("/dashboard") || pathname.startsWith("/auth"))) refreshSession();
  }, [pathname]);

  // A shadow once the page scrolls under the header.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // While the phone menu is open: the page behind doesn't scroll, Escape closes it (and gives the
  // focus back to the menu button), and the first link takes the focus.
  useEffect(() => {
    if (!isMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("a[href]")?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setIsMenuOpen(false);
      toggleRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [isMenuOpen, setIsMenuOpen]);

  // A section stays highlighted on its inner pages (/events/…, /blog/…).
  const isActive = (path: string) => {
    if (path === executivesHref) return pathname.startsWith("/executives");
    if (path === "/sponsors") return pathname.startsWith("/sponsors") || pathname === "/become-a-sponsor";
    return path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`);
  };
  const signInHref = `/auth/login?next=${encodeURIComponent(pathname)}`;
  // Over the home page's night-sky hero the header is see-through and always dark; it frosts over
  // once the page scrolls (or the menu opens).
  const overHero = pathname === "/" && !scrolled && !isMenuOpen;

  const links = [
    { href: "/", label: "Home", icon: Home },
    { href: "/events", label: "Events", icon: CalendarDays },
    { href: "/blog", label: "Blog", icon: Newspaper },
    { href: executivesHref, label: "Executives", icon: Users },
    // /sponsors redirects, per request, to the default sponsorship page chosen in the dashboard,
    // so a cached page's navbar can never point at an old default.
    { href: "/sponsors", label: "Sponsors", icon: Handshake },
    { href: "/contact", label: "Contact", icon: Mail },
  ];
  const servicesActive = services.some((x) => isActive(x.href));

  return (
    <MotionConfig reducedMotion="user">
    {/* A floating glass capsule, 64 px tall with its margin (as the pages below expect). Over the
        home page's night-sky hero it is see-through and always dark; it frosts and tightens once
        the page scrolls. */}
    <header className={cn("sticky top-0 z-50 w-full px-2 pt-2 sm:px-4", overHero && "dark dark-surface")}>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-popover focus:px-3 focus:py-2 focus:text-popover-foreground">Skip to content</a>
      <div className={cn(
        "relative mx-auto flex h-14 items-center gap-2 rounded-full border pl-2 pr-1.5 text-foreground transition-[max-width,background-color,border-color,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
        overHero
          ? "max-w-[1400px] border-white/10 bg-white/[0.04] backdrop-blur-md"
          : "max-w-6xl border-foreground/10 bg-background/70 shadow-[0_10px_40px_-14px_hsl(var(--primary)/0.35),inset_0_1px_0_hsl(var(--foreground)/0.06)] backdrop-blur-2xl backdrop-saturate-150",
      )}>
        {/* A thin light along the capsule's top edge */}
        <span aria-hidden className="pointer-events-none absolute inset-x-10 -top-px h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

        {/* The logo's alt names the link: an aria-label would hide the visible name from voice control. */}
        <Link href="/" className="group flex shrink-0 items-center gap-2.5 rounded-full pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="relative flex h-10 w-10 items-center justify-center">
            <span aria-hidden className="absolute inset-0 rounded-full bg-gradient-to-br from-primary to-secondary opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-60" />
            <Image src="/android-chrome-192x192.png" alt="Green University Computer Club, home" width={40} height={40} priority className="relative h-10 w-10 rounded-full transition-transform duration-500 group-hover:rotate-[-8deg]" />
          </span>
          {/* The name gives way to the links where they need the room (1024–1279 px), and on phones
              to the messages and notifications buttons of a signed-in member. */}
          <span className={cn("hidden leading-none lg:hidden xl:block", signedIn ? "sm:block" : "min-[380px]:block")} aria-hidden>
            <span className="block font-display text-[15px] font-bold tracking-tight">GUCC</span>
            <span className="mt-1 block font-mono text-[9.5px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Computer Club</span>
          </span>
        </Link>

        {/* Wide screens: a soft highlight glides to the link under the pointer; a glowing bar marks the page you're on. */}
        <nav aria-label="Main" className="hidden flex-1 justify-center lg:flex" onMouseLeave={() => setHovered(null)}>
          <ul className="flex items-center gap-0.5">
            {links.map((l) => {
              const active = isActive(l.href);
              return (
                <li key={l.label}>
                  <Link href={l.href} aria-current={active ? "page" : undefined}
                    onMouseEnter={() => setHovered(l.label)} onFocus={() => setHovered(l.label)} onBlur={() => setHovered(null)}
                    className={cn("relative isolate flex h-10 items-center rounded-full px-3.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                    {hovered === l.label && (
                      <motion.span layoutId="nav-hover" aria-hidden className="absolute inset-0 -z-10 rounded-full bg-foreground/[0.07]"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.45 }} />
                    )}
                    {active && (
                      <motion.span layoutId="nav-active" aria-hidden className="absolute inset-x-3 bottom-1 -z-10 h-[2px] rounded-full bg-gradient-to-r from-primary to-secondary shadow-[0_0_10px_1px] shadow-primary/70"
                        transition={{ type: "spring", bounce: 0.25, duration: 0.55 }} />
                    )}
                    {l.label}
                  </Link>
                </li>
              );
            })}
            {services.length > 0 && (
              <li>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" onMouseEnter={() => setHovered("Services")}
                      className={cn("group relative isolate inline-flex h-10 items-center gap-1 rounded-full px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        servicesActive ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                      {hovered === "Services" && (
                        <motion.span layoutId="nav-hover" aria-hidden className="absolute inset-0 -z-10 rounded-full bg-foreground/[0.07]"
                          transition={{ type: "spring", bounce: 0.2, duration: 0.45 }} />
                      )}
                      {servicesActive && (
                        <motion.span layoutId="nav-active" aria-hidden className="absolute inset-x-3 bottom-1 -z-10 h-[2px] rounded-full bg-gradient-to-r from-primary to-secondary shadow-[0_0_10px_1px] shadow-primary/70" />
                      )}
                      Services
                      <ChevronDown className="h-4 w-4 transition-transform duration-300 group-data-[state=open]:rotate-180" aria-hidden />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" sideOffset={14} className="w-80 rounded-2xl border-foreground/10 bg-popover/90 p-2 shadow-2xl shadow-primary/10 backdrop-blur-xl">
                    {services.map((x) => (
                      <DropdownMenuItem key={x.href} asChild className="rounded-xl p-3">
                        <Link href={x.href} className="group/item flex items-start gap-3">
                          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 text-primary ring-1 ring-primary/20"><LayoutGrid className="h-4 w-4" aria-hidden /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium">{x.label}</span>
                            {x.description && <span className="block text-xs leading-snug text-muted-foreground">{x.description}</span>}
                          </span>
                          <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/item:opacity-100" aria-hidden />
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            )}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-0.5 sm:gap-1 lg:ml-0">
          <SiteSearch />
          {signedIn && session && (
            <>
              {/* As on Facebook: messages and notifications, each with a live count. */}
              <span className="hidden min-[380px]:inline-flex"><MessagesMenu seed={seedOf(session)} /></span>
              <NotificationBell seed={seedOf(session)} />
              <AccountMenu s={session} />
            </>
          )}
          <ThemeToggle />
          {!signedIn && (
            <Link href={signInHref} className="hidden h-10 items-center rounded-full px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.07] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:inline-flex">
              Sign in
            </Link>
          )}
          <Link href="/join"
            className="group relative hidden h-11 items-center gap-1.5 overflow-hidden rounded-full bg-gradient-to-r from-brand-600 to-aurora-700 pl-5 pr-4 text-sm font-semibold text-white shadow-[0_0_24px_-6px] shadow-brand-500/70 transition-[transform,box-shadow] duration-300 hover:-translate-y-px hover:shadow-brand-500/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:from-brand-400 dark:to-aurora-400 dark:text-slate-950 sm:inline-flex">
            <span aria-hidden className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            Join Us
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
          </Link>
          {!inDashboard && (
            <button ref={toggleRef} type="button" onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-expanded={isMenuOpen} aria-controls="mobile-nav" aria-label={isMenuOpen ? "Close menu" : "Open menu"}
              className="relative flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-foreground/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden">
              {/* Two lines that cross into an X */}
              <span aria-hidden className={cn("absolute h-[2px] w-5 rounded-full bg-current transition-transform duration-300", isMenuOpen ? "rotate-45" : "-translate-y-[4px]")} />
              <span aria-hidden className={cn("absolute h-[2px] rounded-full bg-current transition-all duration-300", isMenuOpen ? "w-5 -rotate-45" : "w-3.5 translate-x-[3px] translate-y-[4px]")} />
            </button>
          )}
        </div>
      </div>

      {/* Phones and tablets: a full-screen sheet of glass, the links arriving one after another */}
      <AnimatePresence>
        {isMenuOpen && !inDashboard && (
          <motion.div id="mobile-nav" ref={panelRef} key="mobile-nav"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
            className="fixed inset-0 -z-10 overflow-y-auto overscroll-contain bg-background/90 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-24 backdrop-blur-2xl lg:hidden">
            <div aria-hidden className="pointer-events-none absolute -left-20 top-10 h-72 w-72 rounded-full bg-primary/20 blur-[100px]" />
            <div aria-hidden className="pointer-events-none absolute -right-20 bottom-20 h-72 w-72 rounded-full bg-secondary/15 blur-[100px]" />
            <nav aria-label="Main" className="relative mx-auto max-w-xl">
              <ul className="grid gap-1">
                {links.map((l, i) => {
                  const active = isActive(l.href);
                  return (
                    <motion.li key={l.label} initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 + i * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
                      <Link href={l.href} aria-current={active ? "page" : undefined} onClick={closeMenu}
                        className={cn("group flex min-h-14 items-center gap-4 rounded-2xl px-3 transition-colors", active ? "bg-primary/10" : "hover:bg-foreground/5")}>
                        <span className="w-6 font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                        <span className={cn("font-display text-2xl font-semibold tracking-tight sm:text-3xl", active ? "text-gradient" : "text-foreground")}>{l.label}</span>
                        <ArrowRight className="ml-auto h-5 w-5 -translate-x-2 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" aria-hidden />
                      </Link>
                    </motion.li>
                  );
                })}
              </ul>
              {services.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.4 }} className="mt-6 border-t border-border/60 pt-5">
                  <p className="px-3 pb-2 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Services</p>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {services.map((x) => (
                      <Link key={x.href} href={x.href} aria-current={isActive(x.href) ? "page" : undefined} onClick={closeMenu}
                        className={cn("flex min-h-12 items-center gap-3 rounded-2xl px-3 py-2 transition-colors", isActive(x.href) ? "bg-primary/10 text-primary" : "hover:bg-foreground/5")}>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 text-primary"><LayoutGrid className="h-[18px] w-[18px]" aria-hidden /></span>
                        <span className="min-w-0">
                          <span className="block text-base font-medium">{x.label}</span>
                          {x.description && <span className="block truncate text-xs text-muted-foreground">{x.description}</span>}
                        </span>
                      </Link>
                    ))}
                  </div>
                </motion.div>
              )}
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.4 }} className="mt-6 border-t border-border/60 pt-5">
                {signedIn ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Button asChild variant="outline" className="h-12 rounded-full"><Link href="/dashboard" onClick={closeMenu}><LayoutDashboard className="mr-2 h-4 w-4" aria-hidden />Dashboard</Link></Button>
                    <Button asChild variant="outline" className="h-12 rounded-full"><Link href="/dashboard/chat" onClick={closeMenu}><MessageSquare className="mr-2 h-4 w-4" aria-hidden />Messages</Link></Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Button asChild variant="outline" className="h-12 rounded-full"><Link href={signInHref} onClick={closeMenu}><LogIn className="mr-2 h-4 w-4" aria-hidden />Sign in</Link></Button>
                    <Link href="/join" onClick={closeMenu} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-aurora-700 text-sm font-semibold text-white dark:from-brand-400 dark:to-aurora-400 dark:text-slate-950">
                      <UserPlus className="h-4 w-4" aria-hidden />Join Us
                    </Link>
                  </div>
                )}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <a href="mailto:gucc@green.edu.bd" className="inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground hover:text-primary"><Mail className="h-4 w-4" aria-hidden />gucc@green.edu.bd</a>
                  <div className="-mr-2 flex shrink-0 items-center">
                    {SOCIALS.map((s) => (
                      <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={`GUCC on ${s.label}`}
                        className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary">
                        <s.icon className="h-[18px] w-[18px]" aria-hidden />
                      </a>
                    ))}
                  </div>
                </div>
              </motion.div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
    </MotionConfig>
  );
}
