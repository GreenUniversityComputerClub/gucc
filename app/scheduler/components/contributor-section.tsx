"use client"

import Image from "next/image"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Github, Linkedin, Mail } from "lucide-react"
import { useEffect, useState } from "react"

interface ContributorProps {
  name: string
  role: string
  image: string
  github?: string
  linkedin?: string
  email?: string
}

// Update the Contributor component to be more responsive
const Contributor = ({ name, role, image, github, linkedin, email }: ContributorProps) => {
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <div className="relative h-10 w-10 sm:h-12 sm:w-12 overflow-hidden rounded-full border-2 border-primary/20 flex-shrink-0">
        <Image src={image || "/placeholder.svg"} alt={name} fill className="object-cover" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-xs sm:text-sm truncate">{name}</h3>
        <p className="text-xs text-muted-foreground truncate">{role}</p>
        <div className="flex space-x-1 mt-1">
          {github && (
            <a
              href={github}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${name}'s GitHub`}
              className="text-muted-foreground hover:text-primary"
            >
              <Github className="h-3 w-3" />
            </a>
          )}
          {linkedin && (
            <a
              href={linkedin}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${name}'s LinkedIn`}
              className="text-muted-foreground hover:text-primary"
            >
              <Linkedin className="h-3 w-3" />
            </a>
          )}
          {email && (
            <a
              href={`mailto:${email}`}
              aria-label={`Email ${name}`}
              className="text-muted-foreground hover:text-primary"
            >
              <Mail className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// Helper function to shuffle an array
function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array]
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[newArray[i], newArray[j]] = [newArray[j], newArray[i]]
  }
  return newArray
}

// Update the ContributorSection component to be more responsive
export default function ContributorSection() {
  // Define the contributors array
  const contributorsData = [
    {
      name: "Md Shajahan Apurba",
      role: "221902372",
      image: "https://github.com/ShahJahanApurbo.png?height=200&width=200",
    },
    {
      name: "Rakib Sarder",
      role: "221902377",
      image: "https://github.com/iamrakibsarder.png?height=200&width=200",
    },
    {
      name: "Md Hosain Rohman Noyon",
      role: "221902370",
      image: "https://github.com/mhr-noyon.png?height=200&width=200",
    },
  ]

  // Use state to store the shuffled contributors
  const [contributors, setContributors] = useState<ContributorProps[]>([])

  // Shuffle the contributors on component mount
  useEffect(() => {
    setContributors(shuffleArray(contributorsData))
  }, [])

  return (
    <Card className="white-card h-fit !gap-3 !py-4" style={{ backgroundColor: "#EAF6EE" }}>
      <CardHeader className="px-3 sm:px-6">
        <CardTitle className="green-title text-base sm:text-lg">Contributors</CardTitle>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        <div className="flex flex-col space-y-3 sm:space-y-4">
          {contributors.map((contributor) => (
            <Contributor key={contributor.name} {...contributor} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
