"use client";
import Link from "next/link";
import { Github } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

export interface Contributor {
  login: string;
  avatar_url: string;
  html_url: string;
  contributions: number;
}

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
      >
        <Image
          src={contributor.avatar_url}
          alt={contributor.login}
          width={28}
          height={28}
          className="rounded-full transition-transform group-hover:scale-110"
        />
      </Link>

      {isHovering && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-popover shadow-md rounded-md p-2 text-left z-50 border border-border">
          <div className="flex items-center gap-2 mb-1">
            <Image
              src={contributor.avatar_url}
              alt={contributor.login}
              width={20}
              height={20}
              className="rounded-full"
            />
            <span className="font-medium text-sm truncate">
              {contributor.login}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            <p className="flex items-center gap-1">
              <span>Contributions: {contributor.contributions}</span>
            </p>
            <Link
              href={contributor.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 mt-1 text-primary hover:underline"
            >
              <Github size={12} />
              View GitHub Profile
            </Link>
          </div>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-popover border-r border-b border-border"></div>
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
    <div className="text-center">
      {contributors.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-2">
          {contributors.map((contributor) => (
            <ContributorCard
              key={contributor.login}
              contributor={contributor}
            />
          ))}
          <Link
            href="https://github.com/green-university-computer-club/gucc/graphs/contributors"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-7 h-7 rounded-full bg-muted text-muted-foreground hover:bg-primary/10 transition-colors"
            title="View all contributors"
          >
            <span>+</span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function Contributors() {
  const [contributors, setContributors] = useState<Contributor[]>([]);
  useEffect(() => {
    if (contributors.length === 0) {
      getContributors().then(setContributors);
    }
  }, []);

  return <ContributorsWrapper contributors={contributors} />;
}

async function getContributors() {
  const response = await fetch(
    "https://api.github.com/repos/green-university-computer-club/gucc/contributors",
  );
  const data = (await response.json()) as Contributor[];

  return data.slice(0, 8);
}
