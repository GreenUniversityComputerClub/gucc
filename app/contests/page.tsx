'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trophy } from "lucide-react";
import Link from "next/link";
import contestsData from "@/data/contests.json";

interface Team {
  name: string;
  members: string[];
  rank: number | null;
  achievement: string;
}

interface Contest {
  id: number;
  type: "IUPC" | "ICPC" | "NCPC" | "IDPC" | "Hackathon" | "CodeSamurai" | "CP";
  timestamp: string;
  title: string;
  teams: Team[];
  images: string[];
  contestLink: string;
  problemsetLink: string;
  standingsLink: string;
  editorialLink?: string;
  practiceLink?: string;
  authors?: string;
  platform?: string;
}

/** Best (lowest) rank achieved across a contest's teams, if any placed. */
function bestRank(contest: Contest): number | null {
  return contest.teams.reduce<number | null>(
    (best, team) =>
      team.rank !== null && (best === null || team.rank < best) ? team.rank : best,
    null
  );
}

function teamNames(contest: Contest): string[] {
  return contest.teams.map((team) => team.name).filter((name) => name && name !== "N/A");
}

/**
 * Desktop row. The title carries a stretched link, so the whole row is
 * clickable while staying a real anchor — keyboard focusable and crawlable,
 * which an onClick handler is not.
 */
function ContestRow({ contest }: { contest: Contest }) {
  const rank = bestRank(contest);
  const teams = teamNames(contest);

  return (
    <TableRow className="relative cursor-pointer hover:bg-muted/50 focus-within:bg-muted/50">
      <TableCell className="whitespace-nowrap align-top text-muted-foreground">
        {contest.timestamp}
      </TableCell>
      <TableCell className="align-top">
        <Link
          href={`/contests/${contest.id}`}
          className="font-medium after:absolute after:inset-0 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          {contest.title}
        </Link>
        <div className="mt-1">
          <Badge variant="outline">{contest.type}</Badge>
        </div>
      </TableCell>
      <TableCell className="align-top">
        <div className="space-y-1">
          {teams.length > 0 ? (
            teams.map((name) => (
              <p key={name} className="text-sm">
                {name}
              </p>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </div>
      </TableCell>
      <TableCell className="align-top font-medium">
        {rank ?? <span className="text-muted-foreground">N/A</span>}
      </TableCell>
    </TableRow>
  );
}

/** Mobile card. A four-column table is unreadable at phone widths. */
function ContestCard({ contest }: { contest: Contest }) {
  const rank = bestRank(contest);
  const teams = teamNames(contest);

  return (
    <Link
      href={`/contests/${contest.id}`}
      className="block rounded-lg border bg-card p-4 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <Badge variant="outline" className="shrink-0">
          {contest.type}
        </Badge>
        <span className="shrink-0 text-xs text-muted-foreground">
          {contest.timestamp}
        </span>
      </div>

      <h2 className="mt-2 font-medium leading-snug">{contest.title}</h2>

      {teams.length > 0 && (
        <p className="mt-2 text-sm text-muted-foreground">{teams.join(", ")}</p>
      )}

      {rank !== null && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium">
          <Trophy className="h-4 w-4 text-primary" aria-hidden="true" />
          Best rank {rank}
        </p>
      )}
    </Link>
  );
}

export default function ContestsPage() {
  const contests = (contestsData.contests as unknown as Contest[]).filter(
    (contest) => contest.teams?.length > 0
  );

  // Copy before sorting: `contestsData` is a shared module import, and sorting
  // in place would mutate it for every other page in the same server process.
  const sortedContests = [...contests].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <div className="container mx-auto py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
          GUBIAN Contest History
        </h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Programming contests where Green University of Bangladesh teams
          competed — {sortedContests.length} contests including ICPC, IUPC, NCPC
          and hackathons.
        </p>
      </header>

      {sortedContests.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
          No contests recorded yet.
        </p>
      ) : (
        <>
          {/* Cards on phones, table from md up. */}
          <div className="grid gap-3 md:hidden">
            {sortedContests.map((contest) => (
              <ContestCard key={contest.id} contest={contest} />
            ))}
          </div>

          <div className="hidden rounded-md border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Contest</TableHead>
                  <TableHead>Teams</TableHead>
                  <TableHead>Best Rank</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedContests.map((contest) => (
                  <ContestRow key={contest.id} contest={contest} />
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
