"use client";

import { useEffect, useState } from "react";
import { X, Sparkles, PartyPopper, Heart, Trophy, Gift, Cake } from "lucide-react";
import Confetti from "react-confetti";

export default function GUCCDayGreeting() {
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
        x: Math.random() * 80 + 10, // 10-90% from left
        y: Math.random() * 60 + 10, // 10-70% from top
      };
      setFireworks(prev => [...prev, newFirework]);
      
      // Remove firework after animation completes
      setTimeout(() => {
        setFireworks(prev => prev.filter(fw => fw.id !== newFirework.id));
      }, 2000);
    }, 1500); // New firework every 1.5 seconds

    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timer);
      clearInterval(fireworkInterval);
    };
  }, []);

  if (!isVisible) return null;
  if (!isMounted) return null;

  const FloatingIcon = ({ index }: { index: number }) => {
    const icons = [Sparkles, Heart, Trophy, Gift, Cake, PartyPopper];
    const Icon = icons[index % icons.length];
    const delay = index * 0.5;
    const duration = 3 + (index % 3);
    
    return (
      <div
        className="absolute text-green-400/30 dark:text-green-500/30"
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
            opacity: 0.6;
          }
        }
        
        @keyframes pulse-glow {
          0%, 100% {
            box-shadow: 0 0 20px rgba(16, 185, 129, 0.3);
          }
          50% {
            box-shadow: 0 0 40px rgba(16, 185, 129, 0.6);
          }
        }
        
        @keyframes shimmer {
          0% {
            background-position: -1000px 0;
          }
          100% {
            background-position: 1000px 0;
          }
        }
        
        @keyframes firework-burst {
          0% {
            transform: scale(0) rotate(0deg);
            opacity: 1;
          }
          50% {
            transform: scale(1.5) rotate(180deg);
            opacity: 0.8;
          }
          100% {
            transform: scale(2.5) rotate(360deg);
            opacity: 0;
          }
        }
        
        @keyframes firework-particle {
          0% {
            transform: translate(0, 0) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(var(--tx), var(--ty)) scale(0);
            opacity: 0;
          }
        }
      `}</style>
      
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
        <div className="relative max-w-2xl w-full bg-gradient-to-br from-green-50 via-emerald-50 to-green-100 dark:from-green-950 dark:via-emerald-950 dark:to-green-900 rounded-3xl shadow-2xl overflow-hidden border-4 border-green-500/30 animate-in zoom-in-95 duration-700"
             style={{ animation: 'zoom-in-95 0.7s ease-out, pulse-glow 2s ease-in-out infinite' }}>
          {/* Close button */}
          <button
            onClick={() => setIsVisible(false)}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-110 group"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-slate-700 dark:text-slate-300 group-hover:rotate-90 transition-transform duration-300" />
          </button>

          {/* Floating background icons */}
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            {floatingIcons.map((index) => (
              <FloatingIcon key={index} index={index} />
            ))}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-green-400/20 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-emerald-400/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-green-300/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '0.5s' }}></div>
          </div>

          {/* Fireworks Layer */}
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            {fireworks.map((firework) => (
              <div
                key={firework.id}
                className="absolute"
                style={{
                  left: `${firework.x}%`,
                  top: `${firework.y}%`,
                }}
              >
                {/* Main burst */}
                <div
                  className="absolute w-8 h-8 bg-gradient-to-r from-yellow-400 via-red-500 to-pink-500 rounded-full"
                  style={{
                    animation: 'firework-burst 2s ease-out forwards',
                  }}
                />
                {/* Particles in 8 directions */}
                {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, idx) => {
                  const radian = (angle * Math.PI) / 180;
                  const distance = 100 + Math.random() * 50;
                  const tx = Math.cos(radian) * distance;
                  const ty = Math.sin(radian) * distance;
                  const colors = [
                    'bg-yellow-400',
                    'bg-red-500',
                    'bg-pink-500',
                    'bg-purple-500',
                    'bg-blue-500',
                    'bg-green-500',
                    'bg-orange-500',
                    'bg-cyan-500',
                  ];
                  return (
                    <div
                      key={idx}
                      className={`absolute w-2 h-2 rounded-full ${colors[idx % colors.length]}`}
                      style={{
                        animation: `firework-particle 1.5s ease-out forwards`,
                        animationDelay: '0.2s',
                        '--tx': `${tx}px`,
                        '--ty': `${ty}px`,
                      } as React.CSSProperties}
                    />
                  );
                })}
                {/* Additional random particles for more density */}
                {Array.from({ length: 12 }).map((_, idx) => {
                  const angle = Math.random() * 360;
                  const radian = (angle * Math.PI) / 180;
                  const distance = 60 + Math.random() * 80;
                  const tx = Math.cos(radian) * distance;
                  const ty = Math.sin(radian) * distance;
                  const colors = ['bg-yellow-300', 'bg-red-400', 'bg-pink-400', 'bg-purple-400', 'bg-blue-400'];
                  return (
                    <div
                      key={`extra-${idx}`}
                      className={`absolute w-1.5 h-1.5 rounded-full ${colors[idx % colors.length]}`}
                      style={{
                        animation: `firework-particle ${1.2 + Math.random() * 0.6}s ease-out forwards`,
                        animationDelay: `${0.1 + Math.random() * 0.3}s`,
                        '--tx': `${tx}px`,
                        '--ty': `${ty}px`,
                      } as React.CSSProperties}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          <div className="relative p-8 md:p-12 text-center">
            {/* Icon header with stagger animation */}
            <div className="flex justify-center gap-3 mb-6">
              <div className="animate-bounce" style={{ animationDelay: '0s' }}>
                <PartyPopper className="w-10 h-10 md:w-12 md:h-12 text-green-600 dark:text-green-400" />
              </div>
              <div className="animate-bounce" style={{ animationDelay: '0.1s' }}>
                <Sparkles className="w-10 h-10 md:w-12 md:h-12 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="animate-bounce" style={{ animationDelay: '0.2s' }}>
                <Cake className="w-10 h-10 md:w-12 md:h-12 text-green-600 dark:text-green-400" />
              </div>
              <div className="animate-bounce" style={{ animationDelay: '0.3s' }}>
                <Trophy className="w-10 h-10 md:w-12 md:h-12 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="animate-bounce" style={{ animationDelay: '0.4s' }}>
                <Heart className="w-10 h-10 md:w-12 md:h-12 text-green-600 dark:text-green-400" />
              </div>
            </div>

            {/* Main greeting with shimmer effect */}
            <h1 className="text-4xl md:text-6xl font-black mb-4 animate-in slide-in-from-bottom-4 duration-700 delay-200 relative">
              <span className="relative inline-block bg-gradient-to-r from-green-600 via-emerald-600 to-green-700 dark:from-green-300 dark:via-emerald-300 dark:to-green-400 bg-clip-text text-transparent">
                Happy GUCC Day!
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent" 
                      style={{ 
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 3s linear infinite'
                      }}></span>
              </span>
            </h1>

            {/* Anniversary badge */}
            <div className="inline-flex items-center gap-2 px-6 py-3 mb-6 bg-green-600 dark:bg-green-500 text-white rounded-full shadow-lg animate-in slide-in-from-bottom-4 duration-700 delay-300 hover:scale-110 transition-transform">
              <Sparkles className="w-5 h-5 animate-spin" style={{ animationDuration: '3s' }} />
              <span className="text-2xl md:text-3xl font-bold">12 Years of Excellence</span>
              <Sparkles className="w-5 h-5 animate-spin" style={{ animationDuration: '3s', animationDirection: 'reverse' }} />
            </div>

            {/* Message */}
            <p className="text-lg md:text-xl text-slate-700 dark:text-slate-200 mb-6 leading-relaxed max-w-xl mx-auto animate-in slide-in-from-bottom-4 duration-700 delay-500">
              Today marks <span className="font-bold text-green-600 dark:text-green-400 animate-pulse">12 incredible years</span> of 
              innovation, learning, and growth! 🌟
            </p>

            <p className="text-base md:text-lg text-slate-600 dark:text-slate-300 mb-8 max-w-xl mx-auto animate-in slide-in-from-bottom-4 duration-700 delay-700">
              Thank you to all our members, supporters, and the amazing community who made this journey unforgettable. 
              Here's to many more years of inspiring minds and building the future! 💚
            </p>

            {/* Date with animated border */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg border-2 border-green-200 dark:border-green-700 animate-in slide-in-from-bottom-4 duration-700 delay-1000 relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-r from-green-400/0 via-green-400/30 to-green-400/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
              <span className="text-sm font-semibold text-green-700 dark:text-green-300 relative z-10">
                October 19, 2025 - Celebrating Since 2013
              </span>
            </div>

            {/* Action button with enhanced animations */}
            <div className="mt-8 animate-in slide-in-from-bottom-4 duration-700 delay-1000">
              <button
                onClick={() => setIsVisible(false)}
                className="px-8 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold rounded-full shadow-lg hover:shadow-2xl transform hover:scale-110 transition-all duration-300 relative overflow-hidden group"
              >
                <span className="relative z-10">Continue to Website</span>
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 to-green-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
