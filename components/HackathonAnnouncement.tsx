"use client"

import React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Clock, Trophy, Zap, ExternalLink, CalendarDays, Users, Target, Star, Award } from "lucide-react"
import Link from "next/link"
import HackathonActions from "@/components/HackathonActions"

/**
 * Enhanced Hackathon Announcement Component
 * 
 * A beautifully designed, reusable component for hackathon announcements
 * Features:
 * - Gradient design with animated elements
 * - Responsive layout with main card and info cards
 * - Interactive hover effects
 * - Clean and professional aesthetics
 * - GUCC branding integration
 */
export default function HackathonAnnouncement() {
  return (
    <section className="w-full py-20 md:py-28 lg:py-36 relative overflow-hidden bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 dark:from-green-950/30 dark:via-emerald-950/30 dark:to-teal-950/30">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5 dark:opacity-10">
        <div className="absolute top-20 left-20 w-96 h-96 bg-green-400 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-emerald-400 rounded-full mix-blend-multiply filter blur-xl animate-pulse delay-1000"></div>
      </div>

      <div className="container px-4 md:px-6 relative z-10">
        {/* Header Section */}
        <div className="text-center space-y-8 mb-16">
          {/* GUCC Badge */}
          <div className="inline-flex items-center gap-3 rounded-full bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-900/50 dark:to-emerald-900/50 px-6 py-3 text-sm font-semibold text-green-700 dark:text-green-300 border border-green-200/50 dark:border-green-700/50 shadow-lg backdrop-blur-sm">
            <Trophy className="h-5 w-5" />
            <span>Proudly Organized by GUCC</span>
            <div className="flex -space-x-1">
              <Star className="h-4 w-4 text-yellow-500 fill-current" />
              <Star className="h-4 w-4 text-yellow-500 fill-current" />
              <Star className="h-4 w-4 text-yellow-500 fill-current" />
            </div>
          </div>

          {/* Main Title */}
          <h2 className="text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
            <span className="bg-gradient-to-r from-green-600 via-emerald-600 to-green-700 bg-clip-text text-transparent">
              🚀 Hack The AI
            </span>
            <br />
            <span className="text-gray-900 dark:text-white text-3xl md:text-4xl lg:text-5xl">
              Inter University Hackathon
            </span>
          </h2>

          {/* Subtitle */}
          <p className="mx-auto max-w-[800px] text-lg md:text-xl text-muted-foreground leading-relaxed">
            Join the most prestigious AI hackathon organized by Green University Computer Club. 
            Build groundbreaking solutions, compete with brilliant minds, and shape the future of artificial intelligence!
          </p>

          {/* Countdown or Status */}
          <div className="flex justify-center">
            <Badge variant="outline" className="px-4 py-2 text-base bg-gradient-to-r from-orange-100 to-red-100 dark:from-orange-900/30 dark:to-red-900/30 border-orange-300 dark:border-orange-600 text-orange-700 dark:text-orange-300">
              <Clock className="h-4 w-4 mr-2" />
              Registration Deadline Extended!
            </Badge>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {/* Main Announcement Card */}
          <div className="lg:col-span-2">
            <Card className="h-full bg-gradient-to-br from-green-600 via-emerald-600 to-green-700 text-white border-0 shadow-2xl hover:shadow-3xl transition-all duration-500 transform hover:-translate-y-2 relative overflow-hidden">
              {/* Animated Background Elements */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-xl animate-pulse"></div>
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full blur-lg animate-pulse delay-500"></div>
              
              <CardHeader className="pb-6 relative z-10">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <CardTitle className="text-3xl md:text-4xl font-bold flex items-center gap-4">
                    <div className="p-2 bg-white/20 rounded-full backdrop-blur-sm">
                      <Zap className="h-8 w-8" />
                    </div>
                    <span>Deadline Extended!</span>
                  </CardTitle>
                  <div className="flex gap-2">
                    <Badge className="bg-gradient-to-r from-yellow-400 to-orange-400 text-black font-bold px-3 py-1 shadow-lg">
                      🔥 HOT
                    </Badge>
                    <Badge className="bg-white/20 backdrop-blur-sm border-white/30 text-white font-semibold px-3 py-1">
                      NEW
                    </Badge>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-8 relative z-10">
                {/* Key Information */}
                <div className="space-y-6">
                  <div className="flex items-start gap-4 p-4 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20">
                    <div className="p-2 bg-white/20 rounded-full">
                      <Clock className="h-6 w-6 text-green-200" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold mb-2">New Registration Deadline</h3>
                      <p className="text-lg text-green-100">
                        <strong>September 13th, 2025 at 8:00 PM</strong>
                      </p>
                      <p className="text-green-100/80 text-sm mt-1">
                        More time to prepare your team and innovative ideas!
                      </p>
                    </div>
                  </div>

                  <p className="text-green-100 leading-relaxed text-lg">
                    We've extended the deadline to give more brilliant minds the opportunity to participate 
                    in this prestigious hackathon. Don't miss your chance to showcase your AI expertise, 
                    compete with top universities, and win incredible prizes!
                  </p>
                </div>
                
                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                  <Button
                    asChild
                    className="flex-1 bg-white text-green-600 hover:bg-green-50 font-bold py-4 px-6 text-lg shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105"
                  >
                    <Link 
                      href="https://forms.gle/QvzXYQ3hdAHPkkWVA" 
                      target="_blank"
                      className="flex items-center justify-center gap-3"
                    >
                      <Award className="h-5 w-5" />
                      Register Now
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </Button>
                  <HackathonActions className="flex-1" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Side Information Cards */}
          <div className="space-y-6">
            {/* Event Details Card */}
            <Card className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-lg border-green-200/50 dark:border-green-800/50 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 hover:bg-white/95 dark:hover:bg-gray-900/95">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-bold text-green-700 dark:text-green-300 flex items-center gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900/50 rounded-full">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  Event Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-2 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
                    <span className="text-muted-foreground font-medium">Event Type:</span>
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      AI Hackathon
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
                    <span className="text-muted-foreground font-medium">Scope:</span>
                    <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                      Inter University
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
                    <span className="text-muted-foreground font-medium">Organized by:</span>
                    <Badge className="bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold">
                      GUCC
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
                    <span className="text-muted-foreground font-medium">Registration:</span>
                    <Badge variant="destructive" className="bg-gradient-to-r from-orange-500 to-red-500 animate-pulse">
                      Till Sept 13, 8PM
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Why Participate Card */}
            <Card className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-lg border-green-200/50 dark:border-green-800/50 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 hover:bg-white/95 dark:hover:bg-gray-900/95">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-bold text-green-700 dark:text-green-300 flex items-center gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900/50 rounded-full">
                    <Target className="h-5 w-5" />
                  </div>
                  Why Participate?
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { icon: "🏆", text: "Compete with top universities" },
                    { icon: "🤖", text: "Build innovative AI solutions" },
                    { icon: "💰", text: "Win amazing prizes & recognition" },
                    { icon: "🤝", text: "Network with industry experts" },
                    { icon: "📈", text: "Gain valuable experience" },
                    { icon: "🎯", text: "Boost your career prospects" }
                  ].map((item, index) => (
                    <div key={index} className="flex items-center gap-3 p-2 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-all duration-200 group">
                      <span className="text-lg group-hover:scale-110 transition-transform">{item.icon}</span>
                      <span className="text-sm font-medium group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">{item.text}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Participants Card */}
            <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 backdrop-blur-lg border-blue-200/50 dark:border-blue-800/50 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-bold text-blue-700 dark:text-blue-300 flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-full">
                    <Users className="h-5 w-5" />
                  </div>
                  Join the Elite
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-2">500+</div>
                <div className="text-sm text-muted-foreground">Expected Participants</div>
                <div className="mt-4 text-xs text-blue-600 dark:text-blue-400 font-medium">
                  From 50+ Universities Nationwide
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Bottom CTA Section */}
        <div className="text-center mt-16 p-8 bg-gradient-to-r from-green-100/50 to-emerald-100/50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl border border-green-200/50 dark:border-green-700/50 backdrop-blur-sm">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Ready to Shape the Future of AI?
          </h3>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Don't miss this incredible opportunity to showcase your skills, learn from the best, and make your mark in the AI revolution.
          </p>
          <div className="flex justify-center gap-4 flex-wrap">
            <Button asChild size="lg" className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 font-bold shadow-lg">
              <Link href="https://forms.gle/QvzXYQ3hdAHPkkWVA" target="_blank">
                Register Your Team Now
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 font-semibold">
              Learn More
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}