"use client"

import type React from "react"
import { useEffect, useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Send, AlertCircle, Loader2, Computer, GraduationCap, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { MessageModal } from "./message-modal"
import Image from "next/image"

// RAG API endpoint
const RAG_API_URL = "https://andrewvelox-gucc-rag-agent.hf.space"

interface Message {
  text: string
  role: "user" | "model"
  timestamp: Date
  sources?: string[]
}

interface PredefinedQuestion {
  question: string
  answer: string
}

export default function Chatbot({ onClose, isChatbotDark = false }: { onClose?: () => void; isChatbotDark?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [userInput, setUserInput] = useState("")
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [screenSize, setScreenSize] = useState<"small" | "medium" | "large">("medium")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load messages from sessionStorage on mount
  useEffect(() => {
    try {
      const savedMessages = sessionStorage.getItem('gucc-chat-messages')
      const savedSessionId = sessionStorage.getItem('gucc-chat-session')
      
      if (savedMessages) {
        const parsed = JSON.parse(savedMessages)
        // Convert timestamp strings back to Date objects
        const messagesWithDates = parsed.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }))
        setMessages(messagesWithDates)
      }
      
      if (savedSessionId) {
        setSessionId(savedSessionId)
      }
    } catch (error) {
      console.error('Failed to load chat history:', error)
    }
  }, [])

  // Save messages to sessionStorage whenever they change
  useEffect(() => {
    try {
      if (messages.length > 0) {
        sessionStorage.setItem('gucc-chat-messages', JSON.stringify(messages))
      }
    } catch (error) {
      console.error('Failed to save chat history:', error)
    }
  }, [messages])

  // Save sessionId to sessionStorage whenever it changes
  useEffect(() => {
    try {
      if (sessionId) {
        sessionStorage.setItem('gucc-chat-session', sessionId)
      }
    } catch (error) {
      console.error('Failed to save session:', error)
    }
  }, [sessionId])

  // Define predefined questions and answers
  const predefinedQuestions: PredefinedQuestion[] = [
    {
      question: "What is GUCC?",
      answer:
        "GUCC (Green University Computer Club) is a student-driven non-profit and non-political organization operating in collaboration with the Department of Computer Science and Engineering at Green University of Bangladesh.",
    },
    {
      question: "How can I join GUCC?",
      answer:
        "You can join GUCC by registering through our website or visiting our office at the CSE department. Membership is open to all CSE students at Green University.",
    },
    {
      question: "What events does GUCC organize?",
      answer:
        "GUCC organizes various events including workshops, seminars, coding competitions, hackathons, tech talks, and industry visits to enhance students' technical and professional skills.",
    },
    {
      question: "How can GUCC help my career?",
      answer:
        "GUCC helps your career by providing networking opportunities, skill development workshops, industry connections, mentorship programs, and hands-on project experience in various technology domains.",
    },
    {
      question: "What are the benefits of being a GUCC member?",
      answer:
        "Benefits include access to exclusive workshops, networking with industry professionals, participation in competitions, leadership opportunities, technical resources, and being part of a community of like-minded tech enthusiasts.",
    },
  ]

  // Check screen size
  useEffect(() => {
    const checkScreenSize = () => {
      if (window.innerWidth < 640) {
        setScreenSize("small")
      } else if (window.innerWidth < 1024) {
        setScreenSize("medium")
      } else {
        setScreenSize("large")
      }
    }

    // Initial check
    checkScreenSize()

    // Add event listener for window resize
    window.addEventListener("resize", checkScreenSize)

    // Cleanup
    return () => window.removeEventListener("resize", checkScreenSize)
  }, [])

  // Initialize chat session
  useEffect(() => {
    let isMounted = true

    const initChat = async () => {
      if (!isMounted) return

      setIsLoading(true)
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: null }),
        })

        if (!response.ok) {
          // If chat API fails, just create a dummy session ID
          // The RAG API will still work
          console.warn("Chat API unavailable, using RAG-only mode")
          if (isMounted) {
            setSessionId(Date.now().toString())
            setIsLoading(false)
          }
          return
        }

        const data = await response.json()

        if (data.error) {
          // If there's an error, still allow using RAG API
          console.warn("Chat API error, using RAG-only mode:", data.error)
          if (isMounted) {
            setSessionId(Date.now().toString())
            setIsLoading(false)
          }
          return
        }

        if (isMounted) {
          setSessionId(data.sessionId)
          setIsLoading(false)
        }
      } catch (err: any) {
        // If initialization fails, create a session ID anyway for RAG
        console.warn("Chat initialization failed, using RAG-only mode:", err.message)
        if (isMounted) {
          setSessionId(Date.now().toString())
          setIsLoading(false)
        }
      }
    }

    initChat()

    // Focus the input field when the component mounts
    setTimeout(() => {
      inputRef.current?.focus()
    }, 100)

    return () => {
      isMounted = false
    }
  }, [])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Function to handle predefined questions directly
  const handlePredefinedQuestion = useCallback(
    (question: string) => {
      // Find the matching predefined question
      const predefinedQuestion = predefinedQuestions.find((item) => item.question.trim() === question.trim())

      if (!predefinedQuestion) return false

      // Add user message
      const userMessage: Message = {
        text: question,
        role: "user",
        timestamp: new Date(),
      }

      setMessages((prevMessages) => [...prevMessages, userMessage])
      setUserInput("")

      // Show loading indicator
      setIsLoading(true)

      // Add a small delay to simulate processing
      setTimeout(() => {
        // Add bot response with predefined answer
        const botMessage: Message = {
          text: predefinedQuestion.answer,
          role: "model",
          timestamp: new Date(),
        }

        setMessages((prevMessages) => [...prevMessages, botMessage])
        setIsLoading(false)
        setShowSuggestions(true)

        // Scroll to bottom
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
        }, 100)
      }, 800)

      return true
    },
    [predefinedQuestions],
  )

  const handleSendMessage = useCallback(
    async (input?: string) => {
      const messageToSend = input || userInput
      if (!messageToSend.trim() || !sessionId) return

      // Hide suggestions when sending a message
      setShowSuggestions(false)

      // Check if it's a predefined question first
      // If it is, handle it and return early
      const isPredefined = handlePredefinedQuestion(messageToSend)
      if (isPredefined) return

      // If not a predefined question, proceed with normal flow
      const userMessage: Message = {
        text: messageToSend,
        role: "user",
        timestamp: new Date(),
      }

      setMessages((prevMessages) => [...prevMessages, userMessage])
      setUserInput("")

      // For non-predefined questions, make the API call
      setIsLoading(true)
      try {
        // First, try to query the RAG API for document-based answers
        let ragResponse = null
        let ragError = null
        
        try {
          const ragApiResponse = await fetch(`${RAG_API_URL}/rag/queries/ask/`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              question: messageToSend,
            }),
          })

          if (ragApiResponse.ok) {
            ragResponse = await ragApiResponse.json()
          } else {
            ragError = "RAG API unavailable"
          }
        } catch (err) {
          ragError = "RAG API connection failed"
          console.log("RAG API error:", err)
        }

        // If RAG API returned a valid answer, use it
        if (ragResponse && ragResponse.answer && ragResponse.answer.trim()) {
          const botMessage: Message = {
            text: ragResponse.answer,
            role: "model",
            timestamp: new Date(),
            sources: ragResponse.sources || [],
          }

          setMessages((prevMessages) => [...prevMessages, botMessage])
          setShowSuggestions(true)
        } else {
          // Fall back to the general chat API
          try {
            const response = await fetch("/api/chat", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                message: messageToSend,
                sessionId: sessionId,
              }),
            })

            if (!response.ok) {
              throw new Error("Chat API unavailable. Please try uploading documents to the RAG system.")
            }

            const data = await response.json()

            if (data.error) {
              throw new Error(data.error)
            }

            const botMessage: Message = {
              text: data.response,
              role: "model",
              timestamp: new Date(),
            }

            setMessages((prevMessages) => [...prevMessages, botMessage])
            setShowSuggestions(true)
          } catch (fallbackErr: any) {
            // If both APIs fail, show helpful error
            const errorMessage: Message = {
              text: "I'm currently unable to answer that question. The document search system didn't find relevant information, and the general assistant is unavailable. Please try asking about uploaded documents or check back later.",
              role: "model",
              timestamp: new Date(),
            }
            setMessages((prevMessages) => [...prevMessages, errorMessage])
            setShowSuggestions(true)
          }
        }
      } catch (err: any) {
        setError("Failed to send message: " + err.message)
      } finally {
        setIsLoading(false)
        // Focus the input field after sending a message
        setTimeout(() => {
          inputRef.current?.focus()
          // Scroll to the bottom after a short delay to ensure the DOM has updated
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
          }, 100)
        }, 100)
      }
    },
    [sessionId, userInput, handlePredefinedQuestion],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSendMessage()
      }
    },
    [handleSendMessage],
  )

  const handlePredefinedQuestionClick = useCallback(
    (question: string) => {
      handlePredefinedQuestion(question)
    },
    [handlePredefinedQuestion],
  )

  const handleMessageClick = useCallback((message: Message) => {
    setSelectedMessage(message)
    setIsModalOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    setIsModalOpen(false)
  }, [])

  // Filter out the questions that have already been asked
  const getUnaskedQuestions = useCallback(() => {
    const askedQuestions = messages.filter((msg) => msg.role === "user").map((msg) => msg.text)
    return predefinedQuestions.filter((item) => !askedQuestions.includes(item.question))
  }, [messages, predefinedQuestions])

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-transparent font-sans">
      {/* Header */}
      <div className={cn(
        "px-4 py-3 border-b flex-shrink-0 flex items-center justify-between",
        isChatbotDark ? "bg-[#091a12]/60 border-emerald-950/30" : "bg-zinc-50 border-zinc-200"
      )}>
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-9 h-9 rounded-full overflow-hidden border flex items-center justify-center flex-shrink-0 bg-white",
            isChatbotDark ? "border-emerald-900/30" : "border-zinc-200"
          )}>
            <img
              src="https://raw.githubusercontent.com/green-university-computer-club/gucc/main/public/android-chrome-192x192.png"
              alt="GUCC Logo"
              className="w-8 h-8 object-contain"
            />
          </div>
          <div>
            <h2 className={cn("text-sm font-bold tracking-tight", isChatbotDark ? "text-emerald-50" : "text-zinc-900")}>
              GUCC Assistant
            </h2>
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-605 font-medium mt-0.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              <span>Online & Ready to help</span>
            </div>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              isChatbotDark ? "hover:bg-[#10301f]/50 text-emerald-450 hover:text-emerald-250" : "hover:bg-zinc-200 text-zinc-550 hover:text-zinc-800"
            )}
            aria-label="Close"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        )}
      </div>

      {/* Scrollable Content Area */}
      <div className={cn("flex-grow overflow-hidden relative", isChatbotDark ? "bg-[#07140e]" : "bg-[#f4faf7]")}>
        {error && (
          <Alert variant="destructive" className="m-3">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        <div className={cn(
          "h-full overflow-y-auto pb-4 scrollbar-thin scrollbar-track-transparent",
          isChatbotDark ? "scrollbar-thumb-emerald-950/60" : "scrollbar-thumb-zinc-200"
        )}>
          <div className="p-4 sm:p-5">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center h-full mt-6">
                <h3 className={cn("text-base font-bold mb-2", isChatbotDark ? "text-emerald-50" : "text-zinc-800")}>
                  Welcome to GUCC Assistant
                </h3>
                <p className={cn("text-xs max-w-sm mx-auto leading-relaxed mb-6 font-medium px-2", isChatbotDark ? "text-emerald-400" : "text-emerald-600")}>
                  Ask me anything about Green University Computer Club, events, membership, or how we can help your career in tech!
                </p>
                <div className="w-full space-y-2 max-w-xs sm:max-w-sm">
                  <p className={cn("text-[10px] font-bold tracking-wider uppercase text-left pl-1", isChatbotDark ? "text-emerald-500/60 font-semibold" : "text-zinc-450")}>
                    Frequently Asked Questions:
                  </p>
                  {predefinedQuestions.map((item, index) => (
                    <button
                      key={index}
                      onClick={() => handlePredefinedQuestionClick(item.question)}
                      className={cn(
                        "w-full justify-start text-left text-xs py-3 px-4 rounded-xl transition-all font-normal whitespace-normal h-auto min-h-[44px] border",
                        isChatbotDark
                          ? "bg-[#0b2016]/50 border-emerald-900/25 hover:bg-[#10301f]/50 hover:border-emerald-500/30 hover:text-emerald-100 text-emerald-200/90"
                          : "bg-white border-emerald-200 hover:bg-emerald-50/50 hover:text-emerald-900 text-emerald-800"
                      )}
                    >
                      {item.question}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4 w-full max-w-3xl mx-auto">
                {messages.map((msg, index) => (
                  <div
                    key={index}
                    onClick={() => handleMessageClick(msg)}
                    className={cn(
                      "flex flex-col rounded-2xl cursor-pointer transition-all duration-155 p-3 sm:p-4 shadow-sm",
                      msg.role === "user"
                        ? "ml-auto bg-emerald-600 hover:bg-emerald-500 text-white rounded-tr-none"
                        : cn("mr-auto rounded-tl-none border",
                            isChatbotDark
                              ? "bg-[#0d261a] text-emerald-100 border-emerald-900/30 hover:bg-[#113222]"
                              : "bg-white text-zinc-800 border-zinc-200 hover:bg-zinc-50"),
                      "max-w-[85%] sm:max-w-[80%]",
                    )}
                  >
                    <div className="whitespace-pre-wrap text-xs sm:text-sm leading-relaxed">
                      {msg.text}
                    </div>
                    {msg.sources && msg.sources.length > 0 && (
                      <div className={cn(
                        "mt-1.5 pt-1.5 border-t text-[10px]",
                        isChatbotDark ? "border-emerald-950/40 text-emerald-400/80" : "border-zinc-100 text-zinc-550"
                      )}>
                        <span className="font-semibold text-emerald-605">Sources:</span>{" "}
                        {msg.sources.join(", ")}
                      </div>
                    )}
                    <div className="flex items-center justify-end mt-1.5">
                      <span
                        className={cn(
                          "text-[9px] sm:text-[10px]",
                          msg.role === "user" ? "text-emerald-250" : (isChatbotDark ? "text-emerald-500/60" : "text-zinc-450"),
                        )}
                      >
                        {format(msg.timestamp, "h:mm a")}
                      </span>
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className={cn(
                    "flex flex-col max-w-[85%] sm:max-w-[80%] rounded-2xl rounded-tl-none p-3 sm:p-4 mr-auto border shadow-sm",
                    isChatbotDark
                      ? "bg-[#0d261a] text-emerald-100 border-emerald-900/30"
                      : "bg-white text-zinc-800 border-zinc-200"
                  )}>
                    <div className="flex items-center gap-2 text-zinc-450">
                      <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                      <span className="text-xs">Thinking...</span>
                    </div>
                  </div>
                )}

                {/* Show remaining questions after each bot response */}
                {showSuggestions && messages.length > 0 && messages[messages.length - 1].role === "model" && (
                  <div className={cn(
                    "my-4 p-3 border rounded-xl max-w-3xl mx-auto shadow-sm",
                    isChatbotDark ? "bg-[#081d13]/30 border-emerald-950/40" : "bg-white border-zinc-200"
                  )}>
                    <p className={cn("text-[10px] font-bold tracking-wider uppercase mb-2", isChatbotDark ? "text-emerald-500/60 font-semibold" : "text-zinc-450")}>
                      You might also want to ask:
                    </p>
                    <div className="space-y-1.5">
                      {getUnaskedQuestions()
                        .slice(0, 3)
                        .map((item, index) => (
                          <button
                            key={index}
                            onClick={() => handlePredefinedQuestionClick(item.question)}
                            className={cn(
                              "w-full text-left justify-start text-xs py-2 px-3 h-auto min-h-[36px] rounded-lg font-normal whitespace-normal border transition-all",
                              isChatbotDark
                                ? "bg-[#0b2016]/60 hover:bg-[#10301f]/50 hover:text-emerald-100 hover:border-emerald-500/30 text-emerald-200/90 border-emerald-900/25"
                                : "bg-white hover:bg-emerald-50/50 hover:text-emerald-900 text-emerald-800 border-emerald-200"
                            )}
                          >
                            {item.question}
                          </button>
                        ))}
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fixed Input Area */}
      <div className={cn(
        "p-3 border-t flex-shrink-0",
        isChatbotDark ? "border-emerald-950/40 bg-[#07140e]" : "border-zinc-200 bg-[#f4faf7]"
      )}>
        <div className="flex gap-2 max-w-4xl mx-auto items-center">
          <input
            ref={inputRef}
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask something about GUCC..."
            disabled={isLoading || !sessionId}
            className={cn(
              "flex-1 rounded-full h-11 text-xs sm:text-sm pl-4 focus:outline-none border",
              isChatbotDark
                ? "bg-[#0b2016] border-emerald-900/30 text-emerald-50 placeholder-emerald-700/60"
                : "bg-white border-emerald-250 text-emerald-950 placeholder-emerald-700/50"
            )}
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={isLoading || !userInput.trim() || !sessionId}
            className={cn(
              "border h-11 w-11 rounded-full transition-all active:scale-95 shrink-0 flex items-center justify-center",
              userInput.trim()
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md"
                : (isChatbotDark
                    ? "bg-[#0b2016] border-emerald-950/40 text-emerald-800/40 cursor-not-allowed"
                    : "bg-emerald-50/50 border-emerald-100 text-emerald-350 cursor-not-allowed")
            )}
          >
            {isLoading ? (
              <Loader2 className="h-4.5 w-4.5 animate-spin" />
            ) : (
              <Send className="h-4.5 w-4.5" />
            )}
          </button>
        </div>
      </div>

      {/* Custom Modal */}
      <MessageModal isOpen={isModalOpen} onClose={closeModal} message={selectedMessage} screenSize={screenSize} />
    </div>
  )
}

