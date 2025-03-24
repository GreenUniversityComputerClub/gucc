import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai"
import { type NextRequest, NextResponse } from "next/server"

// Get API key from server environment variables
const apiKey = process.env.GOOGLE_API_KEY 
const MODEL_NAME = "gemini-2.0-flash"

// Initialize the Google Generative AI client
const genAI = new GoogleGenerativeAI(apiKey!)

const generationConfig = {
  temperature: 0.9,
  topP: 1,
  topK: 1,
  maxOutputTokens: 2048,
}

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
]

// Store chat sessions in memory (in production, use a database)
const chatSessions = new Map()

export async function POST(request: NextRequest) {
  try {
    const { message, sessionId } = await request.json()

    if (!apiKey) {
      return NextResponse.json({ error: "API key is missing" }, { status: 500 })
    }

    let chatSession

    // Get or create a chat session
    if (sessionId && chatSessions.has(sessionId)) {
      chatSession = chatSessions.get(sessionId)
    } else {
      const genModel = genAI.getGenerativeModel({ model: MODEL_NAME })
      chatSession = await genModel.startChat({
        generationConfig,
        safetySettings,
        history: [],
      })

      const newSessionId = Date.now().toString()
      chatSessions.set(newSessionId, chatSession)

      // Return the new session without a message response
      if (!message) {
        return NextResponse.json({ sessionId: newSessionId })
      }
    }

    // Send message and get response
    const result = await chatSession.sendMessage(message)
    const response = result.response.text()

    return NextResponse.json({
      sessionId: sessionId || chatSessions.keys().next().value,
      response,
    })
  } catch (error: any) {
    console.error("Error in chat API:", error)
    return NextResponse.json({ error: error.message || "Failed to process request" }, { status: 500 })
  }
}

