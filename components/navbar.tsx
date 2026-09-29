"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Bell, ChevronDown, LayoutDashboard, LogOut, Menu, MessageSquare, User, X } from "lucide-react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
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

/** Shown only to signed-in people; visitors see the navbar exactly as before. */
function AccountMenu({ s: session }: { s: ClientSession }) {
  // The badge stays current: the dashboard keeps these numbers live, and every page refreshes
  // them when the tab comes back into view.
  const counts = useLiveCounts({ unread: session.unread ?? 0, unreadMessages: session.unreadMessages ?? 0, openTasks: session.openTasks ?? 0 });
  const s = { ...session, unread: counts?.unread ?? session.unread };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Account menu for ${s.name}${s.unread ? `, ${s.unread} unread notifications` : ""}`}>
          {s.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.avatarUrl} alt="" width={32} height={32} className="h-8 w-8 rounded-full border object-cover" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary" aria-hidden>
              {initials(s.name)}
            </span>
          )}
          {s.unread ? <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[10px] leading-4 text-white">{s.unread > 9 ? "9+" : s.unread}</span> : null}
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

/**
 * `executivesHref` points at the current committee and `services` fills the Services menu,
 * both from the database.
 */
export function Navbar({ executivesHref = "/executives", services = [] }: { executivesHref?: string; services?: ServiceLink[] }) {
  // One menu at a time: opening this closes the dashboard menu and the assistant, and back.
  const [isMenuOpen, setIsMenuOpen] = useExclusiveOverlay("site-menu");
  const [servicesOpen, setServicesOpen] = useState(false);
  const pathname = usePathname();
  // The dashboard has its own menu on phones and tablets (with the website's pages in it), so
  // this header doesn't offer a second one there.
  const inDashboard = pathname.startsWith("/dashboard");
  const closeMenu = useCallback(() => setIsMenuOpen(false), [setIsMenuOpen]);
  useCloseAbove(768, isMenuOpen, closeMenu);
  // A page change (a link, Back, a redirect) closes the menu.
  useEffect(() => {
    closeMenu();
    setServicesOpen(false);
  }, [pathname, closeMenu]);
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

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  // Close the mobile menu with Escape.
  useEffect(() => {
    if (!isMenuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setIsMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMenuOpen, setIsMenuOpen]);

  // A section stays highlighted on its inner pages (/events/…, /blog/…).
  const isActive = (path: string) => {
    if (path === executivesHref) {
      return pathname.startsWith("/executives");
    }
    return path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`);
  };

  const linkClass = (path: string) =>
    `text-sm font-medium transition-colors hover:text-primary ${isActive(path) ? "text-primary" : "text-muted-foreground"}`;
  const signInHref = `/auth/login?next=${encodeURIComponent(pathname)}`;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/60">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-popover focus:text-popover-foreground focus:px-3 focus:py-2">Skip to content</a>
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center space-x-2">
          <Image
            src="/android-chrome-192x192.png"
            alt="GUCC Logo"
            width={45}
            height={45}
          />
          <div className="hidden sm:block">
            <div className="text-xl font-bold">
              <p className="text-lg text-primary leading-[18px]">
                GREEN UNIVERSITY
              </p>
              <p className="text-sm text-foreground">COMPUTER CLUB</p>
            </div>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          <Link href="/" className={linkClass("/")} aria-current={isActive("/") ? "page" : undefined}>
            Home
          </Link>
          <Link href="/events" className={linkClass("/events")} aria-current={isActive("/events") ? "page" : undefined}>
            Events
          </Link>
          <Link href="/blog" className={linkClass("/blog")} aria-current={isActive("/blog") ? "page" : undefined}>
            Blog
          </Link>
          <Link href={executivesHref} className={linkClass(executivesHref)} aria-current={isActive(executivesHref) ? "page" : undefined}>
            Executives
          </Link>
          <Link href="/sponsors" className={linkClass("/sponsors")} aria-current={isActive("/sponsors") ? "page" : undefined}>
            Sponsors
          </Link>
          <Link href="/contact" className={linkClass("/contact")} aria-current={isActive("/contact") ? "page" : undefined}>
            Contact Us
          </Link>
          {services.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={`group inline-flex items-center gap-1 text-sm font-medium transition-colors hover:text-primary ${services.some((x) => pathname.startsWith(x.href)) ? "text-primary" : "text-muted-foreground"}`}
                >
                  Services
                  <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={8} className="w-64">
                {services.map((x) => (
                  <DropdownMenuItem key={x.href} asChild>
                    <Link href={x.href} className="flex flex-col items-start gap-0.5">
                      <span className="font-medium">{x.label}</span>
                      {x.description && <span className="text-xs text-muted-foreground">{x.description}</span>}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {!signedIn && (
            <Link href={signInHref} className={linkClass("/auth/login")} aria-current={isActive("/auth/login") ? "page" : undefined}>
              Sign in
            </Link>
          )}
          <Button asChild>
            <Link href="/join">
              Join Us
            </Link>
          </Button>
        </nav>

        {/* Dark Mode & Mobile Menu Button */}
        <div className="flex items-center space-x-3">
          {signedIn && session && <AccountMenu s={session} />}
          {/* 🌙 Dark Mode Toggle */}
          <ThemeToggle />

          {/* ☰ Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className={inDashboard ? "hidden" : "h-11 w-11 md:hidden"}
            onClick={toggleMenu}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-nav"
            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
          >
            {isMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </Button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isMenuOpen && !inDashboard && (
        <div id="mobile-nav" className="container md:hidden py-4 border-t border-border">
          <nav className="flex flex-col space-y-1 [&>a]:flex [&>a]:min-h-11 [&>a]:items-center">
            <Link href="/" className={linkClass("/")} aria-current={isActive("/") ? "page" : undefined} onClick={() => setIsMenuOpen(false)}>
              Home
            </Link>
            <Link href="/events" className={linkClass("/events")} aria-current={isActive("/events") ? "page" : undefined} onClick={() => setIsMenuOpen(false)}>
              Events
            </Link>
            <Link href="/blog" className={linkClass("/blog")} aria-current={isActive("/blog") ? "page" : undefined} onClick={() => setIsMenuOpen(false)}>
              Blog
            </Link>
            <Link href={executivesHref} className={linkClass(executivesHref)} aria-current={isActive(executivesHref) ? "page" : undefined} onClick={() => setIsMenuOpen(false)}>
              Executives
            </Link>
            <Link href="/sponsors" className={linkClass("/sponsors")} aria-current={isActive("/sponsors") ? "page" : undefined} onClick={() => setIsMenuOpen(false)}>
              Sponsors
            </Link>
            <Link href="/contact" className={linkClass("/contact")} aria-current={isActive("/contact") ? "page" : undefined} onClick={() => setIsMenuOpen(false)}>
              Contact
            </Link>
            {services.length > 0 && (
              <div className="space-y-2">
                <button
                  type="button"
                  className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground"
                  onClick={() => setServicesOpen((prev) => !prev)}
                  aria-expanded={servicesOpen}
                >
                  Services
                  <ChevronDown className={`h-4 w-4 transition-transform ${servicesOpen ? "rotate-180" : ""}`} />
                </button>
                {servicesOpen && (
                  <div className="flex flex-col space-y-2 pl-2">
                    {services.map((x) => (
                      <Link key={x.href} href={x.href} className={linkClass(x.href)} aria-current={isActive(x.href) ? "page" : undefined} onClick={() => { setIsMenuOpen(false); setServicesOpen(false); }}>
                        {x.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
            {!signedIn && (
              <Link href={signInHref} className={linkClass("/auth/login")} aria-current={isActive("/auth/login") ? "page" : undefined} onClick={() => setIsMenuOpen(false)}>
                Sign in
              </Link>
            )}
            <Button asChild>
              <Link
                href="/join"
                onClick={() => setIsMenuOpen(false)}
              >
                Join Us
              </Link>
            </Button>
          </nav>
        </div>
      )}
    </header>
  );
}
