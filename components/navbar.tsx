"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronDown, Menu, X, LayoutDashboard, UserRound, LogOut } from "lucide-react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/client";
import { isExecutiveEmail } from "@/lib/auth/executive-access";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProjectsMobileOpen, setIsProjectsMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  const isExecutive = isExecutiveEmail(userEmail);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setIsMenuOpen(false);
    router.push("/");
    router.refresh();
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const isActive = (path: string) => {
    if (path === "/executives/2026") {
      return pathname.startsWith("/executives");
    }
    return pathname === path;
  };

  const isProjectsPath = pathname.startsWith("/lost-found");

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/60">
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
          <Link
            href="/"
            className={`text-sm font-medium transition-colors hover:text-primary ${isActive("/") ? "text-primary" : "text-muted-foreground"}`}
          >
            Home
          </Link>
          <Link
            href="/events"
            className={`text-sm font-medium transition-colors hover:text-primary ${isActive("/events") ? "text-primary" : "text-muted-foreground"}`}
          >
            Events
          </Link>
          {/* <Link
            href="/contests"
            className={`text-sm font-medium transition-colors hover:text-primary ${isActive("/contests") ? "text-primary" : "text-muted-foreground"}`}
          >
            Contests
          </Link> */}
          {/* Lost & Found moved into Projects dropdown */}
          <Link
            href="/blog"
            className={`text-sm font-medium transition-colors hover:text-primary ${isActive("/blog") ? "text-primary" : "text-muted-foreground"}`}
          >
            Blog
          </Link>
          <Link
            href="/executives/2026"
            className={`text-sm font-medium transition-colors hover:text-primary ${isActive("/executives/2026") ? "text-primary" : "text-muted-foreground"}`}
          >
            Executives
          </Link>
          <Link
            href="/sponsors"
            className={`text-sm font-medium transition-colors hover:text-primary ${isActive("/sponsors") ? "text-primary" : "text-muted-foreground"}`}
          >
            Sponsors
          </Link>
          <Link
            href="/contact"
            className={`text-sm font-medium transition-colors hover:text-primary ${isActive("/contact") ? "text-primary" : "text-muted-foreground"}`}
          >
            Contact Us
          </Link>
          {/* <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={`group inline-flex items-center gap-1 text-sm font-medium transition-colors hover:text-primary ${isProjectsPath ? "text-primary" : "text-muted-foreground"}`}
              >
                Projects
                <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={8}>
              {/* <DropdownMenuItem asChild>
                <Link href="/scheduler">Scheduler</Link>
              </DropdownMenuItem> */}
              {/* <DropdownMenuItem asChild>
                <Link href="/lost-found">Lost & Found</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu> */} 
          {isExecutive && (
            <Link
              href="/forms"
              className={`inline-flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-primary ${isActive("/forms") || pathname.startsWith("/forms") ? "text-primary" : "text-muted-foreground"}`}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Form Builder
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
          {/* Account */}
          <div className="hidden md:block">
            {userEmail ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
                  >
                    <UserRound className="h-4 w-4" />
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8}>
                  <div className="px-2 py-1.5 text-xs text-muted-foreground truncate max-w-[200px]">
                    {userEmail}
                  </div>
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                    <LogOut className="h-3.5 w-3.5 mr-1.5" /> Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link
                href="/auth/login"
                className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
              >
                Login
              </Link>
            )}
          </div>

          {/* 🌙 Dark Mode Toggle */}
          <ThemeToggle />

          {/* ☰ Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={toggleMenu}
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
      {isMenuOpen && (
        <div className="container md:hidden py-4 border-t border-border">
          <nav className="flex flex-col space-y-4">
            <Link
              href="/"
              className={`text-sm font-medium transition-colors hover:text-primary ${isActive("/") ? "text-primary" : "text-muted-foreground"}`}
              onClick={() => setIsMenuOpen(false)}
            >
              Home
            </Link>
            <Link
              href="/events"
              className={`text-sm font-medium transition-colors hover:text-primary ${isActive("/events") ? "text-primary" : "text-muted-foreground"}`}
              onClick={() => setIsMenuOpen(false)}
            >
              Events
            </Link>
            {/* <Link
              href="/contests"
              className={`text-sm font-medium transition-colors hover:text-primary ${isActive("/contests") ? "text-primary" : "text-muted-foreground"}`}
              onClick={() => setIsMenuOpen(false)}
            >
              Contests
            </Link>  */}
            {/* Lost & Found moved into Projects mobile list */}
            <Link
              href="/blog"
              className={`text-sm font-medium transition-colors hover:text-primary ${isActive("/blog") ? "text-primary" : "text-muted-foreground"}`}
              onClick={() => setIsMenuOpen(false)}
            >
              Blog
            </Link>
            <Link
              href="/executives/2026"
              className={`text-sm font-medium transition-colors hover:text-primary ${isActive("/executives/2026") ? "text-primary" : "text-muted-foreground"}`}
              onClick={() => setIsMenuOpen(false)}
            >
              Executives
            </Link>
            <Link
              href="/sponsors"
              className={`text-sm font-medium transition-colors hover:text-primary ${isActive("/sponsors") ? "text-primary" : "text-muted-foreground"}`}
              onClick={() => setIsMenuOpen(false)}
            >
              Sponsors
            </Link>
            <Link
              href="/contact"
              className={`text-sm font-medium transition-colors hover:text-primary ${isActive("/contact") ? "text-primary" : "text-muted-foreground"}`}
              onClick={() => setIsMenuOpen(false)}
            >
              Contact
            </Link>
            {/* <div className="space-y-2">
              <button
                type="button"
                className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground"
                onClick={() => setIsProjectsMobileOpen((prev) => !prev)}
              >
                Projects
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${isProjectsMobileOpen ? "rotate-180" : ""}`}
                />
              </button>
              {isProjectsMobileOpen && (
                <div className="flex flex-col space-y-2 pl-2">
                  {/* <Link
                    href="/scheduler"
                    className={`text-sm font-medium transition-colors hover:text-primary ${isActive("/scheduler") ? "text-primary" : "text-muted-foreground"}`}
                    onClick={() => {
                      setIsMenuOpen(false);
                      setIsProjectsMobileOpen(false);
                    }}
                  >
                    Scheduler
                  </Link> */}
                  {/* <Link
                    href="/lost-found"
                    className={`text-sm font-medium transition-colors hover:text-primary ${isActive("/lost-found") ? "text-primary" : "text-muted-foreground"}`}
                    onClick={() => {
                      setIsMenuOpen(false);
                      setIsProjectsMobileOpen(false);
                    }}
                  >
                    Lost & Found
                  </Link>
                </div>
              )}
            </div> */}
            {isExecutive && (
              <Link
                href="/forms"
                className={`inline-flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-primary ${pathname.startsWith("/forms") ? "text-primary" : "text-muted-foreground"}`}
                onClick={() => setIsMenuOpen(false)}
              >
                <LayoutDashboard className="h-4 w-4" />
                Form Builder
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
            <div className="pt-2 border-t border-border">
              {userEmail ? (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground truncate max-w-[180px]">{userEmail}</span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={handleLogout}>
                    <LogOut className="h-3.5 w-3.5 mr-1" /> Logout
                  </Button>
                </div>
              ) : (
                <Link
                  href="/auth/login"
                  className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Login
                </Link>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
