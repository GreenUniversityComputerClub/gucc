import React from 'react';
import { Clock, CheckCircle, Calendar, XCircle } from 'lucide-react';

// Define the TimelineEvent type
interface TimelineEvent {
    time: string;
    title: string;
    description: string;
}

// Define status icons for different event states
const statusIcons = {
    completed: <CheckCircle className="h-4 w-4 text-green-500 animate-pulse" />,
    ongoing: <Clock className="h-4 w-4 text-blue-500 animate-pulse" />,
    upcoming: <Calendar className="h-4 w-4 text-gray-400 animate-pulse" />,
    canceled: <XCircle className="h-4 w-4 text-red-500 animate-pulse" />,
};

// Determine event status based on current time
const getStatus = (eventTime: string) => {
    const now = new Date();
    const [time, modifier] = eventTime.split(' ');
    let [hours, minutes] = time.split(':').map(Number);

    // Handle AM/PM conversion
    if (modifier === 'PM' && hours !== 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;

    const eventDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);

    // Return event status
    if (now > eventDate) return 'completed';
    if (now < eventDate) return 'upcoming';
    return 'ongoing';
};

// The main Timeline component
const UpcomingEventsTimeline: React.FC<{ timeline: TimelineEvent[] }> = ({ timeline }) => {
    if (!timeline || timeline.length === 0) {
        return <p>No timeline available.</p>;
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm p-6 w-full max-w-xl">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Event Timeline</h2>

            <div className="relative border-l-2 border-gray-200 pl-4">
                {timeline.map((event, index) => {
                    const status = getStatus(event.time);

                    return (
                        <div key={index} className="mb-6 last:mb-0 relative">
                            {/* Dynamic Icon based on event status */}
                            <div className="absolute -left-[28px]">
                                <div className="bg-white rounded-full p-1 border">
                                    {statusIcons[status] || statusIcons.upcoming}
                                </div>
                            </div>

                            {/* Event content */}
                            <h3 className="text-md font-medium text-gray-900">{event.title}</h3>
                            <p className="text-sm text-gray-600 mb-1">{event.time}</p>
                            <p className="text-sm text-gray-500">{event.description}</p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default UpcomingEventsTimeline;
