import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import eventsData from "@/data/events.json";
import { CalendarIcon, UserIcon } from "lucide-react";
import Image from "next/image";
const events = eventsData;

export default function EventsPage() {
  return (
    <div className="container mt-8 mb-12">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((event, index) => (
          <EventCard key={index} event={event} index={index} />
        ))}
      </div>
    </div>
  )
}

export function EventCard({ event, index }: {event: typeof eventsData[number], index: number}) {
  return (<Card  className="overflow-hidden flex flex-col h-full transition-all duration-200 hover:shadow-md">
    <div className="relative h-52 w-full">
      <Image 
        src={`/events/${event.sl}.jpg`}
        alt={event.name}
        fill
        className="object-cover"
        priority={index < 6}
      />
    </div>
    <CardHeader className="pb-2">
      <CardTitle className="line-clamp-2">{event.name}</CardTitle>
      <div className="flex items-center text-sm text-muted-foreground">
        <CalendarIcon className="mr-1 h-4 w-4" />
        <CardDescription>
          {new Date(event.date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}
          {event.time && (
            <span className="ml-1">• {event.time}</span>
          )}
        </CardDescription>
      </div>
    </CardHeader>
    <CardContent className="pt-0 flex-grow flex flex-col justify-between">
      {event.guest && (
        <div className="mt-2">
          <div className="flex items-center text-sm font-medium">
            <UserIcon className="mr-1 h-4 w-4" />
            <span>Guests</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1 line-clamp-3">{event.guest}</p>
        </div>
      )}
    </CardContent>
  </Card>)
}