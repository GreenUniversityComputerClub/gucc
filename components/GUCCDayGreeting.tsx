"use client";

import { useEffect, useState } from "react";
import { X, Sparkles, PartyPopper, Heart } from "lucide-react";
import Confetti from "react-confetti";

export default function GUCCDayGreeting() {
  const [isVisible, setIsVisible] = useState(true);
  const [showConfetti, setShowConfetti] = useState(true);
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    setWindowSize({
      width: window.innerWidth,
      height: window.innerHeight,
    });

    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener("resize", handleResize);

    // Stop confetti after 10 seconds
    const timer = setTimeout(() => {
      setShowConfetti(false);
    }, 10000);

    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timer);
    };
  }, []);

  if (!isVisible) return null;

  return (
    <>
      {showConfetti && (
        <Confetti
          width={windowSize.width}
          height={windowSize.height}
          recycle={false}
          numberOfPieces={500}
          colors={["#10b981", "#059669", "#047857", "#065f46", "#064e3b"]}
        />
      )}
      
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-500">
        <div className="relative max-w-2xl w-full bg-gradient-to-br from-green-50 via-emerald-50 to-green-100 dark:from-green-950 dark:via-emerald-950 dark:to-green-900 rounded-3xl shadow-2xl overflow-hidden border-4 border-green-500/30 animate-in zoom-in-95 duration-700">
          {/* Close button */}
          <button
            onClick={() => setIsVisible(false)}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 transition-all duration-200 shadow-lg hover:shadow-xl group"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-slate-700 dark:text-slate-300 group-hover:rotate-90 transition-transform duration-300" />
          </button>

          {/* Decorative elements */}
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-green-400/20 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-emerald-400/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
          </div>

          <div className="relative p-8 md:p-12 text-center">
            {/* Icon header */}
            <div className="flex justify-center gap-3 mb-6 animate-bounce">
              <PartyPopper className="w-10 h-10 md:w-12 md:h-12 text-green-600 dark:text-green-400" />
              <Sparkles className="w-10 h-10 md:w-12 md:h-12 text-emerald-600 dark:text-emerald-400" />
              <Heart className="w-10 h-10 md:w-12 md:h-12 text-green-600 dark:text-green-400" />
            </div>

            {/* Main greeting */}
            <h1 className="text-4xl md:text-6xl font-black mb-4 bg-gradient-to-r from-green-600 via-emerald-600 to-green-700 dark:from-green-400 dark:via-emerald-400 dark:to-green-500 bg-clip-text text-transparent animate-in slide-in-from-bottom-4 duration-700 delay-200">
              Happy GUCC Day! 🎉
            </h1>

            {/* Anniversary badge */}
            <div className="inline-flex items-center gap-2 px-6 py-3 mb-6 bg-green-600 dark:bg-green-500 text-white rounded-full shadow-lg animate-in slide-in-from-bottom-4 duration-700 delay-300">
              <Sparkles className="w-5 h-5" />
              <span className="text-2xl md:text-3xl font-bold">12 Years of Excellence</span>
              <Sparkles className="w-5 h-5" />
            </div>

            {/* Message */}
            <p className="text-lg md:text-xl text-slate-700 dark:text-slate-200 mb-6 leading-relaxed max-w-xl mx-auto animate-in slide-in-from-bottom-4 duration-700 delay-500">
              Today marks <span className="font-bold text-green-600 dark:text-green-400">12 incredible years</span> of 
              innovation, learning, and growth! 🌟
            </p>

            <p className="text-base md:text-lg text-slate-600 dark:text-slate-300 mb-8 max-w-xl mx-auto animate-in slide-in-from-bottom-4 duration-700 delay-700">
              Thank you to all our members, supporters, and the amazing community who made this journey unforgettable. 
              Here's to many more years of inspiring minds and building the future! 💚
            </p>

            {/* Date */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg border border-green-200 dark:border-green-700 animate-in slide-in-from-bottom-4 duration-700 delay-1000">
              <span className="text-sm font-semibold text-green-700 dark:text-green-300">
                October 19, 2025 - Celebrating Since 2013
              </span>
            </div>

            {/* Action button */}
            <div className="mt-8 animate-in slide-in-from-bottom-4 duration-700 delay-1000">
              <button
                onClick={() => setIsVisible(false)}
                className="px-8 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
              >
                Continue to Website
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
