import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import eventsData from "@/data/events.json"
import Image from "next/image"
const events = eventsData;

export default function EventsPage() {
  return (
    <div className="container mt-8 mb-12">
        {/* <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl">Explore our past and upcoming events</p> */}
      <div className="grid gap-6 mt-8 md:grid-cols-2 lg:grid-cols-3">
        {events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((event, index) => (
          <Card key={index} className="overflow-hidden">
            <div className="relative h-48 w-full">
              <Image 
                src={`/events/${event.sl}.jpg`}
                alt={event.name}
                fill
                className="object-cover"
                priority={index < 6}
              />
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

