export const lostFoundCategories = [
  "Phone",
  "ID Card",
  "Laptop",
  "Wallet",
  "Keys",
  "Bag",
  "Notebook",
  "Headphones",
  "Charger",
  "Other",
];

export const lostFoundLocations = [
  "Main Gate",
  "A Building",
  "B Building",
  "Anex Building",
  "Library",
  "Cafeteria",
  "Auditorium",
  "Playground",
  "Parking",
  "Other",
];

export const lostFoundContactMethods = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "in_app", label: "In-app message" },
];

export const allowedStudentDomains = [
  "@green.edu.bd",
  "@green.ac.bd",
  "@student.green.ac.bd",
];

/**
 * Moderators are no longer a hard-coded email list: anyone holding the
 * lostfound.moderate permission (Administrator role, President, General Secretary, or a
 * position an administrator grants it to) can review posts. The migration
 * reports the previous list so its owner can be granted the permission.
 */
