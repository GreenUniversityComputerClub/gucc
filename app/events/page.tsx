import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

// Event data
const events = [
  { name: "Departmental Tour", date: "2nd Jan 2024" },
  { name: "Intra Department Programming Contest-2024 (Team-Contest)", date: "16th Feb 2024" },
  { name: "Fresher's Orientation Spring 2024", date: "27th Feb 2024" },
  { name: "Pitha Uthsob and Cultural Program", date: "3rd Mar 2024" },
  { name: "Iftar Mahfil", date: "13th Mar 2024" },
  { name: "CSE Carnival 2024", date: "1st Apr 2024" },
  { name: 'Seminar on "Mastering Flutter: Building Cross-Platform Apps with Finesse"', date: "4th Apr 2024" },
  { name: "Intra University Programming Contest-2024", date: "1st May 2024" },
  { name: "Seminar on Research and Publication", date: "17th May 2024" },
  { name: "Green University Gaming Battle", date: "1st Jun 2024" },
  { name: "Leadership Workshop (Collaboration with CETL)", date: "16th Jun 2024" },
]

export default function EventsPage() {
  return (
    <div className="container py-12 md:py-24">
      <div className="space-y-4 text-center">
        <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">Events</h1>
        <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl">Explore our past and upcoming events</p>
      </div>

      <div className="grid gap-6 mt-12 md:grid-cols-2 lg:grid-cols-3">
        {events.map((event, index) => (
          <Card key={index} className="overflow-hidden">
            <div className="h-48 bg-primary/10 flex items-center justify-center">
              <span className="text-4xl font-bold text-primary">{event.date.split(" ")[0]}</span>
            </div>
            <CardHeader>
              <CardTitle>{event.name}</CardTitle>
              <CardDescription>{event.date}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Join us for this exciting event organized by GUCC.</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

