"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X, Sun, Moon } from "lucide-react";
import Image from "next/image";
import { usePathname } from "next/navigation";

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
   
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setIsDarkMode(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    if (!isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  const isActive = (path: string) => {
    return pathname === path;
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center space-x-2">
          <Image
            src="/gucc-logo.png"
            alt="GUCC Logo"
            width={220}
            height={40}
            // className="h-10 w-auto"
          />
          {/* <span className="hidden font-bold sm:inline-block">Green University Computer Club</span> */}
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          <Link
            href="/"
            className={`text-sm font-medium transition-colors hover:text-primary ${isActive("/") ? "text-primary" : ""}`}
          >
            Home
          </Link>
          <Link
            href="/events"
            className={`text-sm font-medium transition-colors hover:text-primary ${isActive("/events") ? "text-primary" : ""}`}
          >
            Events
          </Link>
          <Link
            href="/executives"
            className={`text-sm font-medium transition-colors hover:text-primary ${isActive("/executives") ? "text-primary" : ""}`}
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
          <Button variant="ghost" size="icon" onClick={toggleDarkMode}>
            {isDarkMode ? <Sun className="h-6 w-6" /> : <Moon className="h-6 w-6" />}
          </Button>

          {/* ☰ Mobile Menu Button */}
          <Button variant="ghost" size="icon" className="md:hidden" onClick={toggleMenu}>
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isMenuOpen && (
        <div className="container md:hidden py-4 border-t">
          <nav className="flex flex-col space-y-4">
            <Link
              href="/"
              className={`text-sm font-medium transition-colors hover:text-primary ${isActive("/") ? "text-primary" : ""}`}
              onClick={() => setIsMenuOpen(false)}
            >
              Home
            </Link>
            <Link
              href="/events"
              className={`text-sm font-medium transition-colors hover:text-primary ${isActive("/events") ? "text-primary" : ""}`}
              onClick={() => setIsMenuOpen(false)}
            >
              Events
            </Link>
            <Link
              href="/executives"
              className={`text-sm font-medium transition-colors hover:text-primary ${isActive("/executives") ? "text-primary" : ""}`}
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
