// Configuration constants for the application
export const RESIZE_AVATAR = false; // Set to true to enable avatar resizing mode

// Shared timezone config
export const TIMEZONE = {
	tz: 'Asia/Dhaka',
	label: 'BST',
} as const

// Hackathon/Event info
export const HACKATHON = {
	name: 'HackTheAI',
	organizer: 'GUCC',
	poweredBy: 'SmythOS',
	participantsExpected: 800,
	universitiesCount: 50,
	prizePoolUSD: 600,
	jobOffers: 5,
	showExtendedRibbon: true,
	location: 'Green University of Bangladesh',
} as const

// Schedule (Bangladesh time)
export const HACKATHON_SCHEDULE = {
	registrationDeadline: new Date('2025-09-13T20:00:00+06:00'),
	prelimStart: new Date('2025-09-14T00:00:00+06:00'),
	prelimEnd: new Date('2025-09-15T23:59:59+06:00'),
	finalOnlineStart: new Date('2025-09-22T00:00:00+06:00'),
	finalOnlineEnd: new Date('2025-09-24T23:59:59+06:00'),
	finalOnsiteStart: new Date('2025-09-25T09:00:00+06:00'),
	finalOnsiteEnd: new Date('2025-09-25T18:00:00+06:00'),
} as const
