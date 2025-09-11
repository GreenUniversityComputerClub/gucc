"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Clock,
  Trophy,
  Zap,
  ExternalLink,
  CalendarDays,
  Users,
  Star,
  Award,
  Crown
} from "lucide-react"
import Link from "next/link"
import HackathonActions from "@/components/HackathonActions"
import { HACKATHON, HACKATHON_SCHEDULE, TIMEZONE } from "@/app/config"

/**
 * 🚀 HackTheAI - Professional Hackathon Announcement Component
 * 
 * A production-ready, fully responsive component for AI hackathon announcements
 * 
 * ✨ Features:
 * - Real-time countdown with dynamic phase management
 * - Mobile-first responsive design with perfect card sizing
 * - Professional animations and micro-interactions
 * - Clean, deployment-ready code architecture
 * - SmythOS branding integration
 * - TypeScript support with proper error handling
 */

// Bangladesh timezone helpers
const BD_TZ = TIMEZONE.tz
const BD_TZ_LABEL = TIMEZONE.label

const formatDateTimeBD = (date: Date, includeTZ = true) => {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: BD_TZ,
  }).format(date)
  return includeTZ ? `${formatted} ${BD_TZ_LABEL}` : formatted
}

const formatShortDateBD = (date: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: BD_TZ,
  }).format(date)

const formatTimeBD = (date: Date, includeTZ = false) => {
  const t = new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: BD_TZ,
  }).format(date)
  return includeTZ ? `${t} ${BD_TZ_LABEL}` : t
}

const formatDayRangeBD = (start: Date, end: Date) => {
  const pStart = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: BD_TZ,
  }).formatToParts(start)
  const pEnd = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: BD_TZ,
  }).formatToParts(end)
  const get = (parts: Intl.DateTimeFormatPart[], type: string) => parts.find(p => p.type === type)?.value || ''
  const d1 = get(pStart, 'day')
  const m1 = get(pStart, 'month')
  const y1 = get(pStart, 'year')
  const d2 = get(pEnd, 'day')
  const m2 = get(pEnd, 'month')
  const y2 = get(pEnd, 'year')
  if (m1 === m2 && y1 === y2) return `${d1}–${d2} ${m1} ${y1}`
  return `${d1} ${m1} ${y1} – ${d2} ${m2} ${y2}`
}

type StageType =
  | 'REG_OPEN'
  | 'PENDING_PRELIM'
  | 'PRELIM'
  | 'PENDING_FINAL_ONLINE'
  | 'FINAL_ONLINE'
  | 'PENDING_FINAL_ONSITE'
  | 'FINAL_ONSITE'
  | 'COMPLETE'

interface StageState {
  stage: StageType
  nextAt: Date | null
  nextLabel: string
  live: boolean
}

interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
}
export default function HackathonAnnouncement() {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({ 
    days: 0, hours: 0, minutes: 0, seconds: 0 
  })
  const [stageState, setStageState] = useState<StageState>({
    stage: 'REG_OPEN',
  nextAt: HACKATHON_SCHEDULE.registrationDeadline,
    nextLabel: 'Registration closes in',
    live: false,
  })

  const computeStage = (now: Date): StageState => {
  const s = HACKATHON_SCHEDULE
    if (now < s.registrationDeadline) {
      return { stage: 'REG_OPEN', nextAt: s.registrationDeadline, nextLabel: 'Registration closes in', live: false }
    }
    if (now < s.prelimStart) {
      return { stage: 'PENDING_PRELIM', nextAt: s.prelimStart, nextLabel: 'Preliminary starts in', live: false }
    }
    if (now <= s.prelimEnd) {
      return { stage: 'PRELIM', nextAt: s.prelimEnd, nextLabel: 'Preliminary ends in', live: true }
    }
    if (now < s.finalOnlineStart) {
      return { stage: 'PENDING_FINAL_ONLINE', nextAt: s.finalOnlineStart, nextLabel: 'Final (Online) starts in', live: false }
    }
    if (now <= s.finalOnlineEnd) {
      return { stage: 'FINAL_ONLINE', nextAt: s.finalOnlineEnd, nextLabel: 'Final (Online) ends in', live: true }
    }
    if (now < s.finalOnsiteStart) {
      return { stage: 'PENDING_FINAL_ONSITE', nextAt: s.finalOnsiteStart, nextLabel: 'Grand Finale starts in', live: false }
    }
    if (now <= s.finalOnsiteEnd) {
      return { stage: 'FINAL_ONSITE', nextAt: s.finalOnsiteEnd, nextLabel: 'Grand Finale ends in', live: true }
    }
    return { stage: 'COMPLETE', nextAt: null, nextLabel: 'Event completed', live: false }
  }

  // Real-time stage + countdown timer
  useEffect(() => {
    const tick = () => {
      const now = new Date()
      const nextStage = computeStage(now)
      setStageState(nextStage)
      if (nextStage.nextAt) {
        const difference = nextStage.nextAt.getTime() - now.getTime()
        setTimeLeft({
          days: Math.max(0, Math.floor(difference / (1000 * 60 * 60 * 24))),
          hours: Math.max(0, Math.floor((difference / (1000 * 60 * 60)) % 24)),
          minutes: Math.max(0, Math.floor((difference / 1000 / 60) % 60)),
          seconds: Math.max(0, Math.floor((difference / 1000) % 60)),
        })
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 })
      }
    }

    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [])

  const isRegistrationOpen = stageState.stage === 'REG_OPEN'

  // Dynamic status helpers for timeline cards
  type PhaseKey = 'reg' | 'prelim' | 'finalOnline' | 'finalOnsite'
  type PhaseStatus = 'UPCOMING' | 'LIVE' | 'DONE'

  const getPhaseStatus = (phase: PhaseKey): PhaseStatus => {
    const st = stageState.stage
    switch (phase) {
      case 'reg':
        return st === 'REG_OPEN' ? 'UPCOMING' : 'DONE'
      case 'prelim':
        if (st === 'PRELIM') return 'LIVE'
        if (st === 'REG_OPEN' || st === 'PENDING_PRELIM') return 'UPCOMING'
        return 'DONE'
      case 'finalOnline':
        if (st === 'FINAL_ONLINE') return 'LIVE'
        if (st === 'REG_OPEN' || st === 'PENDING_PRELIM' || st === 'PRELIM' || st === 'PENDING_FINAL_ONLINE') return 'UPCOMING'
        return 'DONE'
      case 'finalOnsite':
        if (st === 'FINAL_ONSITE') return 'LIVE'
        if (
          st === 'REG_OPEN' || st === 'PENDING_PRELIM' || st === 'PRELIM' ||
          st === 'PENDING_FINAL_ONLINE' || st === 'FINAL_ONLINE' || st === 'PENDING_FINAL_ONSITE'
        ) return 'UPCOMING'
        return 'DONE'
    }
  }

  const statusBadgeClasses = (status: PhaseStatus) =>
    status === 'LIVE'
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
      : status === 'UPCOMING'
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
        : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
  return (
    <section className="w-full relative overflow-hidden bg-gradient-to-br from-slate-50 via-gray-50/30 to-white dark:from-slate-950 dark:via-gray-950/30 dark:to-gray-900">
      {/* Enhanced Background System */}
      <div className="absolute inset-0">
        <div className="absolute top-10 left-10 w-72 h-72 bg-gradient-to-r from-green-400/8 to-emerald-400/8 rounded-full blur-3xl animate-pulse motion-reduce:animate-none"></div>
        <div className="absolute bottom-10 right-10 w-64 h-64 bg-gradient-to-r from-blue-400/6 to-purple-400/6 rounded-full blur-3xl animate-pulse delay-1000 motion-reduce:animate-none"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-56 h-56 bg-gradient-to-r from-orange-400/4 to-pink-400/4 rounded-full blur-3xl animate-pulse delay-500 motion-reduce:animate-none"></div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 lg:py-16 relative z-10">
        {/* Header Section */}
        <div className="text-center space-y-6 mb-12">
          {/* Event Badges */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 px-4 py-2 border border-green-200/50 dark:border-green-700/50 shadow-lg">
              <Crown className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              <span className="text-sm font-bold text-green-700 dark:text-green-300">Organized by {HACKATHON.organizer}</span>
              <div className="flex items-center gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-2.5 w-2.5 text-yellow-500 fill-current" />
                ))}
              </div>
            </div>

            <Link
              href="https://smythos.com/hacktheai/"
              target="_blank"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-slate-100 to-gray-100 dark:from-slate-800 dark:to-gray-800 px-4 py-2 border border-slate-200/60 dark:border-slate-700/60 shadow-lg"
            >
              <span className="text-xs text-gray-600 dark:text-gray-300">Powered by</span>
              <span className="text-sm font-bold text-gray-900 dark:text-white">SmythOS</span>
              <ExternalLink className="h-3 w-3 opacity-70" />
            </Link>
          </div>

          {/* Main Title */}
          <div className="space-y-4">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight">
              <span className="block bg-gradient-to-r from-green-600 via-emerald-500 to-blue-600 bg-clip-text text-transparent mb-2">
                🚀 {HACKATHON.name}
              </span>
              <span className="block text-xl sm:text-2xl md:text-3xl lg:text-4xl text-gray-900 dark:text-white font-extrabold">
                Inter University AI Hackathon
              </span>
            </h1>
            <p className="text-lg sm:text-xl md:text-2xl text-gray-600 dark:text-gray-300 font-semibold">
              🌟 Bangladesh's Premier AI Competition
            </p>
          </div>

          {/* Enhanced Description */}
          <p className="mx-auto max-w-4xl text-base md:text-lg text-gray-600 dark:text-gray-300 leading-relaxed">
            Join <span className="font-bold text-green-600 dark:text-green-400">{`${HACKATHON.participantsExpected}+`} brilliant minds</span> from{' '}
            <span className="font-bold text-blue-600 dark:text-blue-400">{`${HACKATHON.universitiesCount}+`} universities</span> in Bangladesh's most prestigious AI hackathon.
            Compete for <span className="font-bold text-yellow-600 dark:text-yellow-400">${HACKATHON.prizePoolUSD} USD prizes</span>,{' '}
            <span className="font-bold text-purple-600 dark:text-purple-400">{HACKATHON.jobOffers} remote job opportunities</span>, and premium AI enablement{' '}
            <span className="font-bold text-emerald-600 dark:text-emerald-400">powered by SmythOS</span>.
          </p>

          {/* Status & Countdown */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Badge
              variant="outline"
              className={`px-4 py-2 text-sm font-bold border ${
                stageState.live
                  ? 'bg-green-600/10 border-green-600/40 text-green-700 dark:text-green-300'
                  : isRegistrationOpen
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                    : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              {stageState.live ? (
                <span className="inline-flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  LIVE NOW
                </span>
              ) : isRegistrationOpen ? (
                <span className="inline-flex items-center gap-2">
                  <Zap className="h-4 w-4" /> REGISTRATION OPEN
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Clock className="h-4 w-4" /> REGISTRATION CLOSED
                </span>
              )}
            </Badge>

            {stageState.nextAt && (
              <div
                className="flex items-center gap-2 bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-900/30 dark:to-gray-900/30 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700"
                aria-live="polite"
                aria-atomic="true"
                title={formatDateTimeBD(stageState.nextAt)}
              >
                <Clock className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                <span className="text-sm font-bold text-gray-700 dark:text-gray-200">
                  {stageState.nextLabel}: {timeLeft.days}d {timeLeft.hours}h {timeLeft.minutes}m {timeLeft.seconds}s
                </span>
              </div>
            )}
            <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 sm:mt-0">
              All times in Bangladesh Time ({BD_TZ_LABEL})
            </span>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-7 gap-6 max-w-7xl mx-auto mb-8">
          {/* Left Sidebar - Why Join */}
          <div className="lg:col-span-2 group">
            <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 backdrop-blur-lg border-blue-200/50 dark:border-blue-800/50 hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 hover:rotate-1 h-full relative overflow-hidden">
              {/* Animated Background */}
              <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 to-indigo-400/5 group-hover:from-blue-400/10 group-hover:to-indigo-400/10 transition-all duration-500"></div>
              <div className="absolute top-0 right-0 w-20 h-20 bg-blue-400/10 rounded-full blur-xl animate-pulse group-hover:bg-blue-400/20 transition-all duration-500"></div>
              
              <CardHeader className="pb-3 relative z-10">
                <CardTitle className="text-base font-bold text-blue-700 dark:text-blue-300 flex items-center gap-2">
                  <div className="p-1.5 bg-blue-100 dark:bg-blue-900/50 rounded-full group-hover:scale-110 transition-transform duration-300">
                    <Users className="h-3 w-3 group-hover:animate-bounce" />
                  </div>
                  Why Join This Hackathon?
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 flex-1 relative z-10">
                <div className="grid grid-cols-1 gap-2 text-xs">
                  {[
                    { icon: "🚀", text: "Career acceleration & growth", color: "text-blue-600 dark:text-blue-400" },
                    { icon: "💼", text: "Direct hiring opportunities", color: "text-green-600 dark:text-green-400" },
                    { icon: "🎯", text: "Real AI problem solving", color: "text-purple-600 dark:text-purple-400" },
                    { icon: "🌟", text: "Industry networking", color: "text-orange-600 dark:text-orange-400" },
                    { icon: "💡", text: "Learn cutting-edge AI", color: "text-indigo-600 dark:text-indigo-400" },
                    { icon: "🏆", text: "Build winning portfolio", color: "text-red-600 dark:text-red-400" }
                  ].map((item, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 rounded-lg hover:bg-blue-100/50 dark:hover:bg-blue-900/20 transition-all duration-300 group/item hover:scale-105 hover:shadow-md">
                      <span className="text-sm group-hover/item:scale-125 transition-transform duration-300 group-hover/item:animate-bounce">{item.icon}</span>
                      <span className={`font-medium group-hover/item:font-bold transition-all duration-300 ${item.color} text-xs`}>{item.text}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-3 border-t border-blue-200/50 dark:border-blue-700/50 text-center bg-gradient-to-r from-blue-50/50 to-indigo-50/50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-3">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 animate-pulse">{`${HACKATHON.participantsExpected}+`}</div>
                  <div className="text-xs text-blue-500 dark:text-blue-400 font-medium">Expected Participants</div>
                  <div className="text-[10px] text-blue-500 dark:text-blue-400 mt-1 flex items-center justify-center gap-1">
                    <span>🏫</span>
                    <span>{`From ${HACKATHON.universitiesCount}+ Universities`}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Announcement Card */}
          <div className="lg:col-span-3 group">
            <Card className="bg-gradient-to-br from-green-600 via-emerald-600 to-green-700 text-white border-0 shadow-2xl hover:shadow-4xl transition-all duration-700 transform hover:-translate-y-3 hover:scale-[1.02] relative overflow-hidden h-full">
              {/* Enhanced Animated Background Elements */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl animate-pulse group-hover:bg-white/20 transition-all duration-700 motion-reduce:animate-none"></div>
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full blur-xl animate-pulse delay-500 group-hover:bg-white/15 transition-all duration-700 motion-reduce:animate-none"></div>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 motion-reduce:transition-none motion-reduce:transform-none"></div>
              
              <CardHeader className="pb-3 relative z-10">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-xl md:text-2xl font-bold flex items-center gap-2">
                    <div className="p-1.5 bg-white/20 rounded-full backdrop-blur-sm group-hover:scale-125 group-hover:rotate-12 transition-all duration-500">
                      <Zap className="h-4 w-4 group-hover:animate-spin" />
                    </div>
                    <span className="group-hover:animate-pulse">
                      {stageState.live
                        ? stageState.stage === 'PRELIM'
                          ? 'Preliminary Round • Live'
                          : stageState.stage === 'FINAL_ONLINE'
                            ? 'Final Round (Online) • Live'
                            : 'Grand Finale • Live'
                        : isRegistrationOpen
                          ? 'Registration Open'
                          : 'Registration Closed'}
                    </span>
                  </CardTitle>
                  <div className="flex gap-1.5">
                    <Badge className="bg-gradient-to-r from-yellow-400 to-orange-400 text-black font-bold px-2 py-1 text-xs shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-110 animate-bounce">
                      🔥 HOT
                    </Badge>
                    <Badge className="bg-white/20 backdrop-blur-sm border-white/30 text-white font-semibold px-2 py-1 text-xs hover:bg-white/30 transition-all duration-300 animate-pulse">
                      NEW
                    </Badge>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 relative z-10 flex-1">
                {/* Enhanced Key Information */}
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20 hover:bg-white/15 transition-all duration-300 group/info">
                    <div className="p-1.5 bg-white/20 rounded-full group-hover/info:scale-110 transition-transform duration-300">
                      <Clock className="h-4 w-4 text-green-200 group-hover/info:animate-spin" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-bold mb-1 group-hover/info:text-green-100 transition-colors duration-300">New Registration Deadline</h3>
                      <p className="text-sm text-green-100 font-semibold group-hover/info:text-white transition-colors duration-300">
                        {formatDateTimeBD(HACKATHON_SCHEDULE.registrationDeadline)}
                      </p>
                      <p className="text-green-100/80 text-xs mt-0.5 group-hover/info:text-green-100 transition-colors duration-300">
                        More time to prepare your innovative ideas!
                      </p>
                    </div>
                  </div>

                  <p className="text-green-100 leading-relaxed text-sm group-hover:text-white transition-colors duration-300">
                    Extended deadline gives more brilliant minds the opportunity to participate 
                    in this prestigious hackathon. Showcase your AI expertise and win amazing prizes!
                  </p>
                </div>
                
                {/* Enhanced Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Button
                    asChild
                    disabled={!isRegistrationOpen}
                    className={`flex-1 font-bold py-3 px-4 text-sm shadow-xl hover:shadow-2xl transition-all duration-500 transform hover:scale-110 hover:-translate-y-1 group/btn ${
                      isRegistrationOpen
                        ? 'bg-white text-green-600 hover:bg-green-50'
                        : 'bg-gray-200 text-gray-500 cursor-not-allowed hover:scale-100 hover:-translate-y-0'
                    }`}
                  >
                    <Link
                      href="https://forms.gle/QvzXYQ3hdAHPkkWVA" 
                      target="_blank"
                      className="flex items-center justify-center gap-2"
                    >
                      <Award className="h-4 w-4 group-hover/btn:animate-bounce" />
                      {isRegistrationOpen ? 'Register Now' : 'Registration Closed'}
                      <ExternalLink className="h-3 w-3 group-hover/btn:rotate-45 transition-transform duration-300" />
                    </Link>
                  </Button>
                  <div className="flex-1">
                    <HackathonActions className="w-full" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Sidebar */}
          <div className="lg:col-span-2 space-y-4 flex flex-col">
            {/* Event Details Card */}
            <Card className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-green-200/50 dark:border-green-800/50 hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 hover:-rotate-1 flex-1 group relative overflow-hidden">
              {/* Animated Background */}
              <div className="absolute inset-0 bg-gradient-to-br from-green-50/50 to-emerald-50/50 dark:from-green-900/20 dark:to-emerald-900/20 group-hover:from-green-100/70 group-hover:to-emerald-100/70 dark:group-hover:from-green-900/30 dark:group-hover:to-emerald-900/30 transition-all duration-500"></div>
              
              <CardHeader className="pb-2 relative z-10">
                <CardTitle className="text-sm font-bold text-green-700 dark:text-green-300 flex items-center gap-2">
                  <div className="p-1.5 bg-green-100 dark:bg-green-900/50 rounded-full group-hover:scale-110 group-hover:rotate-12 transition-all duration-300">
                    <CalendarDays className="h-3 w-3 group-hover:animate-pulse" />
                  </div>
                  Event Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 flex-1 relative z-10">
        <div className="grid grid-cols-1 gap-2 text-xs">
                  {[
          { label: "Type:", value: "AI Hackathon", bg: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
          { label: "Scope:", value: "Inter University", bg: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
          { label: "Organizer:", value: "GUCC", bg: "bg-gradient-to-r from-green-500 to-emerald-500 text-white" },
          { label: isRegistrationOpen ? "Deadline:" : "Registration:", value: isRegistrationOpen ? `${formatShortDateBD(HACKATHON_SCHEDULE.registrationDeadline)}, ${formatTimeBD(HACKATHON_SCHEDULE.registrationDeadline)}` : "Closed", bg: isRegistrationOpen ? "bg-gradient-to-r from-orange-500 to-red-500 text-white animate-pulse motion-reduce:animate-none" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" }
                  ].map((item, index) => (
                    <div key={index} className="flex justify-between items-center p-2 rounded-lg hover:bg-green-50/80 dark:hover:bg-green-900/20 transition-all duration-300 group/item">
                      <span className="text-muted-foreground font-medium group-hover/item:text-green-600 dark:group-hover/item:text-green-400 transition-colors">{item.label}</span>
                      <Badge variant="secondary" className={`${item.bg} text-xs py-1 px-2 group-hover/item:scale-105 transition-transform duration-200 font-bold`}>
                        {item.value}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Prizes & Opportunities Card */}
            <Card className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-green-200/50 dark:border-green-800/50 hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 hover:rotate-1 flex-1 group relative overflow-hidden">
              {/* Animated Background */}
              <div className="absolute inset-0 bg-gradient-to-br from-green-50/50 to-emerald-50/50 dark:from-green-900/20 dark:to-emerald-900/20 group-hover:from-green-100/70 group-hover:to-emerald-100/70 dark:group-hover:from-green-900/30 dark:group-hover:to-emerald-900/30 transition-all duration-500"></div>
              <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-yellow-400/10 to-orange-400/10 rounded-full blur-xl group-hover:from-yellow-400/20 group-hover:to-orange-400/20 transition-all duration-500"></div>
              
              <CardHeader className="pb-2 relative z-10">
                <CardTitle className="text-sm font-bold text-green-700 dark:text-green-300 flex items-center gap-2">
                  <div className="p-1.5 bg-green-100 dark:bg-green-900/50 rounded-full group-hover:scale-110 group-hover:rotate-12 transition-all duration-300">
                    <Trophy className="h-3 w-3 group-hover:animate-bounce" />
                  </div>
                  Prizes & Opportunities
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 flex-1 relative z-10">
                {/* Remote Job Offers */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-lg p-2.5 border border-blue-200/50 dark:border-blue-800/30 hover:shadow-lg transition-all duration-300 hover:scale-105 group/job">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-blue-600 dark:text-blue-400 text-xs font-bold group-hover/job:animate-pulse">💼 Remote Jobs</span>
                  </div>
                  <div className="text-xs space-y-0.5">
                    <p className="font-bold text-blue-700 dark:text-blue-300">5 Developer Positions</p>
                    <p className="text-blue-600 dark:text-blue-400 font-semibold">USD $700+ per month</p>
                    <p className="text-blue-500 dark:text-blue-400 text-[10px] flex items-center gap-1">
                      <span>⚡</span>
                      <span>Flexible • Remote-first</span>
                    </p>
                  </div>
                </div>

                {/* Cash Prizes */}
                <div className="bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-950/20 dark:to-orange-950/20 rounded-lg p-2.5 border border-yellow-200/50 dark:border-yellow-800/30 hover:shadow-lg transition-all duration-300 hover:scale-105 group/cash">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-yellow-600 dark:text-yellow-400 text-xs font-bold group-hover/cash:animate-pulse">🥇 Cash Prizes</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-xs">
                    {[
                      { place: "1st", amount: "$300", bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-300" },
                      { place: "2nd", amount: "$200", bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-700 dark:text-gray-300" },
                      { place: "3rd", amount: "$100", bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-300" }
                    ].map((prize, index) => (
                      <div key={index} className={`text-center ${prize.bg} rounded-md p-1.5 hover:scale-110 transition-transform duration-200 group/prize`}>
                        <div className={`font-bold ${prize.text} text-[10px] group-hover/prize:animate-bounce`}>{prize.place}</div>
                        <div className={`${prize.text} text-[9px] font-semibold`}>{prize.amount}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Premium Access & Training */}
                <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 rounded-lg p-2.5 border border-purple-200/50 dark:border-purple-800/30 hover:shadow-lg transition-all duration-300 hover:scale-105 group/premium">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-purple-600 dark:text-purple-400 text-xs font-bold group-hover/premium:animate-pulse">🎓 Premium Training</span>
                  </div>
                  <div className="text-xs space-y-1">
                    {[
                      "SmythOS Premium",
                      "AI Agents training"
                    ].map((item, index) => (
                      <div key={index} className="flex items-center gap-1.5 hover:scale-105 transition-transform duration-200 group/item">
                        <span className="w-1.5 h-1.5 bg-purple-400 rounded-full group-hover/item:animate-ping"></span>
                        <span className="text-purple-600 dark:text-purple-400 text-[10px] font-medium">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Enhanced Event Calendar Section */}
        <div className="mt-10 mb-10 relative">
          {/* Background Glow */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-400/5 via-purple-400/5 to-green-400/5 blur-3xl rounded-3xl"></div>
          
          {/* Calendar Header */}
          <div className="text-center mb-8 relative z-10">
            <div className="inline-block relative">
              <h3 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mb-2 relative z-10">
                📅 Event Calendar
              </h3>
              <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 via-purple-400/20 to-green-400/20 blur-2xl -z-10 animate-pulse"></div>
            </div>
            <p className="text-muted-foreground max-w-xl mx-auto text-sm font-medium">
              Mark your calendars and prepare for an exciting journey of innovation and collaboration
            </p>
          </div>

          {/* Enhanced Timeline Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto relative z-10">
            {/* Registration Deadline */}
            <Card className="relative bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20 border-red-200/50 dark:border-red-800/30 hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-3 hover:rotate-2 group overflow-hidden">
              {isRegistrationOpen && HACKATHON.showExtendedRibbon && (
                <div className="absolute -top-2 -right-2 bg-gradient-to-r from-red-500 to-orange-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg animate-bounce">
                  EXTENDED
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-br from-red-400/5 to-orange-400/5 group-hover:from-red-400/10 group-hover:to-orange-400/10 transition-all duration-500"></div>
              
              <CardHeader className="pb-2 relative z-10">
                <div className="flex items-center gap-2 mb-1">
                  <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-full group-hover:scale-125 group-hover:rotate-12 transition-all duration-300">
                    <Clock className="h-4 w-4 text-red-600 dark:text-red-400 group-hover:animate-spin" />
                  </div>
                  <Badge className="text-xs font-bold px-2 py-1 group-hover:animate-pulse bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                    {getPhaseStatus('reg') === 'UPCOMING' ? 'UPCOMING' : 'CLOSED'}
                  </Badge>
                </div>
                <CardTitle className="text-base font-bold text-red-700 dark:text-red-300 group-hover:text-red-600 dark:group-hover:text-red-200 transition-colors duration-300">
                  {formatShortDateBD(HACKATHON_SCHEDULE.registrationDeadline)}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4 relative z-10">
                <h4 className="font-bold text-red-600 dark:text-red-400 mb-1 text-sm group-hover:animate-pulse">Registration Deadline</h4>
                <p className="text-xs text-red-600/80 dark:text-red-400/80 leading-relaxed">
                  Last day to register for the hackathon
                </p>
                <p className="text-xs font-bold text-red-700 dark:text-red-300 mt-1 bg-red-100/50 dark:bg-red-900/30 rounded px-2 py-1">
                  ⏰ {isRegistrationOpen ? `Closes ${formatTimeBD(HACKATHON_SCHEDULE.registrationDeadline)} ${BD_TZ_LABEL}` : 'Closed'}
                </p>
              </CardContent>
            </Card>

            {/* Preliminary Round */}
            <Card className={`bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-200/50 dark:border-blue-800/30 hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-3 hover:-rotate-1 group overflow-hidden ${getPhaseStatus('prelim') === 'LIVE' ? 'ring-2 ring-blue-400/60 dark:ring-blue-500/60' : ''}`}>
              <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 to-indigo-400/5 group-hover:from-blue-400/10 group-hover:to-indigo-400/10 transition-all duration-500"></div>
              
              <CardHeader className="pb-2 relative z-10">
                <div className="flex items-center gap-2 mb-1">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-full group-hover:scale-125 group-hover:rotate-12 transition-all duration-300">
                    <Users className="h-4 w-4 text-blue-600 dark:text-blue-400 group-hover:animate-bounce" />
                  </div>
                  <Badge className={`text-xs px-2 py-1 ${statusBadgeClasses(getPhaseStatus('prelim'))}`}>
                    {getPhaseStatus('prelim')}
                  </Badge>
                </div>
                <CardTitle className="text-base font-bold text-blue-700 dark:text-blue-300 group-hover:text-blue-600 dark:group-hover:text-blue-200 transition-colors duration-300">
                  {formatDayRangeBD(HACKATHON_SCHEDULE.prelimStart, HACKATHON_SCHEDULE.prelimEnd)}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4 relative z-10">
                <h4 className="font-bold text-blue-600 dark:text-blue-400 mb-1 text-sm">Preliminary Round</h4>
                <p className="text-xs text-blue-600/80 dark:text-blue-400/80 leading-relaxed">
                  Initial screening and team selection process
                </p>
                <div className="flex items-center gap-1 mt-2">
                  <span className="text-blue-600 dark:text-blue-400 text-xs">🔍</span>
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Team Formation</span>
                </div>
              </CardContent>
            </Card>

            {/* Final Round Online */}
            <Card className={`bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 border-purple-200/50 dark:border-purple-800/30 hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-3 hover:rotate-1 group overflow-hidden ${getPhaseStatus('finalOnline') === 'LIVE' ? 'ring-2 ring-purple-400/60 dark:ring-purple-500/60' : ''}`}>
              <div className="absolute inset-0 bg-gradient-to-br from-purple-400/5 to-pink-400/5 group-hover:from-purple-400/10 group-hover:to-pink-400/10 transition-all duration-500"></div>
              
              <CardHeader className="pb-2 relative z-10">
                <div className="flex items-center gap-2 mb-1">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-full group-hover:scale-125 group-hover:rotate-12 transition-all duration-300">
                    <Zap className="h-4 w-4 text-purple-600 dark:text-purple-400 group-hover:animate-pulse" />
                  </div>
                  <Badge className={`text-xs px-2 py-1 ${statusBadgeClasses(getPhaseStatus('finalOnline'))}`}>
                    {getPhaseStatus('finalOnline')}
                  </Badge>
                </div>
                <CardTitle className="text-base font-bold text-purple-700 dark:text-purple-300 group-hover:text-purple-600 dark:group-hover:text-purple-200 transition-colors duration-300">
                  {formatDayRangeBD(HACKATHON_SCHEDULE.finalOnlineStart, HACKATHON_SCHEDULE.finalOnlineEnd)}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4 relative z-10">
                <h4 className="font-bold text-purple-600 dark:text-purple-400 mb-1 text-sm">Final Round (Online)</h4>
                <p className="text-xs text-purple-600/80 dark:text-purple-400/80 leading-relaxed">
                  Online hackathon phase with virtual collaboration
                </p>
                <div className="flex items-center gap-1 mt-2">
                  <span className="text-purple-600 dark:text-purple-400 text-xs">💻</span>
                  <span className="text-xs font-medium text-purple-700 dark:text-purple-300">Virtual Collaboration</span>
                </div>
              </CardContent>
            </Card>

            {/* Final Round Onsite */}
            <Card className={`bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-green-200/50 dark:border-green-800/30 hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-3 hover:-rotate-2 group overflow-hidden ${getPhaseStatus('finalOnsite') === 'LIVE' ? 'ring-2 ring-emerald-400/60 dark:ring-emerald-500/60' : ''}`}>
              <div className="absolute inset-0 bg-gradient-to-br from-green-400/5 to-emerald-400/5 group-hover:from-green-400/10 group-hover:to-emerald-400/10 transition-all duration-500"></div>
              
              <CardHeader className="pb-2 relative z-10">
                <div className="flex items-center gap-2 mb-1">
                  <div className="p-2 bg-green-100 dark:bg-green-900/50 rounded-full group-hover:scale-125 group-hover:rotate-12 transition-all duration-300">
                    <Trophy className="h-4 w-4 text-green-600 dark:text-green-400 group-hover:animate-bounce" />
                  </div>
                  <Badge className={`text-xs px-2 py-1 ${statusBadgeClasses(getPhaseStatus('finalOnsite'))}`}>
                    {getPhaseStatus('finalOnsite')}
                  </Badge>
                </div>
                <CardTitle className="text-base font-bold text-green-700 dark:text-green-300 group-hover:text-green-600 dark:group-hover:text-green-200 transition-colors duration-300">
                  {formatShortDateBD(HACKATHON_SCHEDULE.finalOnsiteStart)}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4 relative z-10">
                <h4 className="font-bold text-green-600 dark:text-green-400 mb-1 text-sm">Final Round (Onsite)</h4>
                <p className="text-xs text-green-600/80 dark:text-green-400/80 leading-relaxed">
                  At Green University of Bangladesh
                </p>
                <div className="flex items-center gap-1 mt-2 bg-green-100/50 dark:bg-green-900/30 rounded px-2 py-1">
                  <span className="text-green-600 dark:text-green-400 text-xs">🏛️</span>
                  <span className="text-xs font-bold text-green-700 dark:text-green-300">Final Presentations</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Enhanced Timeline Connector */}
          <div className="hidden lg:flex justify-center mt-6 mb-6 relative z-10">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="w-8 h-1 bg-gradient-to-r from-red-300 to-blue-300 rounded-full animate-pulse"></div>
              <div className="w-3 h-3 bg-blue-400 rounded-full animate-ping shadow-lg"></div>
              <div className="w-8 h-1 bg-gradient-to-r from-blue-300 to-purple-300 rounded-full animate-pulse delay-200"></div>
              <div className="w-3 h-3 bg-purple-400 rounded-full animate-ping delay-300 shadow-lg"></div>
              <div className="w-8 h-1 bg-gradient-to-r from-purple-300 to-green-300 rounded-full animate-pulse delay-500"></div>
              <div className="w-3 h-3 bg-green-400 rounded-full animate-ping delay-700 shadow-lg"></div>
            </div>
          </div>
        </div>

  {/* Enhanced Bottom CTA Section */}
  <div className="text-center mt-12 relative">
          {/* Background Glow */}
          <div className="absolute inset-0 bg-gradient-to-r from-green-400/10 via-emerald-400/10 to-green-400/10 blur-3xl rounded-3xl animate-pulse"></div>
          
          <div className="relative z-10 p-8 bg-gradient-to-r from-green-100/60 to-emerald-100/60 dark:from-green-900/30 dark:to-emerald-900/30 rounded-3xl border border-green-200/50 dark:border-green-700/50 backdrop-blur-xl shadow-2xl hover:shadow-3xl transition-all duration-500 transform hover:scale-[1.02] max-w-4xl mx-auto group">
            {/* Floating Elements */}
            <div className="absolute top-4 right-4 w-2 h-2 bg-green-400/50 rounded-full animate-ping"></div>
            <div className="absolute bottom-4 left-4 w-1.5 h-1.5 bg-emerald-400/50 rounded-full animate-ping delay-300"></div>
            
            <div className="relative z-10">
              <h3 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-3 group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors duration-500">
                🚀 Ready to Shape the Future of AI?
              </h3>
              <p className="text-muted-foreground mb-6 max-w-2xl mx-auto text-base leading-relaxed font-medium">
                Don't miss this incredible opportunity to showcase your skills, learn from the best, 
                and make your mark in the AI revolution. Join 800+ brilliant minds!
              </p>
              
              <div className="flex justify-center gap-4 flex-wrap">
                <Button 
                  asChild 
                  size="lg" 
                  className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 font-bold shadow-xl hover:shadow-2xl px-8 py-4 text-base transition-all duration-500 transform hover:scale-110 hover:-translate-y-1 group/btn"
                >
                  <Link href="https://forms.gle/QvzXYQ3hdAHPkkWVA" target="_blank" className="flex items-center gap-2">
                    <Award className="h-5 w-5 group-hover/btn:animate-bounce" />
                    Register Your Team Now
                    <ExternalLink className="h-4 w-4 group-hover/btn:rotate-45 transition-transform duration-300" />
                  </Link>
                </Button>
                
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="border-2 border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 font-bold px-8 py-4 text-base shadow-lg hover:shadow-xl transition-all duration-500 transform hover:scale-110 hover:-translate-y-1 group/btn2"
                >
                  <Link href="https://smythos.com/hacktheai/" target="_blank" className="flex items-center gap-2">
                    <span className="group-hover/btn2:animate-pulse">📖</span>
                    Learn More
                  </Link>
                </Button>
              </div>
              
              {/* Stats Row */}
              <div className="flex justify-center items-center gap-8 mt-6 pt-6 border-t border-green-200/50 dark:border-green-700/50">
                {[
                  { icon: "👥", value: `${HACKATHON.participantsExpected}+`, label: "Participants" },
                  { icon: "🏫", value: `${HACKATHON.universitiesCount}+`, label: "Universities" },
                  { icon: "💰", value: `$${HACKATHON.prizePoolUSD}+`, label: "Prize Pool" },
                  { icon: "🏆", value: `${HACKATHON.jobOffers}`, label: "Job Offers" }
                ].map((stat, index) => (
                  <div key={index} className="text-center group/stat hover:scale-110 transition-transform duration-300">
                    <div className="text-lg group-hover/stat:animate-bounce">{stat.icon}</div>
                    <div className="text-xl font-bold text-green-600 dark:text-green-400">{stat.value}</div>
                    <div className="text-xs text-muted-foreground font-medium">{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Powered by SmythOS footer */}
              <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                <span className="opacity-80">Powered by</span>
                <Link
                  href="https://smythos.com/hacktheai/"
                  target="_blank"
                  className="inline-flex items-center gap-1 font-semibold hover:underline"
                >
                  <span>SmythOS</span>
                  <ExternalLink className="h-3 w-3 opacity-70" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}