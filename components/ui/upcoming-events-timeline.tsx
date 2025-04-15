import React, { useState } from 'react';
import { Tooltip } from 'react-tooltip';
import { Clock, CheckCircle, Calendar, XCircle } from 'lucide-react';

// Define the TimelineEvent type
interface TimelineEvent {
    time: string;
    title: string;
    description: string;
    status?: string;
}

// Define status icons for different event states
const statusIcons = {
    completed: (
        <>
            <CheckCircle className="h-4 w-4 text-green-500 animate-pulse" data-tooltip-id="status-tooltip" data-tooltip-content="Completed" />
            <Tooltip id="status-tooltip" />
        </>
    ),
    ongoing: (
        <>
            <Clock className="h-4 w-4 text-blue-500 animate-pulse" data-tooltip-id="status-tooltip" data-tooltip-content="Ongoing" />
            <Tooltip id="status-tooltip" />
        </>
    ),
    upcoming: (
        <>
            <Calendar className="h-4 w-4 text-gray-400 animate-pulse" data-tooltip-id="status-tooltip" data-tooltip-content="Upcoming" />
            <Tooltip id="status-tooltip" />
        </>
    ),
    canceled: (
        <>
            <XCircle className="h-4 w-4 text-red-500 animate-pulse" data-tooltip-id="status-tooltip" data-tooltip-content="Canceled" />
            <Tooltip id="status-tooltip" />
        </>
    ),
};

// Determine event status based on current time or event status
const getStatus = (eventTime: string, eventStatus?: string) => {
    if (eventStatus) {
        return eventStatus;
    }

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

// Function to generate a random RGBA color with low alpha
const getRandomRGBA = () => {
    const r = Math.floor(Math.random() * 256);
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    return `rgba(${r}, ${g}, ${b}, 0.09)`; // Low alpha (0.09)
};

// Function to truncate description
const truncateDescription = (description: string, maxLength: number) => {
    if (description.length > maxLength) {
        return description.substring(0, maxLength) + '...';
    }
    return description;
};

// The main Timeline component
const UpcomingEventsTimeline: React.FC<{ timeline: TimelineEvent[] }> = ({ timeline }) => {
    if (!timeline || timeline.length === 0) {
        return <p className="text-gray-700 dark:text-gray-300">No timeline available.</p>;
    }

    // Calculate line colors outside map
    const lineColors = timeline.map((event) => {
        const status = getStatus(event.time, event.status) as keyof typeof statusIcons;
        let colorClass = 'border-gray-200'; // Default color
        if (status === 'completed') colorClass = 'border-green-500';
        if (status === 'ongoing') colorClass = 'border-blue-500';
        if (status === 'canceled') colorClass = 'border-red-500';
        return colorClass;
    });

    return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-6 w-full max-w-xl">
            <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100">Event Timeline</h2>

            <div className={`relative border-l-2 ${lineColors[0]} dark:border-gray-700 pl-4`}>
                {timeline.map((event, index) => {
                    const status = getStatus(event.time, event.status) as keyof typeof statusIcons;
                    const randomRGBA = getRandomRGBA(); // Generate random RGBA color
                    const [showFullDescription, setShowFullDescription] = useState(false);
                    const truncatedDescription = truncateDescription(event.description, 50);

                    const toggleDescription = () => {
                        setShowFullDescription(!showFullDescription);
                    };

                    return (
                        <div key={index} className={`mb-6 pb-3 rounded-sm last:mb-0 relative p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors duration-200 ${status === 'canceled' ? 'relative' : ''}`} style={{ backgroundColor: randomRGBA }}>
                            {/* Canceled overlay */}
                            {status === 'canceled' && (
                                <div className="absolute inset-0 bg-red-200 dark:bg-red-900 opacity-50 pointer-events-none"></div>
                            )}
                            {/* Dynamic Icon based on event status */}
                            <div className="absolute -left-[29px]">
                                <div className="bg-white dark:bg-gray-800 rounded-full p-1 border dark:border-gray-600">
                                    {statusIcons[status]}
                                </div>
                            </div>

                            {/* Event content */}
                            <h3 className={`text-lg font-semibold text-gray-900 dark:text-gray-100 ml-2 mb-1 ${status === 'canceled' ? 'line-through text-gray-500 dark:text-gray-400' : ''}`}>
                                {event.title}
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-300 mb-1 ml-2">{event.time}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                                {showFullDescription ? event.description : truncatedDescription}
                                {event.description.length > 50 && (
                                    <button className="text-blue-500 dark:text-blue-400 ml-1" onClick={toggleDescription}>
                                        {showFullDescription ? 'Read Less' : 'Read More'}
                                    </button>
                                )}
                            </p>

                            {/* Apply line color segment */}
                            {index < timeline.length - 1 && (
                                <div className="absolute left-0 top-full h-full w-0.5"
                                    style={{
                                        borderLeft: `2px solid`,
                                        borderLeftColor: lineColors[index + 1].split('-')[1] ? `rgb(var(--${lineColors[index + 1].split('-')[1]}))` : 'rgb(var(--gray-200))',
                                        transform: 'translateY(-10px)', zIndex: -1
                                    }}
                                />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default UpcomingEventsTimeline;