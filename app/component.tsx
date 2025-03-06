'use client'
import CountUp from "react-countup"

export function AnimatedStat({ end, suffix = "" }: { end: number; suffix?: string }) {
  return (
    <div className="text-4xl font-bold text-primary">
      <CountUp end={end} suffix={suffix} duration={2.5} />
    </div>
  )
}