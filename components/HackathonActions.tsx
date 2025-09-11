"use client"

import { Button } from "@/components/ui/button"
import { MessageCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface HackathonActionsProps {
  className?: string
  variant?: "default" | "outline"
  size?: "default" | "sm" | "lg"
}

export default function HackathonActions({ 
  className, 
  variant = "outline", 
  size = "default" 
}: HackathonActionsProps) {
  const handleDiscordClick = () => {
    window.open('https://discord.com/channels/1053043587278983168/1410043819457777726', '_blank')
  }

  return (
    <Button
      variant={variant}
      size={size}
      className={cn(
        variant === "outline" 
          ? "border-white/30 text-white hover:bg-white/10 font-semibold transition-all duration-300" 
          : "bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105",
        className
      )}
      onClick={handleDiscordClick}
    >
      <MessageCircle className="h-4 w-4 mr-2" />
      Join Discord
    </Button>
  )
}