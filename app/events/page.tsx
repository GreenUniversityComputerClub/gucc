import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import eventsData from "@/data/events.json"
const events = eventsData;

export default function EventsPage() {
  return (
    <div className="container py-12 md:py-24">
      <div className="space-y-4 text-center">
        <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">Events</h1>
        <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl">Explore our past and upcoming events</p>
      </div>

      <div className="grid gap-6 mt-12 md:grid-cols-2 lg:grid-cols-3">
        {events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((event, index) => (
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

