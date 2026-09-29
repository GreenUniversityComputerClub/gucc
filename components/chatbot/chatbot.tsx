"use client"

import { useEffect, useState, useRef, useCallback, useMemo } from "react"
import type { KeyboardEvent } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Send, AlertCircle, Loader2, RotateCcw, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { MessageModal } from "./message-modal"
import Image from "next/image"

interface Message {
  text: string
  role: "user" | "model"
  timestamp: Date
}

/** How long to wait for an answer before giving up. */
const ANSWER_TIMEOUT_MS = 25_000

/** Suggested questions; they are answered by the assistant like any other question. */
const PREDEFINED_QUESTIONS = [
  "What is GUCC?",
  "How can I join GUCC?",
  "What events does GUCC organize?",
  "How can GUCC help my career?",
  "What are the benefits of being a GUCC member?",
]

export default function Chatbot({ onClose, isChatbotDark = false }: { onClose?: () => void; isChatbotDark?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [userInput, setUserInput] = useState("")
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // The request in flight: aborted on timeout, on "New chat" and when the chat closes.
  const requestRef = useRef<AbortController | null>(null)

  useEffect(() => () => requestRef.current?.abort(), [])

  /** Focus the input only where it doesn't pop up an on-screen keyboard over the answer. */
  const focusInput = useCallback(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches) inputRef.current?.focus()
  }, [])

  // Load messages from sessionStorage on mount
  useEffect(() => {
    try {
      const savedMessages = sessionStorage.getItem('gucc-chat-messages')
      const savedSessionId = sessionStorage.getItem('gucc-chat-session')
      
      if (savedMessages) {
        const parsed = JSON.parse(savedMessages)
        // Convert timestamp strings back to Date objects
        const messagesWithDates = parsed.map((msg: Message & { timestamp: string }) => ({
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

  // The assistant is stateless (the browser sends recent turns with each message), so the
  // conversation id is made here: opening the chat costs no request.
  useEffect(() => {
    setSessionId((current) => current ?? (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now().toString()))

    // Focus the input field when the component mounts (not on phones: the keyboard would cover the chat)
    const focus = setTimeout(focusInput, 100)
    return () => clearTimeout(focus)
  }, [focusInput])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSendMessage = useCallback(
    async (input?: string) => {
      const messageToSend = (input || userInput).trim()
      if (!messageToSend || !sessionId || isLoading) return

      // Hide suggestions when sending a message
      setShowSuggestions(false)
      setError(null)

      const userMessage: Message = {
        text: messageToSend,
        role: "user",
        timestamp: new Date(),
      }

      setMessages((prevMessages) => [...prevMessages, userMessage])
      setUserInput("")

      // For non-predefined questions, make the API call
      setIsLoading(true)
      const request = new AbortController()
      requestRef.current = request
      const timer = setTimeout(() => request.abort(), ANSWER_TIMEOUT_MS)
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          signal: request.signal,
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: messageToSend,
            sessionId: sessionId,
            // The assistant is stateless: send the recent conversation for context.
            history: messages.slice(-10).map((m) => ({ role: m.role === "user" ? "user" : "model", text: m.text })),
          }),
        })
        const data = (await response.json().catch(() => null)) as { response?: string; error?: string } | null

        const botMessage: Message = {
          text:
            response.ok && data?.response
              ? data.response
              : data?.error || "I can't answer that right now. Please try again later, or reach the club from the contact page.",
          role: "model",
          timestamp: new Date(),
        }
        setMessages((prevMessages) => [...prevMessages, botMessage])
        setShowSuggestions(true)
      } catch (err: unknown) {
        // Closed or restarted on purpose: nothing to report.
        if (requestRef.current !== request) return
        const timedOut = err instanceof DOMException && err.name === "AbortError"
        setError(timedOut ? "The assistant took too long to answer. Please try again." : "Couldn't reach the assistant. Check your connection and try again.")
        setShowSuggestions(true)
      } finally {
        clearTimeout(timer)
        if (requestRef.current === request) {
          requestRef.current = null
          setIsLoading(false)
          // Focus the input field after sending a message
          setTimeout(() => {
            focusInput()
            // Scroll to the bottom after a short delay to ensure the DOM has updated
            setTimeout(() => {
              messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
            }, 100)
          }, 100)
        }
      }
    },
    [sessionId, userInput, messages, isLoading, focusInput],
  )

  /** Start over: forget this conversation (it only lives in this tab). */
  const newChat = useCallback(() => {
    requestRef.current?.abort()
    requestRef.current = null
    setIsLoading(false)
    setMessages([])
    setError(null)
    setShowSuggestions(true)
    setUserInput("")
    try {
      sessionStorage.removeItem("gucc-chat-messages")
    } catch {
      /* storage unavailable: nothing to clear */
    }
    focusInput()
  }, [focusInput])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSendMessage()
      }
    },
    [handleSendMessage],
  )

  const handlePredefinedQuestionClick = useCallback(
    (question: string) => {
      handleSendMessage(question)
    },
    [handleSendMessage],
  )

  const handleMessageClick = useCallback((message: Message) => {
    setSelectedMessage(message)
    setIsModalOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    setIsModalOpen(false)
  }, [])

  // Filter out the questions that have already been asked
  const unaskedQuestions = useMemo(() => {
    const askedQuestions = messages.filter((msg) => msg.role === "user").map((msg) => msg.text)
    return PREDEFINED_QUESTIONS.filter((question) => !askedQuestions.includes(question))
  }, [messages])

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
            <Image
              src="/android-chrome-192x192.png"
              alt="GUCC Logo"
              width={32}
              height={32}
              className="w-8 h-8 object-contain"
            />
          </div>
          <div>
            <h2 className={cn("text-sm font-bold tracking-tight", isChatbotDark ? "text-emerald-50" : "text-zinc-900")}>
              GUCC Assistant
            </h2>
            <div className={cn("flex items-center gap-1.5 text-[11px] font-medium mt-0.5", isChatbotDark ? "text-emerald-400" : "text-emerald-600")}>
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              <span>Online & Ready to help</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
        {messages.length > 0 && (
          <button
            type="button"
            onClick={newChat}
            className={cn(
              "p-2 rounded-lg transition-colors",
              isChatbotDark
                ? "hover:bg-[#10301f]/50 text-emerald-400 hover:text-emerald-200"
                : "hover:bg-zinc-200 text-zinc-500 hover:text-zinc-800"
            )}
            aria-label="New chat"
            title="New chat"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "p-2 rounded-lg transition-colors",
              isChatbotDark
                ? "hover:bg-[#10301f]/50 text-emerald-400 hover:text-emerald-200"
                : "hover:bg-zinc-200 text-zinc-500 hover:text-zinc-800"
            )}
            aria-label="Close"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        )}
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className={cn("flex-grow overflow-hidden relative", isChatbotDark ? "bg-[#07140e]" : "bg-[#f4faf7]")}>
        {error && (
          <Alert variant="destructive" className="m-3 pr-10" role="alert">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">{error}</AlertDescription>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="absolute right-2 top-2 rounded-md p-1.5 hover:bg-destructive/10">
              <X className="h-3.5 w-3.5" />
            </button>
          </Alert>
        )}

        <div className="h-full overflow-y-auto overscroll-contain pb-4" aria-live="polite" aria-busy={isLoading}>
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
                  <p className={cn("text-[10px] font-bold tracking-wider uppercase text-left pl-1", isChatbotDark && "text-emerald-500/60 font-semibold")}>
                    Frequently Asked Questions:
                  </p>
                  {PREDEFINED_QUESTIONS.map((question) => (
                    <button
                      key={question}
                      type="button"
                      disabled={isLoading}
                      onClick={() => handlePredefinedQuestionClick(question)}
                      className={cn(
                        "w-full justify-start text-left text-xs py-3 px-4 rounded-xl transition-all font-normal whitespace-normal h-auto min-h-[44px] border",
                        isChatbotDark
                          ? "bg-[#0b2016]/50 border-emerald-900/25 hover:bg-[#10301f]/50 hover:border-emerald-500/30 hover:text-emerald-100 text-emerald-200/90"
                          : "bg-white border-emerald-200 hover:bg-emerald-50/50 hover:text-emerald-900 text-emerald-800"
                      )}
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4 w-full max-w-3xl mx-auto">
                {messages.map((msg, index) => (
                  <div
                    key={index}
                    role="button"
                    tabIndex={0}
                    aria-label={`${msg.role === "user" ? "Your message" : "Assistant's answer"}: open in full`}
                    onClick={() => handleMessageClick(msg)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        handleMessageClick(msg)
                      }
                    }}
                    className={cn(
                      "flex flex-col rounded-2xl cursor-pointer transition-all duration-155 p-3 sm:p-4 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400",
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
                    <div className="flex items-center justify-end mt-1.5">
                      <span
                        className={cn(
                          "text-[9px] sm:text-[10px]",
                          msg.role !== "user" && isChatbotDark && "text-emerald-500/60",
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
                    <div className="flex items-center gap-2">
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
                    <p className={cn("text-[10px] font-bold tracking-wider uppercase mb-2", isChatbotDark && "text-emerald-500/60 font-semibold")}>
                      You might also want to ask:
                    </p>
                    <div className="space-y-1.5">
                      {unaskedQuestions
                        .slice(0, 3)
                        .map((question) => (
                          <button
                            key={question}
                            type="button"
                            disabled={isLoading}
                            onClick={() => handlePredefinedQuestionClick(question)}
                            className={cn(
                              "w-full text-left justify-start text-xs py-2 px-3 h-auto min-h-[36px] rounded-lg font-normal whitespace-normal border transition-all",
                              isChatbotDark
                                ? "bg-[#0b2016]/60 hover:bg-[#10301f]/50 hover:text-emerald-100 hover:border-emerald-500/30 text-emerald-200/90 border-emerald-900/25"
                                : "bg-white hover:bg-emerald-50/50 hover:text-emerald-900 text-emerald-800 border-emerald-200"
                            )}
                          >
                            {question}
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
            aria-label="Ask the GUCC Assistant"
            maxLength={2000}
            enterKeyHint="send"
            disabled={isLoading || !sessionId}
            className={cn(
              "flex-1 min-w-0 rounded-full h-11 text-base sm:text-sm pl-4 pr-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 border",
              isChatbotDark
                ? "bg-[#0b2016] border-emerald-900/30 text-emerald-50 placeholder-emerald-700/60"
                : "bg-white text-emerald-950 placeholder-emerald-700/50"
            )}
          />
          <button
            type="button"
            aria-label="Send message"
            onClick={() => handleSendMessage()}
            disabled={isLoading || !userInput.trim() || !sessionId}
            className={cn(
              "border h-11 w-11 rounded-full transition-all active:scale-95 shrink-0 flex items-center justify-center",
              userInput.trim()
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md"
                : (isChatbotDark
                    ? "bg-[#0b2016] border-emerald-950/40 text-emerald-800/40 cursor-not-allowed"
                    : "bg-emerald-50/50 border-emerald-100 text-emerald-400 cursor-not-allowed")
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
      <MessageModal isOpen={isModalOpen} onClose={closeModal} message={selectedMessage} />
    </div>
  )
}

