import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { CalendarIcon, UserIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export function UpcomingEventCard({
    event,
    index,
}: {
    event: {
        sl: number;
        name: string;
        date: string;
        endDate: string;
        time?: string;
        participants?: number | null;
        guest: string;
        year: number;
        organizer: string;
        category: string;
    };
    index: number;
}) {
    const slug = event.name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^\w-]+/g, "");

    return (
        <Card className="overflow-hidden flex flex-col h-full transition-all duration-200 hover:shadow-md">
            <div className="relative h-52 w-full">
                <Link href={`/events/${slug}`}>
                    <Image
                        src={`/events/${event.sl}.jpg`}
                        alt={event.name}
                        fill
                        className="object-cover"
                        priority={index < 6}
                    />
                </Link>
            </div>
            <CardHeader className="pb-2">
                <CardTitle className="line-clamp-2">{event.name}</CardTitle>
                <div className="flex items-center text-sm text-muted-foreground">
                    <CalendarIcon className="mr-1 h-4 w-4" />
                    <CardDescription>
                        {new Date(event.date).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                        })}
                        {event.time && <span className="ml-1">• {event.time}</span>}
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
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-3">
                            {event.guest}
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}