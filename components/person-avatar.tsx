import Link from "next/link";
import { Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";

const SIZES = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-lg",
  xl: "h-24 w-24 text-2xl sm:h-28 sm:w-28",
} as const;

/**
 * A person's photo, or their initials when there is none (or it fails to load). The name is
 * always shown next to it, so the image itself is decorative; with `href` the photo links to
 * their profile and says so to screen readers.
 */
const DOTS = { xs: "h-2 w-2", sm: "h-2.5 w-2.5", md: "h-3 w-3", lg: "h-3.5 w-3.5", xl: "h-4 w-4" } as const;

export function PersonAvatar({ name, url, size = "sm", href, className, online, group }: {
  name: string | null | undefined;
  url?: string | null;
  size?: keyof typeof SIZES;
  href?: string | null;
  className?: string;
  /** Show the green "active now" dot. */
  online?: boolean;
  /** A group conversation without a photo shows a group sign instead of initials. */
  group?: boolean;
}) {
  const avatar = (
    <Avatar className={cn(SIZES[size], "border bg-background", className)}>
      {url ? <AvatarImage src={url} alt="" className="object-cover" loading="lazy" decoding="async" /> : null}
      <AvatarFallback delayMs={url ? 500 : 0} className="bg-primary/10 font-semibold text-primary">
        {group ? <Users className="h-1/2 w-1/2" aria-hidden /> : initials(name)}
      </AvatarFallback>
    </Avatar>
  );
  const face = online === undefined ? avatar : (
    <span className="relative inline-flex shrink-0">
      {avatar}
      <span className={cn("absolute bottom-0 right-0 rounded-full ring-2 ring-background transition-colors", DOTS[size], online ? "bg-emerald-500" : "bg-transparent ring-0")} aria-hidden />
      {online && <span className="sr-only">(active now)</span>}
    </span>
  );
  if (!href) return face;
  return (
    <Link href={href} prefetch={false} aria-label={`${name ?? "Member"}: profile`} className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
      {face}
    </Link>
  );
}
