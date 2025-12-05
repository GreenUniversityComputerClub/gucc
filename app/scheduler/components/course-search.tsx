"use client"

import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"

interface CourseSearchProps {
  onSearch: (searchTerm: string) => void
}

export default function CourseSearch({ onSearch }: CourseSearchProps) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Search by course title or code..."
        onChange={(e) => onSearch(e.target.value)}
        className="pl-9 border-gray-200 bg-white"
      />
    </div>
  )
}
