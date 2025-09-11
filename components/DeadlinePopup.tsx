"use client"

import React, { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

/**
 * DeadlinePopup Component
 * 
 * A modal popup that appears 2 seconds after page load to announce
 * the deadline extension for the Hack The AI - Inter University Hackathon.
 * 
 * Features:
 * - Auto-opens 2 seconds after page load
 * - Responsive design for all screen sizes
 * - Three action buttons: Register Now, Join Discord, Got It
 * - Clean, centered design that doesn't affect other components
 */
export default function DeadlinePopup() {
  // State to control dialog visibility
  const [isOpen, setIsOpen] = useState(false)

  // Auto-open the popup 2 seconds after component mounts (page load)
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsOpen(true)
    }, 2000) // 2 seconds delay

    // Cleanup timer on component unmount
    return () => clearTimeout(timer)
  }, [])

  // Handler to close the popup
  const handleClose = () => {
    setIsOpen(false)
  }

  // Handler for "Register Now" button - opens the registration form
  const handleRegisterNow = () => {
    window.open('https://forms.gle/QvzXYQ3hdAHPkkWVA', '_blank')
    setIsOpen(false)
  }

  // Handler for "Join Discord" button - placeholder for now
  const handleJoinDiscord = () => {
    // Placeholder link - organizers will update this
    alert('Discord link will be provided by organizers soon!')
    setIsOpen(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[425px] md:max-w-[500px] lg:max-w-[550px] p-0 gap-0 rounded-lg shadow-xl border-0">
        {/* Header Section */}
        <DialogHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
          <DialogTitle className="text-xl sm:text-2xl md:text-3xl font-bold text-center text-foreground">
            📢 Deadline Extended!
          </DialogTitle>
          <DialogDescription className="text-sm sm:text-base md:text-lg text-center text-muted-foreground mt-2">
            The registration deadline has been extended to{" "}
            <span className="font-semibold text-foreground">
              September 13th, 2025 at 8:00 PM
            </span>
            .
            <br />
            <br />
            You now have more time to register for{" "}
            <span className="font-semibold text-foreground">
              Hack The AI - Inter University Hackathon
            </span>
            !
          </DialogDescription>
        </DialogHeader>

        {/* Footer with Action Buttons */}
        <DialogFooter className="p-4 sm:p-6 pt-2 sm:pt-3 flex flex-col sm:flex-row gap-2 sm:gap-3">
          {/* Register Now Button - Primary CTA */}
          <Button
            onClick={handleRegisterNow}
            className="w-full sm:flex-1 bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2 rounded-md text-sm sm:text-base transition-colors duration-200"
          >
            Register Now
          </Button>

          {/* Join Discord Button - Secondary CTA */}
          <Button
            onClick={handleJoinDiscord}
            variant="outline"
            className="w-full sm:flex-1 border-green-600 text-green-600 hover:bg-green-50 font-medium px-4 py-2 rounded-md text-sm sm:text-base transition-colors duration-200"
          >
            Join Discord
          </Button>

          {/* Got It Button - Close action */}
          <Button
            onClick={handleClose}
            variant="ghost"
            className="w-full sm:w-auto text-muted-foreground hover:text-foreground hover:bg-muted font-medium px-4 py-2 rounded-md text-sm sm:text-base transition-colors duration-200"
          >
            Got It
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}