"use client"

import type React from "react"
import { useEffect, useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Send, AlertCircle, Loader2, Computer, GraduationCap } from "lucide-react"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { MessageModal } from "./message-modal"

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

export default function Chatbot() {
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
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Fixed Header */}
      <div className="bg-green-700 text-white py-2 px-3 sm:py-3 sm:px-6 md:py-4 md:px-8 border-b border-green-800 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-xl sm:text-2xl md:text-3xl mx-auto font-bold text-center flex items-center gap-1 sm:gap-2 md:gap-3">
            <Computer className="h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7" />
            GUCC Assistant
          </h2>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-grow overflow-hidden relative">
        {error && (
          <Alert variant="destructive" className="m-2 sm:m-4 md:m-7">
            <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6" />
            <AlertDescription className="text-sm sm:text-base md:text-lg">{error}</AlertDescription>
          </Alert>
        )}

        <div className="h-full overflow-y-auto bg-green-50 pb-4">
          <div className="p-3 sm:p-4 md:p-6 lg:p-8">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center text-muted-foreground p-3 sm:p-6 md:p-8 lg:p-10">
                <h3 className="text-base sm:text-lg md:text-xl lg:text-2xl font-medium mb-1 sm:mb-2 md:mb-3 text-green-800">
                  Welcome to GUCC Assistant
                </h3>
                <p className="text-sm sm:text-base md:text-lg lg:text-xl text-green-700 max-w-2xl mx-auto">
                  Ask me anything about Green University Computer Club, events, membership, or how we can help your
                  career in tech!
                </p>
                <div className="mt-3 sm:mt-4 md:mt-6 lg:mt-8 space-y-2 md:space-y-3 w-full max-w-2xl">
                  {predefinedQuestions.map((item, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      onClick={() => handlePredefinedQuestionClick(item.question)}
                      className="bg-green-100 hover:bg-green-200 text-green-800 border-green-300 w-full text-left justify-start text-xs sm:text-sm md:text-base lg:text-lg py-2 px-3 md:py-3 md:px-4 h-auto min-h-[40px] md:min-h-[50px]"
                    >
                      {item.question}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4 md:space-y-5 w-full max-w-4xl mx-auto">
                {messages.map((msg, index) => (
                  <div
                    key={index}
                    className={cn(
                      "flex flex-col rounded-lg",
                      "p-3 sm:p-4 md:p-5",
                      msg.role === "user" ? "ml-auto bg-green-600 text-white" : "mr-auto bg-green-100 text-green-900",
                      "max-w-[85%] sm:max-w-[80%] md:max-w-[75%] lg:max-w-[70%]",
                    )}
                  >
                    <div className="whitespace-pre-wrap text-sm sm:text-base md:text-lg">
                      {msg.text}
                    </div>
                    <div className="flex items-center justify-end mt-2">
                      <span
                        className={cn(
                          "text-[10px] sm:text-xs md:text-sm",
                          msg.role === "user" ? "text-green-100" : "text-green-700",
                        )}
                      >
                        {format(msg.timestamp, "h:mm a")}
                      </span>
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex flex-col max-w-[85%] sm:max-w-[80%] md:max-w-[75%] lg:max-w-[70%] rounded-lg p-3 sm:p-4 md:p-5 mr-auto bg-green-100 text-green-900">
                    <div className="flex items-center gap-1 sm:gap-2 md:gap-3">
                      <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5 animate-spin" />
                      <span className="text-sm sm:text-base md:text-lg">Thinking...</span>
                    </div>
                  </div>
                )}

                {/* Show remaining questions after each bot response */}
                {showSuggestions && messages.length > 0 && messages[messages.length - 1].role === "model" && (
                  <div className="my-3 sm:my-4 md:my-5 p-2 sm:p-3 md:p-4 bg-green-50 border border-green-200 rounded-lg max-w-4xl mx-auto">
                    <p className="text-xs sm:text-sm md:text-base lg:text-lg font-medium text-green-800 mb-1 sm:mb-2 md:mb-3">
                      You might also want to ask:
                    </p>
                    <div className="space-y-1.5 sm:space-y-2 md:space-y-3 grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
                      {getUnaskedQuestions()
                        .slice(0, 4)
                        .map((item, index) => (
                          <Button
                            key={index}
                            variant="outline"
                            size="sm"
                            onClick={() => handlePredefinedQuestionClick(item.question)}
                            className="bg-white hover:bg-green-100 text-green-800 border-green-200 w-full text-left justify-start text-xs sm:text-sm md:text-base py-1.5 px-2 md:py-2 md:px-3 h-auto min-h-[32px] md:min-h-[40px]"
                          >
                            {item.question}
                          </Button>
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
      <div className="p-2 sm:p-3 md:p-4 lg:p-6 border-t border-green-200 bg-green-50 flex-shrink-0">
        <div className="flex gap-1 sm:gap-2 md:gap-3 max-w-4xl mx-auto">
          <Input
            ref={inputRef}
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask something about GUCC..."
            disabled={isLoading || !sessionId}
            className="flex-1 border-green-300 focus-visible:ring-green-500 text-sm sm:text-base md:text-lg h-9 sm:h-10 md:h-12"
          />
          <Button
            onClick={() => handleSendMessage()}
            disabled={isLoading || !userInput.trim() || !sessionId}
            size="icon"
            className="bg-green-700 hover:bg-green-800 h-9 w-9 sm:h-10 sm:w-10 md:h-12 md:w-12"
          >
            {isLoading ? (
              <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5 animate-spin" />
            ) : (
              <Send className="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5" />
            )}
          </Button>
        </div>
      </div>

      {/* Custom Modal */}
      <MessageModal isOpen={isModalOpen} onClose={closeModal} message={selectedMessage} screenSize={screenSize} />
    </div>
  )
}

