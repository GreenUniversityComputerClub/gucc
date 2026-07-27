export interface ScheduleItem {
  day: string
  time: string
  room: string | null // Room can be null
}

export interface CourseSection {
  section: string
  schedule: ScheduleItem[]
  teachers: string | null // Teachers can be null
}

export interface Course {
  sections: CourseSection[]
  formalCode: string
  program: string
  batch: string
  title: string
  credits: number
}

export interface Courses {
  [courseCode: string]: Course
}

export type Schedule = ScheduleItem[]

// Helper function to get courses array from Courses object
export function getCoursesArray(courses: Courses): Course[] {
  return Object.values(courses)
}

// Helper function to get course by code
export function getCourseByCode(courses: Courses, code: string): Course | undefined {
  return courses[code]
}

// Add the new type to the exports
export interface SectionWithCourse extends CourseSection {
  courseCode: string
}
export const courses: Courses =
{
    "MAT-101": {
        "program": "CSE(Regular)",
        "batch": "2025, Fall - 252",
        "title": "Calculus for Computing",
        "credits": 3,
        "formalCode": "MAT-101",
        "sections": [
            {
                "section": "252_D1",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "252_D2",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "252_D3",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "252_D4",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "250_D3",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "250_D1",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "250_D4",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "250_D2",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            }
        ]
    },
    "CSE-101": {
        "program": "CSE(Regular)",
        "batch": "2025, Fall - 252",
        "title": "Discrete Mathematics",
        "credits": 3,
        "formalCode": "CSE-101",
        "sections": [
            {
                "section": "252_D1",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "SUN",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "AR"
            },
            {
                "section": "252_D3",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "AR"
            },
            {
                "section": "252_D2",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Mozdaher Abdul Quader"
            },
            {
                "section": "252_D4",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "SUN",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            }
        ]
    },
    "CSE-100": {
        "program": "CSE(Regular)",
        "batch": "2025, Fall - 252",
        "title": "Computational Thinking and Problem Solving",
        "credits": 1.5,
        "formalCode": "CSE-100",
        "sections": [
            {
                "section": "252_D1",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Md. Jahidul Islam"
            },
            {
                "section": "252_D2",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "SHU"
            },
            {
                "section": "252_D3",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Mahbubur Rahman"
            },
            {
                "section": "252_D4",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Romzan Alom"
            },
            {
                "section": "252_D5",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Rusmita Halim Chaity"
            },
            {
                "section": "252_D6",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Humayan Kabir Rana"
            }
        ]
    },
    "ESP-009": {
        "program": "CSE(Regular)",
        "batch": "2025, Fall - 252",
        "title": "Academic English",
        "credits": 0,
        "formalCode": "ESP-009",
        "sections": [
            {
                "section": "252_D1",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "252_D2",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "252_D3",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "252_D4",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            }
        ]
    },
    "CHE-101": {
        "program": "CSE(Regular)",
        "batch": "250",
        "title": "Chemistry",
        "credits": 3,
        "formalCode": "CHE-101",
        "sections": [
            {
                "section": "250_D1",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "SUN",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "250_D2",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "SUN",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "250_D3",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "SUN",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "250_D4",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "SUN",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            }
        ]
    },
    "CSE-103": {
        "program": "CSE(Regular)",
        "batch": "250",
        "title": "Structured Programming",
        "credits": 3,
        "formalCode": "CSE-103",
        "sections": [
            {
                "section": "250_D1",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "SUN",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Humayan Kabir Rana"
            },
            {
                "section": "250_D2",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "SUN",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Zahidul Hasan"
            },
            {
                "section": "250_D3",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "SUN",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Humayan Kabir Rana"
            },
            {
                "section": "250_D4",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "SUN",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Shoab Alam"
            }
        ]
    },
    "CSE-403": {
        "program": "CSE(Regular)",
        "batch": "2022, Fall - 223",
        "title": "Information System and Design",
        "credits": 3,
        "formalCode": "CSE-403",
        "sections": [
            {
                "section": "223_D1",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Sharifur Rahman"
            },
            {
                "section": "223_D2",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Md. Rajibul Palas"
            },
            {
                "section": "223_D3",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Sheikh Fazle Rabbi"
            },
            {
                "section": "222_D3",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "JMH"
            },
            {
                "section": "222_D1",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Sheikh Fazle Rabbi"
            },
            {
                "section": "222_D2",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "JMH"
            }
        ]
    },
    "GED-401": {
        "program": "CSE(Regular)",
        "batch": "2022, Fall - 223",
        "title": "Financial and Managerial Accounting",
        "credits": 3,
        "formalCode": "GED-401",
        "sections": [
            {
                "section": "223_D1",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "223_D2",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "223_D3",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            }
        ]
    },
    "GED-411": {
        "program": "CSE(Regular)",
        "batch": "221",
        "title": "Bangladesh Studies",
        "credits": 2,
        "formalCode": "GED-411",
        "sections": [
            {
                "section": "221_D1",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "221_D2",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "221_D3",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "221_D4",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "221_D5",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "221_D6",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "221_D7",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "221_D8",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "221_D9",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "221_D10",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "221_D11",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "221_D12",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            }
        ]
    },
    "CSE-435": {
        "program": "CSE(Regular)",
        "batch": "221",
        "title": "Data Mining",
        "credits": 3,
        "formalCode": "CSE-435",
        "sections": [
            {
                "section": "221_D1",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Babe Sultana"
            },
            {
                "section": "221_D2",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Atikuzzaman"
            },
            {
                "section": "221_D3",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Umme Habiba"
            },
            {
                "section": "221_D4",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Riad Hassan"
            },
            {
                "section": "221_D5",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Md. Naimul Pathan"
            },
            {
                "section": "221_D6",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Atikuzzaman"
            },
            {
                "section": "221_D7",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Umme Habiba"
            },
            {
                "section": "221_D8",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Riad Hassan"
            },
            {
                "section": "221_D9",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Md. Naimul Pathan"
            },
            {
                "section": "221_D10",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Sakhaouth Hossan"
            },
            {
                "section": "221_D11",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Ataullha"
            },
            {
                "section": "221_D12",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Rokeya Khatun"
            },
            {
                "section": "222_D2",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Prof. Dr. Md. Ahsan Habib Tareq"
            },
            {
                "section": "222_D1",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Prof. Dr. Md. Ahsan Habib Tareq"
            }
        ]
    },
    "CSE-436": {
        "program": "CSE(Regular)",
        "batch": "221",
        "title": "Data Mining Lab",
        "credits": 1,
        "formalCode": "CSE-436",
        "sections": [
            {
                "section": "221_D1",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Atikuzzaman"
            },
            {
                "section": "221_D15",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Md. Naimul Pathan"
            },
            {
                "section": "221_D2",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Ataullha"
            },
            {
                "section": "221_D16",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Atikuzzaman"
            },
            {
                "section": "221_D3",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Sheikh Fazle Rabbi"
            },
            {
                "section": "221_D17",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Sheikh Fazle Rabbi"
            },
            {
                "section": "221_D4",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Riad Hassan"
            },
            {
                "section": "221_D18",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Romzan Alom"
            },
            {
                "section": "221_D5",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Md. Naimul Pathan"
            },
            {
                "section": "221_D19",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Sakhaouth Hossan"
            },
            {
                "section": "221_D6",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Sakhaouth Hossan"
            },
            {
                "section": "221_D20",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Ataullha"
            },
            {
                "section": "221_D7",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Md. Rajibul Palas"
            },
            {
                "section": "221_D21",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Md. Rajibul Palas"
            },
            {
                "section": "221_D8",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Jarin Tasnim Tonvi"
            },
            {
                "section": "221_D9",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Md. Naimul Pathan"
            },
            {
                "section": "221_D10",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Riad Hassan"
            },
            {
                "section": "221_D11",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Sakhaouth Hossan"
            },
            {
                "section": "221_D12",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Sheikh Fazle Rabbi"
            },
            {
                "section": "221_D13",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Md. Rajibul Palas"
            },
            {
                "section": "221_D14",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Ataullha"
            },
            {
                "section": "222_D3",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Riad Hassan"
            },
            {
                "section": "222_D1",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Atikuzzaman"
            },
            {
                "section": "222_D2",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Romzan Alom"
            }
        ]
    },
    "PSD-400": {
        "program": "CSE(Regular)",
        "batch": "221",
        "title": "Professional Life Skills Development",
        "credits": 0,
        "formalCode": "PSD-400",
        "sections": [
            {
                "section": "221_D5",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "221_D6",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "221_D7",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "221_D8",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "221_D1",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "221_D2",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "221_D3",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "221_D4",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "221_D9",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "221_D10",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "221_D11",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "221_D12",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            }
        ]
    },
    "CSE-454": {
        "program": "CSE(Regular)",
        "batch": "221",
        "title": "Software Testing and Quality Assurance Lab",
        "credits": 1,
        "formalCode": "CSE-454",
        "sections": [
            {
                "section": "221_D1",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "SHU"
            },
            {
                "section": "221_D3",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Montaser Abdul Quader"
            },
            {
                "section": "221_D2",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Montaser Abdul Quader"
            },
            {
                "section": "222_D1",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Montaser Abdul Quader"
            }
        ]
    },
    "CSE-453": {
        "program": "CSE(Regular)",
        "batch": "221",
        "title": "Software Testing and Quality Assurance",
        "credits": 3,
        "formalCode": "CSE-453",
        "sections": [
            {
                "section": "221_D1",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Montaser Abdul Quader"
            },
            {
                "section": "221_D2",
                "schedule": [
                    {
                        "day": "SAT",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Zahidul Hasan"
            },
            {
                "section": "222_D1",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Montaser Abdul Quader"
            }
        ]
    },
    "EEE-101": {
        "program": "CSE(Regular)",
        "batch": "2025, Fall - 252",
        "title": "Introduction to Electrical Engineering",
        "credits": 3,
        "formalCode": "EEE-101",
        "sections": [
            {
                "section": "252_D3",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "252_D4",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "251_D1",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "251_D2",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "251_D3",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "252_D1",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "252_D2",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            }
        ]
    },
    "EEE-102": {
        "program": "CSE(Regular)",
        "batch": "2025, Fall - 252",
        "title": "Introduction to Electrical Engineering Lab",
        "credits": 1,
        "formalCode": "EEE-102",
        "sections": [
            {
                "section": "252_D4",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "A-607"
            },
            {
                "section": "252_D5",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "G-107"
            },
            {
                "section": "252_D6",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "G-110"
            },
            {
                "section": "251_D3",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "G-110"
            },
            {
                "section": "251_D1",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "A-607"
            },
            {
                "section": "251_D4",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "G-109"
            },
            {
                "section": "251_D2",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "G-107"
            },
            {
                "section": "252_D1",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "A-607"
            },
            {
                "section": "252_D2",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "G-107"
            },
            {
                "section": "252_D3",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "G-110"
            }
        ]
    },
    "CHE-102": {
        "program": "CSE(Regular)",
        "batch": "250",
        "title": "Chemistry Lab",
        "credits": 1,
        "formalCode": "CHE-102",
        "sections": [
            {
                "section": "250_D5",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "H-109"
            },
            {
                "section": "250_D6",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "H-111"
            },
            {
                "section": "250_D1",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "H-109"
            },
            {
                "section": "250_D2",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "H-111"
            },
            {
                "section": "250_D3",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "H-109"
            },
            {
                "section": "250_D4",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "H-111"
            }
        ]
    },
    "CSE-205": {
        "program": "CSE(Regular)",
        "batch": "2025, Spring - 251",
        "title": "Data Structures",
        "credits": 3,
        "formalCode": "CSE-205",
        "sections": [
            {
                "section": "251_D3",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Prof. Dr. Md Saiful Azad"
            },
            {
                "section": "251_D1",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Prof. Dr. Md Saiful Azad"
            },
            {
                "section": "251_D2",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Sakhaouth Hossan"
            }
        ]
    },
    "MAT-103": {
        "program": "CSE(Regular)",
        "batch": "2025, Spring - 251",
        "title": "Linear Algebra and Vector Analysis",
        "credits": 3,
        "formalCode": "MAT-103",
        "sections": [
            {
                "section": "251_D1",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "251_D2",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "251_D3",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            }
        ]
    },
    "GED-103": {
        "program": "CSE(Regular)",
        "batch": "2025, Spring - 251",
        "title": "Functional Bengali",
        "credits": 2,
        "formalCode": "GED-103",
        "sections": [
            {
                "section": "251_D1",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "251_D2",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "251_D3",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "MON",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            }
        ]
    },
    "CSE-203": {
        "program": "CSE(Regular)",
        "batch": "2024, Fall - 242",
        "title": "Digital Logic Design",
        "credits": 3,
        "formalCode": "CSE-203",
        "sections": [
            {
                "section": "242_D1",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Syed Ahsanul Kabir"
            },
            {
                "section": "242_D2",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Sagufta Sabah Nakshi"
            },
            {
                "section": "242_D3",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Syed Ahsanul Kabir"
            },
            {
                "section": "242_D4",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Shamima Akter"
            }
        ]
    },
    "CSE-201": {
        "program": "CSE(Regular)",
        "batch": "2024, Fall - 242",
        "title": "Object Oriented Programming",
        "credits": 3,
        "formalCode": "CSE-201",
        "sections": [
            {
                "section": "242_D1",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Parvez Hossain"
            },
            {
                "section": "242_D2",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Sabbir Hosen Mamun"
            },
            {
                "section": "242_D3",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Parvez Hossain"
            },
            {
                "section": "242_D4",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Ataullha"
            }
        ]
    },
    "CSE-202": {
        "program": "CSE(Regular)",
        "batch": "2024, Fall - 242",
        "title": "Object Oriented Programming Lab",
        "credits": 1.5,
        "formalCode": "CSE-202",
        "sections": [
            {
                "section": "242_D1",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Md. Naimul Pathan"
            },
            {
                "section": "242_D2",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Sabbir Hosen Mamun"
            },
            {
                "section": "242_D4",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Parvez Hossain"
            },
            {
                "section": "242_D3",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Mozdaher Abdul Quader"
            },
            {
                "section": "242_D5",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Mozdaher Abdul Quader"
            },
            {
                "section": "242_D6",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Ataullha"
            }
        ]
    },
    "CSE-210": {
        "program": "CSE(Regular)",
        "batch": "2024, Spring - 241",
        "title": "Database Lab",
        "credits": 1.5,
        "formalCode": "CSE-210",
        "sections": [
            {
                "section": "241_D3",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Feroza Naznin"
            },
            {
                "section": "241_D1",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Farhana Akter Sunny"
            },
            {
                "section": "241_D4",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Farhana Akter Sunny"
            },
            {
                "section": "241_D2",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Umme Habiba"
            }
        ]
    },
    "CSE-209": {
        "program": "CSE(Regular)",
        "batch": "2024, Spring - 241",
        "title": "Database",
        "credits": 3,
        "formalCode": "CSE-209",
        "sections": [
            {
                "section": "241_D1",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Dr. Md. Faiz Al Faisal"
            },
            {
                "section": "241_D2",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Farhana Akter Sunny"
            },
            {
                "section": "241_D3",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Babe Sultana"
            }
        ]
    },
    "CSE-211": {
        "program": "CSE(Regular)",
        "batch": "2024, Spring - 241",
        "title": "Computer Architecture",
        "credits": 3,
        "formalCode": "CSE-211",
        "sections": [
            {
                "section": "241_D1",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Syed Ahsanul Kabir"
            },
            {
                "section": "241_D2",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Mahbubur Rahman"
            }
        ]
    },
    "MAT-203": {
        "program": "CSE(Regular)",
        "batch": "2024, Spring - 241",
        "title": "Probability and Statistics for Computing",
        "credits": 3,
        "formalCode": "MAT-203",
        "sections": [
            {
                "section": "241_D1",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "241_D2",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            }
        ]
    },
    "CSE-308": {
        "program": "CSE(Regular)",
        "batch": "2023, Fall - 232",
        "title": "Design Project I",
        "credits": 1.5,
        "formalCode": "CSE-308",
        "sections": [
            {
                "section": "232_D3",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Umme Habiba"
            },
            {
                "section": "232_D1",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Montaser Abdul Quader"
            },
            {
                "section": "232_D4",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Sharifur Rahman"
            },
            {
                "section": "232_D2",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Sharifur Rahman"
            },
            {
                "section": "232_D5",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Shoab Alam"
            },
            {
                "section": "232_D6",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "SHU"
            },
            {
                "section": "231_D1",
                "schedule": [
                    {
                        "day": "WED",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Rusmita Halim Chaity"
            },
            {
                "section": "231_D2",
                "schedule": [
                    {
                        "day": "WED",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Romzan Alom"
            },
            {
                "section": "231_D3",
                "schedule": [
                    {
                        "day": "WED",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "JMH"
            }
        ]
    },
    "EEE-301": {
        "program": "CSE(Regular)",
        "batch": "2023, Fall - 232",
        "title": "Electrical Drives and Instrumentations",
        "credits": 3,
        "formalCode": "EEE-301",
        "sections": [
            {
                "section": "232_D1",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "232_D2",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "232_D3",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            }
        ]
    },
    "CSE-301": {
        "program": "CSE(Regular)",
        "batch": "2023, Fall - 232",
        "title": "Web Programming",
        "credits": 3,
        "formalCode": "CSE-301",
        "sections": [
            {
                "section": "232_D1",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Md. Jahidul Islam"
            },
            {
                "section": "232_D2",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Feroza Naznin"
            },
            {
                "section": "232_D3",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Md. Jahidul Islam"
            }
        ]
    },
    "CSE-303": {
        "program": "CSE(Regular)",
        "batch": "2023, Fall - 232",
        "title": "Microprocessors, Microcontrollers and Embedded Systems",
        "credits": 3,
        "formalCode": "CSE-303",
        "sections": [
            {
                "section": "232_D1",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Jarin Tasnim Tonvi"
            },
            {
                "section": "232_D2",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Sagufta Sabah Nakshi"
            },
            {
                "section": "232_D3",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Jarin Tasnim Tonvi"
            }
        ]
    },
    "CSE-316": {
        "program": "CSE(Regular)",
        "batch": "2023, Spring - 231",
        "title": "Artificial Intelligence Lab",
        "credits": 1.5,
        "formalCode": "CSE-316",
        "sections": [
            {
                "section": "231_D1",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Fatema Akter"
            },
            {
                "section": "231_D2",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Sheikh Fazle Rabbi"
            },
            {
                "section": "223_D4",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Sabbir Hosen Mamun"
            },
            {
                "section": "223_D5",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Abu Rumman Refat"
            },
            {
                "section": "223_D2",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "JMH"
            },
            {
                "section": "223_D1",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Abu Rumman Refat"
            },
            {
                "section": "223_D3",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Rusmita Halim Chaity"
            },
            {
                "section": "231_D3",
                "schedule": [
                    {
                        "day": "WED",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Mozdaher Abdul Quader"
            }
        ]
    },
    "CSE-305": {
        "program": "CSE(Regular)",
        "batch": "2023, Spring - 231",
        "title": "Information System Design",
        "credits": 3,
        "formalCode": "CSE-305",
        "sections": [
            {
                "section": "231_D1",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Fatema Tuj Johora"
            },
            {
                "section": "231_D2",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Feroza Naznin"
            },
            {
                "section": "232_D2",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Mozdaher Abdul Quader"
            },
            {
                "section": "232_D1",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Fatema Tuj Johora"
            },
            {
                "section": "232_D3",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Md. Rajibul Palas"
            }
        ]
    },
    "CSE-315": {
        "program": "CSE(Regular)",
        "batch": "2023, Spring - 231",
        "title": "Artificial Intelligence",
        "credits": 3,
        "formalCode": "CSE-315",
        "sections": [
            {
                "section": "231_D1",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Dr. Md. Faiz Al Faisal"
            },
            {
                "section": "231_D2",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Fatema Akter"
            },
            {
                "section": "223_D1",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Dr. Md. Faiz Al Faisal"
            },
            {
                "section": "223_D2",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "SHU"
            },
            {
                "section": "223_D3",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Sabbir Hosen Mamun"
            }
        ]
    },
    "CSE-401": {
        "program": "CSE(Regular)",
        "batch": "2023, Spring - 231",
        "title": "Operating Systems",
        "credits": 3,
        "formalCode": "CSE-401",
        "sections": [
            {
                "section": "231_D1",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Solaiman Mia"
            },
            {
                "section": "231_D2",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "MAS"
            }
        ]
    },
    "CSE-406": {
        "program": "CSE(Regular)",
        "batch": "2022, Summer - 222",
        "title": "Integrated Design Project II",
        "credits": 1.5,
        "formalCode": "CSE-406",
        "sections": [
            {
                "section": "222_D1",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Babe Sultana"
            },
            {
                "section": "222_D5",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Fatema Tuj Johora"
            },
            {
                "section": "222_D2",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Fatema Tuj Johora"
            },
            {
                "section": "222_D6",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Babe Sultana"
            },
            {
                "section": "222_D3",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Romzan Alom"
            },
            {
                "section": "222_D7",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Rokeya Khatun"
            },
            {
                "section": "222_D4",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "JMH"
            }
        ]
    },
    "GED-409": {
        "program": "CSE(Regular)",
        "batch": "2022, Summer - 222",
        "title": "Professional Ethics and Environmental Protection",
        "credits": 3,
        "formalCode": "GED-409",
        "sections": [
            {
                "section": "222_D3",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "222_D1",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "222_D2",
                "schedule": [
                    {
                        "day": "SUN",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            }
        ]
    },
    "MAT-009": {
        "program": "CSE(Regular)",
        "batch": "2025, Fall - 252",
        "title": "Remedial Math",
        "credits": 0,
        "formalCode": "MAT-009",
        "sections": [
            {
                "section": "252_D1",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            }
        ]
    },
    "CSE-104": {
        "program": "CSE(Regular)",
        "batch": "250",
        "title": "Structured Programming Lab",
        "credits": 1.5,
        "formalCode": "CSE-104",
        "sections": [
            {
                "section": "250_D1",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Humayan Kabir Rana"
            },
            {
                "section": "250_D5",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Humayan Kabir Rana"
            },
            {
                "section": "250_D2",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Parvez Hossain"
            },
            {
                "section": "250_D6",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Atikuzzaman"
            },
            {
                "section": "250_D3",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "MAS"
            },
            {
                "section": "250_D7",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Rokeya Khatun"
            },
            {
                "section": "250_D4",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Zahidul Hasan"
            }
        ]
    },
    "ESP-101": {
        "program": "CSE(Regular)",
        "batch": "250",
        "title": "Academic English I",
        "credits": 3,
        "formalCode": "ESP-101",
        "sections": [
            {
                "section": "250_D3",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "250_D1",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "250_D4",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "250_D2",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            }
        ]
    },
    "EEE-202": {
        "program": "CSE(Regular)",
        "batch": "2024, Spring - 241",
        "title": "Electrical Devices, Circuits and Pulse Techniques Lab",
        "credits": 1,
        "formalCode": "EEE-202",
        "sections": [
            {
                "section": "241_D1",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "A-607"
            },
            {
                "section": "241_D3",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "A-607"
            },
            {
                "section": "241_D2",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "G-107"
            },
            {
                "section": "241_D4",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "G-107"
            }
        ]
    },
    "EEE-201": {
        "program": "CSE(Regular)",
        "batch": "2024, Spring - 241",
        "title": "Electrical Devices, Circuits and Pulse Techniques",
        "credits": 3,
        "formalCode": "EEE-201",
        "sections": [
            {
                "section": "241_D1",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "241_D2",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "TUE",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            }
        ]
    },
    "MAT-201": {
        "program": "CSE(Regular)",
        "batch": "2024, Fall - 242",
        "title": "Differential Equations and Coordinate Geometry",
        "credits": 3,
        "formalCode": "MAT-201",
        "sections": [
            {
                "section": "242_D1",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "242_D2",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "08:30:AM - 10:00:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "242_D3",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "242_D4",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "01:30:PM - 03:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            }
        ]
    },
    "PHY-103": {
        "program": "CSE(Regular)",
        "batch": "2024, Fall - 242",
        "title": "Physics II",
        "credits": 3,
        "formalCode": "PHY-103",
        "sections": [
            {
                "section": "242_D1",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "10:00:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "242_D2",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            },
            {
                "section": "242_D3",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    },
                    {
                        "day": "WED",
                        "time": "03:00:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": null
            }
        ]
    },
    "PHY-104": {
        "program": "CSE(Regular)",
        "batch": "2024, Fall - 242",
        "title": "Physics Lab",
        "credits": 1.5,
        "formalCode": "PHY-104",
        "sections": [
            {
                "section": "242_D1",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "A-405"
            },
            {
                "section": "242_D2",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "A-407"
            },
            {
                "section": "242_D3",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "A-405"
            },
            {
                "section": "242_D4",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "A-407"
            },
            {
                "section": "242_D5",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "A-405"
            }
        ]
    },
    "CSE-324": {
        "program": "CSE(Regular)",
        "batch": "2022, Fall - 223",
        "title": "Integrated Design Project I",
        "credits": 1.5,
        "formalCode": "CSE-324",
        "sections": [
            {
                "section": "223_D4",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Babe Sultana"
            },
            {
                "section": "223_D5",
                "schedule": [
                    {
                        "day": "MON",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Umme Habiba"
            },
            {
                "section": "223_D1",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Fatema Akter"
            },
            {
                "section": "223_D2",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Md. Rajibul Palas"
            },
            {
                "section": "223_D3",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "MAS"
            }
        ]
    },
    "CSE-204": {
        "program": "CSE(Regular)",
        "batch": "2024, Fall - 242",
        "title": "Digital Logic Design Lab",
        "credits": 1,
        "formalCode": "CSE-204",
        "sections": [
            {
                "section": "242_D5",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Sagufta Sabah Nakshi"
            },
            {
                "section": "242_D6",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Rusmita Halim Chaity"
            },
            {
                "section": "242_D4",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Rusmita Halim Chaity"
            },
            {
                "section": "242_D1",
                "schedule": [
                    {
                        "day": "WED",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Sagufta Sabah Nakshi"
            },
            {
                "section": "242_D2",
                "schedule": [
                    {
                        "day": "WED",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Romzan Alom"
            },
            {
                "section": "242_D3",
                "schedule": [
                    {
                        "day": "WED",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Abdullah Al Farhad"
            }
        ]
    },
    "CSE-302": {
        "program": "CSE(Regular)",
        "batch": "2023, Fall - 232",
        "title": "Web Programming Lab",
        "credits": 1.5,
        "formalCode": "CSE-302",
        "sections": [
            {
                "section": "232_D1",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Tanpia Tasnim"
            },
            {
                "section": "232_D3",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Md. Jahidul Islam"
            },
            {
                "section": "232_D2",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Feroza Naznin"
            },
            {
                "section": "232_D4",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Mahbubur Rahman"
            },
            {
                "section": "232_D5",
                "schedule": [
                    {
                        "day": "WED",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Feroza Naznin"
            },
            {
                "section": "232_D6",
                "schedule": [
                    {
                        "day": "WED",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Tanpia Tasnim"
            }
        ]
    },
    "CSE-402": {
        "program": "CSE(Regular)",
        "batch": "2023, Spring - 231",
        "title": "Operating Systems Lab",
        "credits": 1.5,
        "formalCode": "CSE-402",
        "sections": [
            {
                "section": "231_D1",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Solaiman Mia"
            },
            {
                "section": "231_D2",
                "schedule": [
                    {
                        "day": "TUE",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Shoab Alam"
            },
            {
                "section": "231_D3",
                "schedule": [
                    {
                        "day": "WED",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Md. Solaiman Mia"
            }
        ]
    },
    "CSE-206": {
        "program": "CSE(Regular)",
        "batch": "2025, Spring - 251",
        "title": "Data Structures Lab",
        "credits": 1.5,
        "formalCode": "CSE-206",
        "sections": [
            {
                "section": "251_D4",
                "schedule": [
                    {
                        "day": "WED",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Mr. Sakhaouth Hossan"
            },
            {
                "section": "251_D5",
                "schedule": [
                    {
                        "day": "WED",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Shamima Akter"
            },
            {
                "section": "251_D1",
                "schedule": [
                    {
                        "day": "WED",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Shamima Akter"
            },
            {
                "section": "251_D2",
                "schedule": [
                    {
                        "day": "WED",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Jarin Tasnim Tonvi"
            },
            {
                "section": "251_D3",
                "schedule": [
                    {
                        "day": "WED",
                        "time": "08:30:AM - 11:30:AM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Sagufta Sabah Nakshi"
            }
        ]
    },
    "CSE-304": {
        "program": "CSE(Regular)",
        "batch": "2023, Fall - 232",
        "title": "Microprocessors, Microcontrollers and Embedded Systems Lab",
        "credits": 1,
        "formalCode": "CSE-304",
        "sections": [
            {
                "section": "232_D1",
                "schedule": [
                    {
                        "day": "WED",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Jarin Tasnim Tonvi"
            },
            {
                "section": "232_D3",
                "schedule": [
                    {
                        "day": "WED",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "SHU"
            },
            {
                "section": "232_D2",
                "schedule": [
                    {
                        "day": "WED",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Sagufta Sabah Nakshi"
            },
            {
                "section": "232_D4",
                "schedule": [
                    {
                        "day": "WED",
                        "time": "01:30:PM - 04:30:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Jarin Tasnim Tonvi"
            },
            {
                "section": "232_D5",
                "schedule": [
                    {
                        "day": "WED",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "Ms. Rusmita Halim Chaity"
            },
            {
                "section": "232_D6",
                "schedule": [
                    {
                        "day": "WED",
                        "time": "11:30:AM - 01:00:PM",
                        "room": "TBA"
                    }
                ],
                "teachers": "SHU"
            }
        ]
    }
}
