import eventsData from "@/data/events.json";
import upcomingEventsData from "@/data/upcoming-events.json";

// Define the structure of an event object
interface Event {
    sl: number;
    name: string;
    category?: string;
    organizer?: string;
    description?: string;
    location?: string;
    participants?: number | null;
    ticket_info?: string;
    date: string;
    time: string;
    guest?: string;
    isUpcoming?: boolean;
}

/**
 * Retrieves all events by combining data from eventsData and upcomingEventsData.
 * @returns An array of Event objects.
 */
export function getAllEvents(): Event[] {
    const allEvents: Event[] = [...eventsData, ...upcomingEventsData];
    return allEvents;
}

/**
 * Parses guest information from a text string.
 * The string is expected to have a "Chief Guest" entry and other guests listed with their title and name.
 * @param guestText - The text containing guest information.
 * @returns An object containing the chief guest's name and an array of other guests with their titles and names.
 */
export function parseGuests(guestText: string | undefined): {
    chiefGuest: string | null;
    otherGuests: { title: string; name: string }[];
} {
    const text = guestText || "";
    const chiefGuestMatch = text.match(/Chief Guest: ([^\n]+)/);
    const chiefGuest = chiefGuestMatch ? chiefGuestMatch[1] : null;
    const otherGuests = text
        .split("\n")
        .filter((guest) => guest && !guest.includes("Chief Guest:"))
        .map((guest) => {
            // Map each guest line to an object with title and name
            const [title, ...nameParts] = guest.split(": ");
            return { title: title?.trim() || "", name: nameParts.join(": ")?.trim() || "" };
        });

    return { chiefGuest, otherGuests };
}