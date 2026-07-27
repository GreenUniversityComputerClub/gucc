"use client";

import { notFound } from "next/navigation";
import formsData from "@/data/forms.json";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

export default function FormPage() {
  const params = useParams();
  const form_slug = params.form_slug as string;
  const [isLoading, setIsLoading] = useState(true);
  const [isFormLoaded, setIsFormLoaded] = useState(false);
  
  const form = formsData.find((f) => f.slug === form_slug);
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (form) {
      document.title = `${form.title} | Green University Computer Club`;
    }
  }, [form]);

  if (!form) {
    return notFound();
  }

  const embedUrl = form.url.includes('?')
    ? `${form.url}&embedded=true`
    : `${form.url}?embedded=true`;
  const handleFormLoad = () => {
    setIsFormLoaded(true);
  };

  return (
    <div>
      {/* Loading Screen */}
      {isLoading && (
        <div className="fixed inset-0 z-50 bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700 flex items-center justify-center">
          <div className="text-center">
            <div className="relative">
              <div className="w-20 h-20 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-6"></div>
              <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-t-blue-200 rounded-full animate-spin mx-auto mt-2 ml-2" style={{animationDirection: 'reverse', animationDuration: '0.8s'}}></div>
            </div>            <h2 className="text-xl font-bold text-white mb-2">Loading GUCC Form</h2>
            <p className="text-blue-100">Preparing your form...</p>
            <div className="flex justify-center mt-4 space-x-1">
              <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
              <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
              <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
            </div>
          </div>
        </div>
      )}      <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-100">
        {/* Simplified Background */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-30">
          <div className="absolute -top-32 -right-32 w-64 h-64 bg-blue-400/20 rounded-full blur-2xl"></div>
          <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-purple-400/20 rounded-full blur-2xl"></div>
        </div>        {/* Compact Hero Section */}
        <div className="relative bg-gradient-to-r from-blue-600 to-purple-600">
          <div className="absolute inset-0 bg-black/5"></div>
            <div className="relative container mx-auto px-4 py-6 sm:py-8">
            <div className="text-center">
              <div className="inline-flex items-center px-4 py-2 mb-4 text-xs sm:text-sm font-medium text-white bg-white/20 backdrop-blur rounded-full border border-white/30">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
                </svg>
                Green University Computer Club
              </div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white mb-3">
                {form.title}
              </h1>
              <p className="text-sm sm:text-base text-blue-100 max-w-2xl mx-auto">
                Complete this form to participate in GUCC activities and connect with our tech community
              </p>
            </div>
          </div>
        </div>        {/* Form Section - Enhanced */}
        <div className="container mx-auto px-4 py-6">
          <div className="max-w-6xl mx-auto">
            {/* Enhanced Form Container */}
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200/80 overflow-hidden backdrop-blur-sm">
              {/* Enhanced Form Header */}
              <div className="bg-gradient-to-r from-gray-50 to-blue-50/50 px-6 py-4 border-b border-gray-200/60">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="flex space-x-2">
                      <div className="w-3 h-3 bg-red-400 rounded-full shadow-sm"></div>
                      <div className="w-3 h-3 bg-yellow-400 rounded-full shadow-sm"></div>
                      <div className="w-3 h-3 bg-green-400 rounded-full shadow-sm"></div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
                      </svg>
                      <p className="text-sm font-semibold text-gray-700">GUCC Form Portal</p>
                    </div>
                  </div>
                  
                  <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${
                    isFormLoaded 
                      ? 'bg-green-100 text-green-700 shadow-sm' 
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${
                      isFormLoaded ? 'bg-green-500' : 'bg-blue-500 animate-pulse'
                    }`}></div>
                    {isFormLoaded ? 'Form Ready' : 'Loading...'}
                  </div>
                </div>
              </div>

              {/* Form Content - Maximized */}
              <div className="relative">
                {/* Simplified Loading overlay */}
                <div 
                  className={`absolute inset-0 bg-white flex items-center justify-center z-10 transition-all duration-500 ${
                    isFormLoaded ? 'opacity-0 pointer-events-none' : 'opacity-100'
                  }`}
                >
                  <div className="text-center">
                    <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3"></div>
                    <p className="text-gray-600 text-sm">Loading form...</p>
                  </div>
                </div>                {/* Full Screen Iframe */}
                <div className="relative bg-white">
                  <iframe
                    src={embedUrl}
                    title={form.title}
                    className="w-full border-0 h-[calc(100vh-240px)] min-h-[500px] max-h-[800px]"
                    allowFullScreen
                    onLoad={handleFormLoad}
                  />
                </div>
              </div>              {/* Enhanced Footer */}
              <div className="bg-gradient-to-r from-gray-50 to-blue-50/50 px-6 py-3 border-t border-gray-200/60">
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
                      </svg>
                      <span className="font-medium">Secure & Private</span>
                    </div>
                    <div className="hidden sm:flex items-center space-x-2">
                      <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span>Quick Submit</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span>Powered by</span>
                    <span className="font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">GUCC</span>
                    <div className="w-5 h-5 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
                      <span className="text-white text-xs font-bold">G</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
