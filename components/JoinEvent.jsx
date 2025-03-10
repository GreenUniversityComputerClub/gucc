import React from "react";

export default function JoinEvent({ event }) {
  return (
    <div className="bg-gray-50 p-6 rounded-xl">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-gray-900 mb-2">
          Ticket Information
        </h3>
        <div className="text-3xl font-bold text-indigo-600">{event.price}</div>
      </div>

      {/* Capacity */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-500 mb-2">Capacity</h4>
        <div className="flex items-center">
          <div className="flex-1 bg-gray-200 rounded-full h-2">
            <div
              className="bg-indigo-600 h-2 rounded-full"
              style={{
                width: `${
                  (event?.registeredAttendees / event.capacity) * 100
                }%`,
              }}
            />
          </div>
          <span className="ml-4 text-sm text-gray-600">
            {event.registeredAttendees} / {event.capacity}
          </span>
        </div>
      </div>

      {/* Register Button */}
      <button className="w-full bg-indigo-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-indigo-700 transition-colors">
        Register Now
      </button>
    </div>
  );
}
