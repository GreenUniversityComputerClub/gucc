import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import Link from "next/link";
import contestsData from "@/data/contests.json";
import { notFound } from "next/navigation";

interface Team {
  name: string;
  members: string[];
  rank: number;
  solved: number;
}

interface Contest {
  id: number;
  type: "IUPC" | "ICPC" | "NCPC";
  timestamp: string;
  title: string;
  teams: Team[];
  images: string[];
  contestLink: string;
  problemsetLink: string;
  standingsLink: string;
  editorialLink?: string;
  practiceLink?: string;
}

export default async function ContestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contest = (contestsData.contests as Contest[]).find(
    (c) => c.id === parseInt(id)
  );

  if (!contest) {
    notFound();
  }

  return (
    <div className="container mx-auto py-10">
      <div className="mb-8">
        <Button variant="ghost" asChild>
          <Link href="/contests">← Back to Contests</Link>
        </Button>
      </div>

      <div className="space-y-8">
        {/* Contest Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{contest.title}</h1>
          <div className="mt-2 flex items-center gap-4">
            <Badge variant="outline">{contest.type}</Badge>
            <p className="text-muted-foreground">{contest.timestamp}</p>
          </div>
        </div>

        {/* Team Performance */}
        <div className="grid gap-6 md:grid-cols-2">
          {contest.teams.map((team) => (
            <Card key={team.name}>
              <CardHeader>
                <CardTitle>{team.name}</CardTitle>
                <CardDescription>Rank: {team.rank} | Solved: {team.solved}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <h4 className="font-medium">Team Members</h4>
                  <ul className="list-disc list-inside text-muted-foreground">
                    {team.members.map((member) => (
                      <li key={member}>{member}</li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Contest Links */}
        <Card>
          <CardHeader>
            <CardTitle>Contest Resources</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Button asChild>
                <Link href={contest.contestLink}>Contest Page</Link>
              </Button>
              <Button asChild>
                <Link href={contest.problemsetLink}>Problem Set</Link>
              </Button>
              <Button asChild>
                <Link href={contest.standingsLink}>Standings</Link>
              </Button>
              {contest.editorialLink && (
                <Button variant="outline" asChild>
                  <Link href={contest.editorialLink}>Editorial</Link>
                </Button>
              )}
              {contest.practiceLink && (
                <Button variant="outline" asChild>
                  <Link href={contest.practiceLink}>Practice</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Contest Images */}
        {contest.images.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Photos</h2>
            <div className="grid gap-6 md:grid-cols-2">
              {contest.images.map((image, index) => (
                <div
                  key={index}
                  className="relative aspect-video overflow-hidden rounded-lg border"
                >
                  <Image
                    src={image}
                    alt={`Contest photo ${index + 1}`}
                    fill
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 