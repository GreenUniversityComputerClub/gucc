"use client";

import Link from "next/link";
import { Github } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { STATIC_CONTRIBUTORS, type Contributor } from "@/data/contributors";

export type { Contributor };

export function ContributorCard({ contributor }: { contributor: Contributor }) {
  const [isHovering, setIsHovering] = useState(false);

  return (
    <div
      className="relative group"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <Link
        href={contributor.html_url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${contributor.name || contributor.login} - ${contributor.contributions} contributions`}
        className="block"
      >
        <Image
          src={contributor.avatar_url}
          alt={contributor.name || contributor.login}
          width={28}
          height={28}
          className="rounded-full ring-1 ring-border hover:ring-2 hover:ring-primary/80 transition-all duration-200 group-hover:scale-110 object-cover"
        />
      </Link>

      {isHovering && (
        <div
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 w-52 bg-popover text-popover-foreground shadow-lg rounded-lg p-3 text-left z-50 border border-border animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center gap-2.5 mb-2">
            <Image
              src={contributor.avatar_url}
              alt={contributor.name || contributor.login}
              width={28}
              height={28}
              className="rounded-full ring-1 ring-border object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-xs truncate leading-tight text-foreground">
                {contributor.name || contributor.login}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                @{contributor.login}
              </p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground space-y-1.5 pt-1 border-t border-border/50">
            <p className="flex items-center justify-between text-[11px]">
              <span>Contributions:</span>
              <span className="font-semibold text-primary">
                {contributor.contributions}
              </span>
            </p>
            <Link
              href={contributor.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[11px] text-primary hover:underline font-medium pt-0.5"
            >
              <Github size={12} />
              <span>View GitHub Profile</span>
            </Link>
          </div>
          {/* Arrow */}
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 rotate-45 w-2 h-2 bg-popover border-r border-b border-border" />
        </div>
      )}
    </div>
  );
}

export function ContributorsWrapper({
  contributors,
}: {
  contributors: Contributor[];
}) {
  return (
    <div className="text-center w-full">
      {contributors.length > 0 ? (
        <div className="flex flex-wrap justify-center items-center gap-2 max-w-xl mx-auto">
          {contributors.map((contributor) => (
            <ContributorCard
              key={contributor.login}
              contributor={contributor}
            />
          ))}
          <Link
            href="https://github.com/GreenUniversityComputerClub/gucc/graphs/contributors"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-7 h-7 rounded-full bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors text-xs font-semibold ring-1 ring-border"
            title="View all contributors on GitHub"
          >
            <span>+</span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function Contributors() {
  const [contributors, setContributors] =
    useState<Contributor[]>(STATIC_CONTRIBUTORS);

  useEffect(() => {
    let isMounted = true;

    async function fetchLiveContributors() {
      try {
        const res = await fetch("/api/contributors");
        if (res.ok) {
          const data = (await res.json()) as Contributor[];
          if (isMounted && Array.isArray(data) && data.length > 0) {
            setContributors(data);
          }
        }
      } catch (err) {
        console.error("Failed to fetch fresh contributors:", err);
      }
    }

    fetchLiveContributors();

    return () => {
      isMounted = false;
    };
  }, []);

  return <ContributorsWrapper contributors={contributors} />;
}
