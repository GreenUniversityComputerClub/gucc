"use client"

import * as React from "react"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"

// Use uppercase day codes to match the dataset (e.g., "SAT" in schedules)
const DAYS = [
  { value: "SAT", label: "Saturday" },
  { value: "SUN", label: "Sunday" },
  { value: "MON", label: "Monday" },
  { value: "TUE", label: "Tuesday" },
  { value: "WED", label: "Wednesday" },
  { value: "THU", label: "Thursday" },
  { value: "FRI", label: "Friday" },
]

interface DaySelectorProps {
  selectedDays: string[]
  onChange: (days: string[]) => void
}

export function DaySelector({ selectedDays, onChange }: DaySelectorProps) {
  // We still need to use Popover for multi-select functionality
  // but we'll style the trigger like a Select component
  const [open, setOpen] = React.useState(false)

  const toggleDay = (day: string) => {
    if (selectedDays.includes(day)) {
      onChange(selectedDays.filter((d) => d !== day))
    } else {
      onChange([...selectedDays, day])
    }
  }

  const selectAll = () => {
    onChange(DAYS.map((day) => day.value))
  }

  const clearAll = () => {
    onChange([])
  }

  // Format the display text based on selection
  const getDisplayText = () => {
    if (selectedDays.length === 0) {
      return "Select days..."
    } else if (selectedDays.length === DAYS.length) {
      return "All days selected"
    } else {
      return `${selectedDays.length} day${selectedDays.length > 1 ? "s" : ""} selected`
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* Style the trigger like a Select component */}
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-10 px-3 py-2 text-sm bg-white"
        >
          <span className="truncate">{getDisplayText()}</span>
          <svg
            width="15"
            height="15"
            viewBox="0 0 15 15"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 opacity-50"
            aria-hidden="true"
          >
            <path
              d="M4.93179 5.43179C4.75605 5.60753 4.75605 5.89245 4.93179 6.06819C5.10753 6.24392 5.39245 6.24392 5.56819 6.06819L7.49999 4.13638L9.43179 6.06819C9.60753 6.24392 9.89245 6.24392 10.0682 6.06819C10.2439 5.89245 10.2439 5.60753 10.0682 5.43179L7.81819 3.18179C7.73379 3.0974 7.61933 3.04999 7.49999 3.04999C7.38064 3.04999 7.26618 3.0974 7.18179 3.18179L4.93179 5.43179ZM10.0682 9.56819C10.2439 9.39245 10.2439 9.10753 10.0682 8.93179C9.89245 8.75606 9.60753 8.75606 9.43179 8.93179L7.49999 10.8636L5.56819 8.93179C5.39245 8.75606 5.10753 8.75606 4.93179 8.93179C4.75605 9.10753 4.75605 9.39245 4.93179 9.56819L7.18179 11.8182C7.26618 11.9026 7.38064 11.95 7.49999 11.95C7.61933 11.95 7.73379 11.9026 7.81819 11.8182L10.0682 9.56819Z"
              fill="currentColor"
              fillRule="evenodd"
              clipRule="evenodd"
            ></path>
          </svg>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandList>
            <CommandEmpty>No day found.</CommandEmpty>
            <CommandGroup>
              <CommandItem onSelect={selectAll} className="min-w-full flex items-center justify-between">
                <span>Select All</span>
                {selectedDays.length === DAYS.length && <Check className="h-4 w-4" />}
              </CommandItem>
              <CommandItem onSelect={clearAll} className="flex items-center justify-between">
                <span>Clear All</span>
                {selectedDays.length === 0 && <Check className="h-4 w-4" />}
              </CommandItem>
              {DAYS.map((day) => (
                <CommandItem
                  key={day.value}
                  onSelect={() => toggleDay(day.value)}
                  className="flex items-center justify-between"
                >
                  <span>{day.label}</span>
                  {selectedDays.includes(day.value) && <Check className="h-4 w-4" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function DayBadges({ selectedDays }: { selectedDays: string[] }) {
  if (selectedDays.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {selectedDays.map((day) => {
        const dayInfo = DAYS.find((d) => d.value === day)
        return (
          <Badge key={day} variant="secondary">
            {dayInfo?.label || day}
          </Badge>
        )
      })}
    </div>
  )
}
