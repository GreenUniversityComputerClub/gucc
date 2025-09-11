"use client"

import { Button } from "@/components/ui/button"

export default function HackathonActions() {
  const handleDiscordClick = () => {
    alert('Discord link will be provided by organizers soon!')
  }

  return (
    <Button
      variant="outline"
      className="flex-1 border-white/30 text-white hover:bg-white/10 font-semibold py-3 transition-all duration-200"
      onClick={handleDiscordClick}
    >
      Join Discord
    </Button>
  )
}