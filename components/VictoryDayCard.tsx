"use client";

import { useEffect, useState } from "react";
import { X, Star, Flag, Trophy, Sparkles, Shield } from "lucide-react";
import Confetti from "react-confetti";

export default function VictoryDayCard() {
  const [isVisible, setIsVisible] = useState(true);
  const [showConfetti, setShowConfetti] = useState(true);
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });
  const [floatingIcons, setFloatingIcons] = useState<number[]>([]);
  const [fireworks, setFireworks] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    
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

    // Generate floating icons
    const icons = Array.from({ length: 12 }, (_, i) => i);
    setFloatingIcons(icons);

    // Generate fireworks at random intervals
    const fireworkInterval = setInterval(() => {
      const newFirework = {
        id: Date.now() + Math.random(),
        x: Math.random() * 80 + 10,
        y: Math.random() * 60 + 10,
      };
      setFireworks(prev => [...prev, newFirework]);
      
      setTimeout(() => {
        setFireworks(prev => prev.filter(fw => fw.id !== newFirework.id));
      }, 2000);
    }, 1500);

    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timer);
      clearInterval(fireworkInterval);
    };
  }, []);

  if (!isVisible) return null;
  if (!isMounted) return null;

  const FloatingIcon = ({ index }: { index: number }) => {
    const icons = [Star, Flag, Trophy, Sparkles, Shield, Star];
    const Icon = icons[index % icons.length];
    const delay = index * 0.5;
    const duration = 3 + (index % 3);
    
    return (
      <div
        className="absolute text-green-600/30 dark:text-green-400/30"
        style={{
          left: `${(index * 8.33) % 100}%`,
          top: `${(index * 13) % 100}%`,
          animation: `float ${duration}s ease-in-out ${delay}s infinite`,
        }}
      >
        <Icon className="w-6 h-6 md:w-8 md:h-8" />
      </div>
    );
  };

  return (
    <>
      <style jsx global>{`
        @keyframes float {
          0%, 100% {
            transform: translateY(0) rotate(0deg) scale(1);
            opacity: 0.3;
          }
          25% {
            transform: translateY(-20px) rotate(5deg) scale(1.1);
            opacity: 0.5;
          }
          50% {
            transform: translateY(-10px) rotate(-5deg) scale(0.9);
            opacity: 0.4;
          }
          75% {
            transform: translateY(-15px) rotate(3deg) scale(1.05);
            opacity: 0.45;
          }
        }

        @keyframes firework {
          0% {
            transform: scale(0);
            opacity: 1;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 0;
          }
        }

        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.05);
            opacity: 0.9;
          }
        }

        @keyframes slideIn {
          from {
            transform: translateY(-100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        @keyframes shimmer {
          0% {
            background-position: -100% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
      `}</style>

      {showConfetti && (
        <Confetti
          width={windowSize.width}
          height={windowSize.height}
          colors={['#006A4E', '#F42A41', '#FFFFFF', '#FFD700']}
          recycle={false}
          numberOfPieces={300}
        />
      )}

      <div 
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        style={{ animation: 'slideIn 0.5s ease-out' }}
      >
        {/* Floating Icons Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {floatingIcons.map((index) => (
            <FloatingIcon key={index} index={index} />
          ))}
        </div>

        {/* Fireworks */}
        {fireworks.map((fw) => (
          <div
            key={fw.id}
            className="absolute pointer-events-none"
            style={{
              left: `${fw.x}%`,
              top: `${fw.y}%`,
            }}
          >
            <div
              className="w-32 h-32 rounded-full bg-gradient-radial from-red-500/60 via-green-500/40 to-transparent"
              style={{ animation: 'firework 2s ease-out' }}
            />
          </div>
        ))}

        {/* Main Card */}
        <div 
          className="relative max-w-2xl w-full rounded-3xl shadow-2xl p-8 md:p-12 border-2 border-green-600/20 dark:border-green-400/20 overflow-hidden"
          style={{ animation: 'pulse 3s ease-in-out infinite' }}
        >
          {/* Background Image with Overlay */}
          <div 
            className="absolute inset-0 bg-cover bg-center"
            style={{ 
              backgroundImage: 'url(/sriti-soudho.jpg)',
              filter: 'brightness(0.3) blur(0.5px)'
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-br from-green-900/85 via-slate-900/90 to-red-900/85 dark:from-green-950/90 dark:via-slate-950/95 dark:to-red-950/90" />
          
          {/* Content Wrapper */}
          <div className="relative z-10">
          {/* Close Button */}
          <button
            onClick={() => setIsVisible(false)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/90 dark:bg-slate-800/90 hover:bg-white dark:hover:bg-slate-700 transition-colors shadow-lg z-20"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-slate-700 dark:text-slate-300" />
          </button>

          {/* Flag Colors Decoration */}
          <div className="absolute top-0 left-0 right-0 h-2 rounded-t-3xl bg-gradient-to-r from-green-600 via-red-600 to-green-600" />

          {/* Content */}
          <div className="space-y-6 text-center">
            {/* Icon */}
            <div className="flex justify-center">
              <div className="relative">
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-br from-green-600 to-green-700 dark:from-green-500 dark:to-green-600 flex items-center justify-center shadow-xl">
                  <Flag className="w-10 h-10 md:w-12 md:h-12 text-white" />
                </div>
                <div className="absolute -top-2 -right-2">
                  <Trophy className="w-8 h-8 text-yellow-500 animate-bounce" />
                </div>
              </div>
            </div>

            {/* Title with Shimmer Effect */}
            <div>
              <h2 
                className="text-3xl md:text-5xl font-bold mb-2 bg-gradient-to-r from-green-400 via-red-400 to-green-400 bg-clip-text text-transparent drop-shadow-lg"
                style={{
                  backgroundSize: '200% auto',
                  animation: 'shimmer 3s linear infinite',
                }}
              >
                শুভ বিজয় দিবস!
              </h2>
              <p className="text-xl md:text-2xl font-semibold text-green-300 drop-shadow-lg">
                Happy Victory Day!
              </p>
            </div>

            {/* Message */}
            <div className="space-y-4 text-white">
              <p className="text-lg md:text-xl font-medium leading-relaxed drop-shadow-lg">
                Celebrating the triumph of courage, sacrifice, and freedom.
              </p>
              <p className="text-base md:text-lg leading-relaxed drop-shadow-md">
                On this glorious day, we honor the brave martyrs and freedom fighters<br className="hidden md:block" />
                who gave us the gift of independence on December 16, 1971.
              </p>
              <div className="flex items-center justify-center gap-2 text-2xl md:text-3xl font-bold">
                <span className="text-green-300 drop-shadow-lg">🇧🇩</span>
                <span className="text-red-300 drop-shadow-lg">১৬ ডিসেম্বর</span>
                <span className="text-green-300 drop-shadow-lg">🇧🇩</span>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-6 border-t border-white/30">
              <p className="text-sm md:text-base font-medium text-white/90 flex items-center justify-center gap-2 drop-shadow-lg">
                <Sparkles className="w-5 h-5 text-yellow-400" />
                From Green University Computer Club
                <Sparkles className="w-5 h-5 text-yellow-400" />
              </p>
            </div>
          </div>

          {/* Decorative Stars */}
          <div className="absolute top-8 left-8 animate-pulse z-10">
            <Star className="w-6 h-6 text-yellow-400 fill-yellow-400 drop-shadow-lg" />
          </div>
          <div className="absolute top-12 right-12 animate-pulse z-10" style={{ animationDelay: '0.5s' }}>
            <Star className="w-5 h-5 text-yellow-400 fill-yellow-400 drop-shadow-lg" />
          </div>
          <div className="absolute bottom-8 left-12 animate-pulse z-10" style={{ animationDelay: '1s' }}>
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 drop-shadow-lg" />
          </div>
          <div className="absolute bottom-12 right-8 animate-pulse z-10" style={{ animationDelay: '1.5s' }}>
            <Star className="w-5 h-5 text-yellow-400 fill-yellow-400 drop-shadow-lg" />
          </div>
        </div>
      </div>
    </>
  );
}
