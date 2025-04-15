"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X, Sun, Moon } from "lucide-react";
import Image from "next/image";
import { usePathname } from "next/navigation";

// Define a type for the theme
type Theme = 'light' | 'dark';

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // Initialize state based on localStorage or system preference
  const [theme, setTheme] = useState<Theme>('light'); // Default to light initially
  const pathname = usePathname();

  // Effect to set the initial theme and apply it
  useEffect(() => {
    // Check localStorage first
    const storedTheme = localStorage.getItem('theme') as Theme | null;
    let initialTheme: Theme;

    if (storedTheme && (storedTheme === 'light' || storedTheme === 'dark')) {
      initialTheme = storedTheme;
    } else {
      // Fallback to system preference
      initialTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? 'dark'
        : 'light';
    }

    setTheme(initialTheme); // Set the state

    // Apply the theme class to the document element
    if (initialTheme === 'dark') {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []); // Run only once on mount

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  // Function to toggle theme, update state, localStorage, and apply class
  const toggleDarkMode = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme); // Save preference

    if (newTheme === 'dark') {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  const isActive = (path: string) => {
    // Ensure pathname is not null before checking startsWith
    if (!pathname) return false;
    if (path === "/") return pathname === "/";
    // More robust check for active paths like /events/*
    return pathname.startsWith(path);
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
            priority // Add priority for LCP element
          // className="h-10 w-auto" // Consider removing if width/height are set
          />
          {/* <span className="hidden font-bold sm:inline-block">Green University Computer Club</span> */}
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          <Link
            href="/"
            className={`text-sm font-medium transition-colors hover:text-primary ${isActive("/") ? "text-primary font-semibold" : "text-muted-foreground"}`}
          >
            Home
          </Link>
          <Link
            href="/events"
            className={`text-sm font-medium transition-colors hover:text-primary ${isActive("/events") ? "text-primary font-semibold" : "text-muted-foreground"}`}
          >
            Events
          </Link>
          <Link
            href="/executives/2025" // Assuming 2025 is the current/default year
            className={`text-sm font-medium transition-colors hover:text-primary ${isActive("/executives") ? "text-primary font-semibold" : "text-muted-foreground"}`}
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
          <Button variant="ghost" size="icon" onClick={toggleDarkMode} aria-label="Toggle theme">
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>

          {/* ☰ Mobile Menu Button */}
          <Button variant="ghost" size="icon" className="md:hidden" onClick={toggleMenu} aria-label="Toggle menu">
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isMenuOpen && (
        <div className="container md:hidden py-4 border-t absolute top-full left-0 right-0 bg-background/95 backdrop-blur-sm shadow-md">
          <nav className="flex flex-col space-y-4">
            <Link
              href="/"
              className={`block px-4 py-2 text-sm font-medium transition-colors hover:text-primary ${isActive("/") ? "text-primary font-semibold" : "text-muted-foreground"}`}
              onClick={() => setIsMenuOpen(false)}
            >
              Home
            </Link>
            <Link
              href="/events"
              className={`block px-4 py-2 text-sm font-medium transition-colors hover:text-primary ${isActive("/events") ? "text-primary font-semibold" : "text-muted-foreground"}`}
              onClick={() => setIsMenuOpen(false)}
            >
              Events
            </Link>
            <Link
              href="/executives/2025"
              className={`block px-4 py-2 text-sm font-medium transition-colors hover:text-primary ${isActive("/executives") ? "text-primary font-semibold" : "text-muted-foreground"}`}
              onClick={() => setIsMenuOpen(false)}
            >
              Executives
            </Link>
            {/* <Button asChild className="mx-4 mt-2">
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
