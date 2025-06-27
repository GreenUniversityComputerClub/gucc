"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const isActive = (path: string) => {
    if (path === "/executives/2025") {
      return pathname.startsWith("/executives");
    }
    return pathname === path;
  };

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
          <Link
            href="/blog"
            className={`text-sm font-medium transition-colors hover:text-primary ${isActive("/blog") ? "text-primary" : "text-muted-foreground"}`}
          >
            Blog
          </Link>
          <Link
            href="/executives/2025"
            className={`text-sm font-medium transition-colors hover:text-primary ${isActive("/executives/2025") ? "text-primary" : "text-muted-foreground"}`}
          >
            Executives
          </Link>
          {/* <Button asChild>
            <Link href="https://forms.gle/example" target="_blank" rel="noopener noreferrer">
              Join Us
            </Link>
          </Button> */}
        </nav>

        {/* Dark Mode & Mobile Menu Button */}
        <div className="flex items-center space-x-3">
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
            <Link
              href="/blog"
              className={`text-sm font-medium transition-colors hover:text-primary ${isActive("/blog") ? "text-primary" : "text-muted-foreground"}`}
              onClick={() => setIsMenuOpen(false)}
            >
              Blog
            </Link>
            <Link
              href="/executives/2025"
              className={`text-sm font-medium transition-colors hover:text-primary ${isActive("/executives/2025") ? "text-primary" : "text-muted-foreground"}`}
              onClick={() => setIsMenuOpen(false)}
            >
              Executives
            </Link>
            {/* <Button asChild>
              <Link
                href="https://forms.gle/example"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsMenuOpen(false)}
              >
                Join Us
              </Link>
            </Button> */}
          </nav>
        </div>
      )}
    </header>
  );
}
