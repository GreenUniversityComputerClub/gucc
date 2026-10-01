"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Bell, CalendarDays, ChevronDown, ChevronRight, Facebook, Github, Handshake, Home, Instagram, LayoutDashboard, LayoutGrid, Linkedin, LogIn, LogOut, Mail,
  Menu, MessageSquare, Newspaper, User, UserPlus, Users, X, Youtube,
} from "lucide-react";
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
        <button type="button" className="relative flex h-10 w-10 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Account menu for ${s.name}${s.unread ? `, ${s.unread} unread notifications` : ""}`}>
          {s.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.avatarUrl} alt="" width={32} height={32} className="h-8 w-8 rounded-full border object-cover" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary" aria-hidden>
              {initials(s.name)}
            </span>
          )}
          {s.unread ? <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[10px] leading-4 text-white">{s.unread > 9 ? "9+" : s.unread}</span> : null}
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
 * Wide screens (1024 px and up) show every link; phones and tablets get a menu panel with large
 * targets. Search (Ctrl/⌘ K) is always one tap away.
 */
export function Navbar({ executivesHref = "/executives", services = [] }: { executivesHref?: string; services?: ServiceLink[] }) {
  // One menu at a time: opening this closes the dashboard menu and the assistant, and back.
  const [isMenuOpen, setIsMenuOpen] = useExclusiveOverlay("site-menu");
  const [scrolled, setScrolled] = useState(false);
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
    <header className={cn(
      "sticky top-0 z-50 w-full border-b bg-background/90 backdrop-blur-md transition-shadow duration-300 supports-backdrop-filter:bg-background/75",
      scrolled ? "border-border shadow-[0_1px_12px_-4px_rgb(0_0_0/0.25)]" : "border-border/60",
    )}>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-popover focus:px-3 focus:py-2 focus:text-popover-foreground">Skip to content</a>
      <div className="container flex h-16 items-center gap-3">
        <Link href="/" className="flex shrink-0 items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Green University Computer Club, home">
          <Image src="/android-chrome-192x192.png" alt="GUCC Logo" width={42} height={42} priority className="h-10 w-10 sm:h-[42px] sm:w-[42px]" />
          {/* The name gives way to the links where they need the room (1024–1279 px). */}
          <span className="hidden leading-none min-[380px]:block lg:hidden xl:block" aria-hidden>
            <span className="block text-[17px] font-bold tracking-tight text-primary">GREEN UNIVERSITY</span>
            <span className="mt-0.5 block text-[13px] font-semibold tracking-[0.08em] text-foreground">COMPUTER CLUB</span>
          </span>
        </Link>

        {/* Wide screens */}
        <nav aria-label="Main" className="hidden flex-1 items-center justify-center gap-0.5 lg:flex">
          {links.map((l) => (
            <Link key={l.label} href={l.href} aria-current={isActive(l.href) ? "page" : undefined}
              className={cn("rounded-full px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:px-3.5",
                isActive(l.href) ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              {l.label}
            </Link>
          ))}
          {services.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button"
                  className={cn("group inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    servicesActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                  Services
                  <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" sideOffset={10} className="w-72 p-1.5">
                {services.map((x) => (
                  <DropdownMenuItem key={x.href} asChild className="rounded-lg p-2.5">
                    <Link href={x.href} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><LayoutGrid className="h-4 w-4" aria-hidden /></span>
                      <span className="min-w-0">
                        <span className="block font-medium">{x.label}</span>
                        {x.description && <span className="block text-xs leading-snug text-muted-foreground">{x.description}</span>}
                      </span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-1.5 lg:ml-0">
          <SiteSearch />
          {signedIn && session && <AccountMenu s={session} />}
          <ThemeToggle />
          {!signedIn && (
            <Button asChild variant="ghost" className="hidden rounded-full lg:inline-flex">
              <Link href={signInHref}>Sign in</Link>
            </Button>
          )}
          <Button asChild className="hidden rounded-full px-5 shadow-sm shadow-primary/20 sm:inline-flex">
            <Link href="/join">Join Us</Link>
          </Button>
          {!inDashboard && (
            <Button ref={toggleRef} variant="ghost" size="icon" className="h-11 w-11 rounded-full lg:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-expanded={isMenuOpen} aria-controls="mobile-nav" aria-label={isMenuOpen ? "Close menu" : "Open menu"}>
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          )}
        </div>
      </div>

      {/* Phones and tablets */}
      {isMenuOpen && !inDashboard && (
        <>
          <div className="fixed inset-x-0 bottom-0 top-16 z-40 bg-black/40 backdrop-blur-[2px] motion-safe:animate-in motion-safe:fade-in lg:hidden" onClick={closeMenu} aria-hidden />
          <div id="mobile-nav" ref={panelRef}
            className="fixed inset-x-0 top-16 z-50 max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain border-b bg-background pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl motion-safe:animate-in motion-safe:slide-in-from-top-2 motion-safe:fade-in motion-safe:duration-200 lg:hidden">
            <nav aria-label="Main" className="container grid gap-1 py-3 sm:grid-cols-2">
              {links.map((l) => (
                <Link key={l.label} href={l.href} aria-current={isActive(l.href) ? "page" : undefined} onClick={closeMenu}
                  className={cn("flex min-h-12 items-center gap-3 rounded-xl px-3 text-base font-medium transition-colors",
                    isActive(l.href) ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted")}>
                  <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", isActive(l.href) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                    <l.icon className="h-[18px] w-[18px]" aria-hidden />
                  </span>
                  {l.label}
                  <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" aria-hidden />
                </Link>
              ))}
            </nav>
            {services.length > 0 && (
              <div className="container border-t py-3">
                <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Services</p>
                <div className="grid gap-1 sm:grid-cols-2">
                  {services.map((x) => (
                    <Link key={x.href} href={x.href} aria-current={isActive(x.href) ? "page" : undefined} onClick={closeMenu}
                      className={cn("flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 transition-colors", isActive(x.href) ? "bg-primary/10 text-primary" : "hover:bg-muted")}>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><LayoutGrid className="h-[18px] w-[18px]" aria-hidden /></span>
                      <span className="min-w-0">
                        <span className="block text-base font-medium">{x.label}</span>
                        {x.description && <span className="block truncate text-xs text-muted-foreground">{x.description}</span>}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            <div className="container border-t pt-4">
              {signedIn ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button asChild variant="outline" className="h-11 rounded-xl"><Link href="/dashboard" onClick={closeMenu}><LayoutDashboard className="mr-2 h-4 w-4" aria-hidden />Dashboard</Link></Button>
                  <Button asChild variant="outline" className="h-11 rounded-xl"><Link href="/dashboard/chat" onClick={closeMenu}><MessageSquare className="mr-2 h-4 w-4" aria-hidden />Messages</Link></Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Button asChild variant="outline" className="h-11 rounded-xl"><Link href={signInHref} onClick={closeMenu}><LogIn className="mr-2 h-4 w-4" aria-hidden />Sign in</Link></Button>
                  <Button asChild className="h-11 rounded-xl"><Link href="/join" onClick={closeMenu}><UserPlus className="mr-2 h-4 w-4" aria-hidden />Join Us</Link></Button>
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <a href="mailto:gucc@green.edu.bd" className="inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground hover:text-primary"><Mail className="h-4 w-4" aria-hidden />gucc@green.edu.bd</a>
                <div className="-mr-2 flex shrink-0 items-center">
                  {SOCIALS.map((s) => (
                    <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={`GUCC on ${s.label}`}
                      className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-primary">
                      <s.icon className="h-[18px] w-[18px]" aria-hidden />
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </header>
  );
}
