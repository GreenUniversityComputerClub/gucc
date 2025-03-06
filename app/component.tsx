'use client'
import CountUp from "react-countup"

export function AnimatedStat({ end, suffix = "", className = "" }: { end: number; suffix?: string; className?: string }) {
  return (
    <div className={`text-4xl font-bold text-primary ${className}`}>
      <CountUp end={end} suffix={suffix} duration={2.5} />
    </div>
  )
}