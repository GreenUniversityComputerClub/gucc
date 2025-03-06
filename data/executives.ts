export interface FacultyMember {
  position: string
  name: string
  designation: string
}

export interface StudentExecutive {
  position: string
  name: string
  studentId: string
}

export interface ExecutiveYear {
  year: string
  facultyMembers: FacultyMember[]
  studentExecutives: StudentExecutive[]
}

// Array of executives by year
export const executivesByYear: ExecutiveYear[] = [
  {
    year: "2021",
    facultyMembers: [
      {
        position: "Moderator",
        name: "Ahmed Iqbal Pritom",
        designation: "Senior Lecturer",
      },
      {
        position: "Deputy Moderator",
        name: "Sultana Umme Habiba",
        designation: "Lecturer",
      },
    ],
    studentExecutives: [
      {
        position: "President",
        name: "Najmus Sakib Sizan",
        studentId: "183002xxx", // Student ID not visible in image
      },
      {
        position: "Vice President",
        name: "Md. Ariful Hoque Yash",
        studentId: "183002xxx",
      },
      {
        position: "General Secretary",
        name: "Sajib Miah",
        studentId: "183002xxx",
      },
      {
        position: "Joint General Secretary",
        name: "Md. Mohtamim Islam Nayeem",
        studentId: "193015047",
      },
      {
        position: "Treasurer",
        name: "Diganta Dey",
        studentId: "183002xxx",
      },
      {
        position: "Joint Treasurer",
        name: "Mahabub Sajid Habib",
        studentId: "183002xxx",
      },
      {
        position: "Organizing Secretary",
        name: "MD Zahidul Hasan",
        studentId: "183002076",
      },
      {
        position: "Joint Organizing Secretary",
        name: "MD. Iqbal Jahan",
        studentId: "191002281",
      },
      {
        position: "Programming Secretary",
        name: "MD. Nasir Hossain Hridoy",
        studentId: "183002xxx",
      },
      {
        position: "Joint Programming Secretary",
        name: "K M Farhat Snigdah",
        studentId: "183002xxx",
      },
      {
        position: "Information Secretary",
        name: "MD. Rahul Reza",
        studentId: "191002067",
      },
      {
        position: "Joint Information Secretary",
        name: "MD. Jahid Hassan",
        studentId: "201002463",
      },
      {
        position: "Cultural Secretary",
        name: "Bithy Roy",
        studentId: "183002xxx",
      },
      {
        position: "Joint Cultural Secretary",
        name: "Sabikun Nahar Sharna",
        studentId: "183002xxx",
      },
      {
        position: "Office Secretary & Graphic Designer",
        name: "Fahad Bin Kamal Anik",
        studentId: "183002xxx",
      },
      {
        position: "Sports Secretary",
        name: "Neamul Nasir Jony",
        studentId: "183002xxx",
      },
      {
        position: "Joint Sports Secretary",
        name: "Shahriar Mahmud",
        studentId: "183002xxx",
      },
      {
        position: "Publication Secretary",
        name: "Kamrujjaman Shamim",
        studentId: "193002044",
      },
      {
        position: "Joint Publication Secretary",
        name: "MD Sakhawat Hossain Rabbi",
        studentId: "201002311",
      },
    ],
  },
  {
    year: "2022",
    facultyMembers: [
      {
        position: "Moderator",
        name: "Mr. Ahmed Iqbal Pritom",
        designation: "Sr. Lecturer",
      },
      {
        position: "Deputy Moderator",
        name: "Ms. Sultana Umme Habiba",
        designation: "Lecturer",
      },
    ],
    studentExecutives: [
      {
        position: "President",
        name: "Md. Iqbal Jahan",
        studentId: "191002281",
      },
      {
        position: "Vice President",
        name: "Md. Zahidul Hasan",
        studentId: "183002076",
      },
      {
        position: "General Secretary",
        name: "Md. Rahul Reza",
        studentId: "191002067",
      },
      {
        position: "Joint General Secretary",
        name: "MD Mohtamim Islam Nayeem",
        studentId: "193015047",
      },
      {
        position: "Treasurer",
        name: "Kamrujjaman Shamim",
        studentId: "193002044",
      },
      {
        position: "Joint Treasurer",
        name: "Md. Jahid Hassan",
        studentId: "201002463",
      },
      {
        position: "Organizing Secretary",
        name: "Mahshiat Tahsin Bably",
        studentId: "192002014",
      },
      {
        position: "Joint Organizing Secretary",
        name: "Sakhawat Hossain Rabbi",
        studentId: "201002311",
      },
      {
        position: "Programming Secretary",
        name: "Muntasir Chowdhury Mridul",
        studentId: "192002035",
      },
      {
        position: "Information Secretary",
        name: "Shahriar Ahsan Taisiq",
        studentId: "201002396",
      },
      {
        position: "Joint Information Secretary",
        name: "Md. Montasir Rahman",
        studentId: "202002003",
      },
      {
        position: "Cultural Secretary",
        name: "Sabrina Rahman",
        studentId: "191002305",
      },
      {
        position: "Joint Cultural Secretary",
        name: "Asma UL Husna",
        studentId: "201002032",
      },
      {
        position: "Graphic Designer",
        name: "Md Khyruddin",
        studentId: "212002135",
      },
      {
        position: "Sports Secretary",
        name: "Ismail Hossain",
        studentId: "191002023",
      },
      {
        position: "Joint Sports Secretary",
        name: "Tamim Ahmed",
        studentId: "193002014",
      },
      {
        position: "Publication Secretary",
        name: "Md. Rafiqul Islam (Bayazid)",
        studentId: "201015044",
      },
      {
        position: "Joint Publication Secretary",
        name: "Mahbubullah",
        studentId: "211002084",
      },
      {
        position: "Office Secretary",
        name: "Rashadul Hasan Romman",
        studentId: "211002045",
      },
    ],
  },
  {
    year: "2023",
    facultyMembers: [
      {
        position: "Moderator",
        name: "Md. Monirul Islam",
        designation: "Lecturer",
      },
      {
        position: "Deputy Moderator",
        name: "Tanoy Debnath",
        designation: "Lecturer",
      },
      {
        position: "Deputy Moderator",
        name: "Md. Abu Rumman Refat",
        designation: "Lecturer",
      },
    ],
    studentExecutives: [
      {
        position: "President",
        name: "Shamim Ahmed",
        studentId: "201902067",
      },
      {
        position: "Vice President (Activity)",
        name: "Md. Montasir Rahman",
        studentId: "202002003",
      },
      {
        position: "Vice President (Technical)",
        name: "Shakib Imtiaz",
        studentId: "202902008",
      },
      {
        position: "General Secretary",
        name: "Sakhawat Hossain Rabbi",
        studentId: "201002311",
      },
      {
        position: "Joint General Secretary (Activity)",
        name: "Md. Jahid Hassan",
        studentId: "201002463",
      },
      {
        position: "Joint General Secretary (Technical)",
        name: "Al Amin",
        studentId: "202902024",
      },
      {
        position: "Organizing Secretary",
        name: "Ibrahim Tanvir",
        studentId: "211902055",
      },
      {
        position: "Joint Organizing Secretary",
        name: "Hridoy Debnath",
        studentId: "213002239",
      },
      {
        position: "Treasurer",
        name: "Kazi Sabbir Ahmed Opi",
        studentId: "201002043",
      },
      {
        position: "Joint Treasurer",
        name: "Abdul Fattah",
        studentId: "221902066",
      },
      {
        position: "Programming Secretary",
        name: "Md. Abu Taief Siddique",
        studentId: "211902037",
      },
      {
        position: "Joint Programming Secretary",
        name: "Jannatul Ferdous Nuri",
        studentId: "211002005",
      },
      {
        position: "Information Secretary",
        name: "Sikder Md. Shariful Islam",
        studentId: "213002146",
      },
      {
        position: "Joint Information Secretary",
        name: "Hasimunnahar Shanta",
        studentId: "221002585",
      },
      {
        position: "Event Coordinator",
        name: "Riya Hasan",
        studentId: "221902188",
      },
      {
        position: "Cultural Secretary",
        name: "Asma UL Husna",
        studentId: "201002032",
      },
      {
        position: "Joint Cultural Secretary",
        name: "Md. Showaib Rahman Tanveer",
        studentId: "221902084",
      },
      {
        position: "Publication Secretary",
        name: "Md. Hasibur Rahman",
        studentId: "212902018",
      },
      {
        position: "Joint Publication Secretary",
        name: "Shawmin Azmi",
        studentId: "221002352",
      },
      {
        position: "Graphics Designer",
        name: "Umma Salma Noor Tamanna",
        studentId: "213002100",
      },
      {
        position: "Sports Secretary",
        name: "Md. Akramul Hoque",
        studentId: "221002565",
      },
      {
        position: "Executive Member-1",
        name: "Al Shahriar Ahommed Shanto",
        studentId: "221002567",
      },
      {
        position: "Executive Member-2",
        name: "Mahmuda Akter Nadia",
        studentId: "231002001",
      },
    ],
  },
  {
    year: "2024",
    facultyMembers: [
      {
        position: "Moderator",
        name: "Md. Monirul Islam",
        designation: "Assistant Professor",
      },
      {
        position: "Deputy Moderator",
        name: "Jarin Tasnim Tonvi",
        designation: "Lecturer",
      },
      {
        position: "Deputy Moderator",
        name: "Montaser Abdul Quader",
        designation: "Lecturer",
      },
    ],
    studentExecutives: [
      {
        position: "President",
        name: "Md. Montasir Rahman",
        studentId: "202002003",
      },
      {
        position: "Vice President",
        name: "Shakib Imtiaz",
        studentId: "202902008",
      },
      {
        position: "General Secretary",
        name: "Al Amin",
        studentId: "202902024",
      },
      {
        position: "Joint General Secretary",
        name: "Md. Showaib Rahman Tanveer",
        studentId: "221902084",
      },
      {
        position: "Organizing Secretary",
        name: "Ibrahim Tanvir",
        studentId: "211902055",
      },
      {
        position: "Joint Organizing Secretary",
        name: "Hridoy Debnath",
        studentId: "213002239",
      },
      {
        position: "Treasurer",
        name: "Abdul Fattah",
        studentId: "221902066",
      },
      {
        position: "Programming Secretary",
        name: "Md. Abu Taief Siddique",
        studentId: "211902037",
      },
      {
        position: "Joint Programming Secretary",
        name: "Jannatul Ferdous Nuri",
        studentId: "211002005",
      },
      {
        position: "Information Secretary",
        name: "Sikder Md. Shariful Islam",
        studentId: "213002146",
      },
      {
        position: "Joint Information Secretary",
        name: "Hasimunnahar Shanta",
        studentId: "221002585",
      },
      {
        position: "Event Coordinator",
        name: "Al Shahriar Ahommed Shanto",
        studentId: "221002567",
      },
      {
        position: "Cultural Secretary",
        name: "Riya Hasan",
        studentId: "221902188",
      },
      {
        position: "Publication Secretary",
        name: "Md. Hasibur Rahman",
        studentId: "212902018",
      },
      {
        position: "Joint Publication Secretary",
        name: "Shawmin Azmi",
        studentId: "221002352",
      },
      {
        position: "Sports Secretary",
        name: "Md. Akramul Hoque",
        studentId: "221002565",
      },
      {
        position: "Graphics and Multimedia Coordinator",
        name: "Umma Salma Noor Tamanna",
        studentId: "213002100",
      },
      {
        position: "Graphics and Multimedia Coordinator",
        name: "Mahmuda Akter Nadia",
        studentId: "231002001",
      },
      {
        position: "Executive Member",
        name: "Akash Adhikary",
        studentId: "213002021",
      },
      {
        position: "Executive Member",
        name: "Md. Fazle Rabbi Riyad",
        studentId: "213002027",
      },
      {
        position: "Executive Member",
        name: "Majharul Islam",
        studentId: "232002256",
      },
    ],
  },
  {
    year: "2025",
    facultyMembers: [
      {
        position: "Moderator",
        name: "Md. Monirul Islam",
        designation: "Assistant Professor",
      },
      {
        position: "Deputy Moderator",
        name: "Jarin Tasnim Tonvi",
        designation: "Lecturer",
      },
      {
        position: "Deputy Moderator",
        name: "Montaser Abdul Quader",
        designation: "Lecturer",
      },
    ],
    studentExecutives: [
      {
        position: "President",
        name: "Md. Showaib Rahman Tanveer",
        studentId: "221902084",
      },
      {
        position: "Vice President (Activity)",
        name: "Hasimunnahar Shanta",
        studentId: "221002585",
      },
      {
        position: "Vice President (Technical)",
        name: "Ammar Bin Anwar Fuad",
        studentId: "222902080",
      },
      {
        position: "General Secretary",
        name: "Abdul Fattah",
        studentId: "221902066",
      },
      {
        position: "Joint General Secretary (Activity)",
        name: "Al Shahriar Ahommed Shanto",
        studentId: "221002567",
      },
      {
        position: "Joint General Secretary (Technical)",
        name: "Shawmin Azmi",
        studentId: "221002352",
      },
      {
        position: "Treasurer",
        name: "Nazmus Sakib",
        studentId: "223902073",
      },
      {
        position: "Joint Treasurer",
        name: "Mahmuda Akter Nadia",
        studentId: "231002001",
      },
      {
        position: "Organizing Secretary",
        name: "Riya Hasan",
        studentId: "221902188",
      },
      {
        position: "Joint Organizing Secretary",
        name: "Md. Akramul Hoque",
        studentId: "221002565",
      },
      {
        position: "Event Coordinator",
        name: "Tanveer Ahmed Ziad",
        studentId: "231902048",
      },
      {
        position: "Programming and Development Secretary",
        name: "Nurul Huda (Apon)",
        studentId: "221902012",
      },
      {
        position: "Programming and Development Secretary (Activity)",
        name: "Fahmida Akter Nupur",
        studentId: "221902385",
      },
      {
        position: "Programming and Development Secretary (Technical)",
        name: "Mohabbat Marjuk Muttaki",
        studentId: "231902001",
      },
      {
        position: "Information Secretary",
        name: "Mehreen Jerin Khan",
        studentId: "222902019",
      },
      {
        position: "Joint Information Secretary",
        name: "Bakul Ahmed",
        studentId: "232002184",
      },
      {
        position: "Outreach Secretary",
        name: "Tasmia Noor Tama",
        studentId: "223902001",
      },
      {
        position: "Publication Secretary",
        name: "Pranta Sarker",
        studentId: "221002516",
      },
      {
        position: "Joint Publication Secretary",
        name: "Rahat Hossain Himel",
        studentId: "231902018",
      },
      {
        position: "Cultural Secretary",
        name: "Israt Hossain",
        studentId: "221902331",
      },
      {
        position: "Joint Cultural Secretary",
        name: "Shakib Hasan",
        studentId: "241002036",
      },
      {
        position: "Graphics and Multimedia Coordinator",
        name: "Majharul Islam",
        studentId: "232002256",
      },
      {
        position: "Media Production Coordinator",
        name: "Mohammad Sajid Hossain",
        studentId: "221902116",
      },
      {
        position: "Photography Secretary",
        name: "MD Nahiduzzaman Dipu",
        studentId: "223002150",
      },
      {
        position: "Sports Secretary",
        name: "Md. Fazle Rabbi Riyad",
        studentId: "213002027",
      },
      {
        position: "Executive Member-1",
        name: "Md. Jawadul Hassan Sowmik",
        studentId: "241002002",
      },
      {
        position: "Executive Member-2",
        name: "Md Farhad",
        studentId: "241002017",
      },
      {
        position: "Executive Member-3",
        name: "Nafisa Anjum Dina",
        studentId: "242002136",
      },
      {
        position: "Executive Member-4",
        name: "Nusrat Jahan Sumaiya",
        studentId: "242002167",
      },
    ],
  },
]

// Helper function to get executives for a specific year
export function getExecutivesByYear(year: string): ExecutiveYear | undefined {
  return executivesByYear.find((exec) => exec.year === year)
}

// Helper function to get all available years
export function getAvailableYears(): string[] {
  return executivesByYear.map((exec) => exec.year)
}

// Helper function to group student executives by category
export function groupExecutivesByCategory(executives: StudentExecutive[]) {
  const leadership = executives.filter((exec) =>
    ["President", "Vice President", "General Secretary", "Joint General Secretary"].some((title) =>
      exec.position.includes(title),
    ),
  )

  const technical = executives.filter((exec) =>
    ["Programming", "Technical", "Development", "Information"].some((title) => exec.position.includes(title)),
  )

  const organizational = executives.filter((exec) =>
    ["Organizing", "Event", "Treasurer", "Outreach", "Publication"].some((title) => exec.position.includes(title)),
  )

  const cultural = executives.filter((exec) =>
    ["Cultural", "Graphics", "Media", "Photography", "Sports", "Executive Member"].some((title) =>
      exec.position.includes(title),
    ),
  )

  return { leadership, technical, organizational, cultural }
}

