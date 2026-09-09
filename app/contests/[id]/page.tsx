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
import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata, truncate } from "@/lib/seo/metadata";
import { breadcrumbSchema, graph, itemListSchema, webPageSchema } from "@/lib/seo/schema";

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

const allContests = contestsData.contests as unknown as Contest[];

function findContest(id: string): Contest | undefined {
  return allContests.find((contest) => contest.id === parseInt(id));
}

export async function generateStaticParams() {
  return allContests.map((contest) => ({ id: String(contest.id) }));
}

/** "GubZeroFactorial (rank 95)" — the detail that makes a snippet useful. */
function describeTeams(contest: Contest): string {
  return contest.teams
    .filter((team) => team.name && team.name !== "N/A")
    .map((team) => (team.rank ? `${team.name} (rank ${team.rank})` : team.name))
    .join(", ");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const contest = findContest(id);

  if (!contest) {
    return buildMetadata({
      title: "Contest not found",
      description: "This GUCC contest record could not be found.",
      path: `/contests/${id}`,
      noIndex: true,
    });
  }

  const teams = describeTeams(contest);

  return buildMetadata({
    // Contest titles run long ("… at Rajshahi University of Engineering &
    // Technology (RUET)"); trimmed so the brand suffix still fits the SERP.
    title: `${truncate(contest.title, 46)} — ${contest.type}`,
    description: `Green University of Bangladesh at ${contest.title} (${contest.type}, ${contest.timestamp})${teams ? `. GUCC teams: ${teams}` : ""}. Team members, ranks and standings from the Green University Computer Club contest archive.`,
    path: `/contests/${id}`,
    keywords: [
      contest.title,
      contest.type,
      `${contest.type} Bangladesh`,
      "GUCC contests",
      "Green University programming team",
      "competitive programming Bangladesh",
    ],
    image: {
      eyebrow: `${contest.type} · ${contest.timestamp}`,
      title: contest.title.slice(0, 80),
      subtitle: teams.slice(0, 120),
    },
  });
}

export default async function ContestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contest = findContest(id);

  if (!contest) {
    notFound();
  }

  return (
    <div className="container mx-auto py-10">
      <JsonLd
        id={`contest-${id}-schema`}
        data={graph(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Contests", path: "/contests" },
            { name: contest.title, path: `/contests/${id}` },
          ]),
          webPageSchema({
            name: `${contest.title} — ${contest.type}`,
            description: `Green University Computer Club participation in ${contest.title} (${contest.type}, ${contest.timestamp}).`,
            path: `/contests/${id}`,
          }),
          itemListSchema(
            `GUCC teams at ${contest.title}`,
            contest.teams.map((team) => ({
              name: team.name,
              node: {
                "@type": "SportsTeam",
                name: team.name,
                member: team.members.map((member) => ({
                  "@type": "Person",
                  name: member.replace(/\.$/, ""),
                })),
              },
            }))
          )
        )}
      />
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
                    sizes="(max-width: 768px) 100vw, 50vw"
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