'use client'
import Link from "next/link"
import { use, useEffect, useState } from "react"


export interface Contributor {
  login: string
  avatar_url: string
  html_url: string
  contributions: number
}

export function ContributorsWrapper({ contributors }: { contributors: Contributor[] }) {
  return (
    <div className="text-center">
      {contributors.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-2">
      
          <Link
            href="https://github.com/green-university-computer-club/gucc/graphs/contributors"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-7 h-7 rounded-full bg-muted text-muted-foreground hover:bg-primary/10 transition-colors"
            title="View all contributors"
          >
            <span>+</span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export  function Contributors() {
  const [contributors, setContributors] = useState<Contributor[]>([])
  useEffect(() => {
    if (contributors.length === 0) {
      getContributors().then(setContributors)
    }
  }, [])

  return <ContributorsWrapper contributors={contributors} />
} 

async function getContributors() {
  const response = await fetch("https://api.github.com/repos/green-university-computer-club/gucc/contributors")
  const data = await response.json() as Contributor[]
  return data.slice(0, 8)
}