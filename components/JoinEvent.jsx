import React from "react";

export default function JoinEvent({ event }) {
  return (
    <div className="bg-card border p-6 rounded-xl shadow-sm">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-card-foreground mb-2">
          Ticket Information
        </h3>
        <div className="text-3xl font-bold text-primary">{event.price}</div>
      </div>

      {/* Capacity */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-muted-foreground mb-2">Capacity</h4>
        <div className="flex items-center">
          <div className="flex-1 bg-muted rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{
                width: `${
                  (event?.registeredAttendees / event.capacity) * 100
                }%`,
              }}
            />
          </div>
          <span className="ml-4 text-sm text-muted-foreground">
            {event.registeredAttendees} / {event.capacity}
          </span>
        </div>
      </div>

      {/* Register Button */}
      <button className="w-full bg-primary text-primary-foreground py-3 px-6 rounded-lg font-medium hover:bg-primary/90 transition-colors">
        Register Now
      </button>
    </div>
  );
}
