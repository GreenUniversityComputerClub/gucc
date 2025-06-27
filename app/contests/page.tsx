'use client';

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

function ContestTableRow({ contest }: { contest: Contest }) {
  const router = useRouter();
  const bestPerformance = contest.teams.reduce(
    (best, team) => ({
      rank: team.rank !== null && (best.rank === null || team.rank < best.rank) ? team.rank : best.rank,
    }),
    { rank: null as number | null }
  );

  return (
    <TableRow
      className="cursor-pointer hover:bg-muted/50"
      onClick={() => router.push(`/contests/${contest.id}`)}
    >
      <TableCell>{contest.timestamp}</TableCell>
      <TableCell>
        <div>
          <p className="font-medium">{contest.title}</p>
          <Badge variant="outline" className="mt-1">
            {contest.type}
          </Badge>
        </div>
      </TableCell>
      <TableCell>
        <div className="space-y-1">
          {contest.teams.map((team) => (
            <p key={team.name} className="text-sm">
              {team.name}
            </p>
          ))}
        </div>
      </TableCell>
      <TableCell>{bestPerformance.rank || "N/A"}</TableCell>
    </TableRow>
  );
}

export default function ContestsPage() {
  // Only show contests where GUBIAN participated (has teams)
  const contests = (contestsData.contests as unknown as Contest[]).filter(
    (contest) => contest.teams?.length > 0
  );

  // Sort contests by date in descending order (latest first)
  const sortedContests = contests.sort((a, b) => {
    const dateA = new Date(a.timestamp);
    const dateB = new Date(b.timestamp);
    return dateB.getTime() - dateA.getTime();
  });

  return (
    <div className="container mx-auto py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">GUBIAN Contest History</h1>
          <p className="text-muted-foreground">
            A list of programming contests where GUBIAN teams participated
          </p>
        </div>
      </div>

      <div className="rounded-md border">
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
              <ContestTableRow key={contest.id} contest={contest} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
