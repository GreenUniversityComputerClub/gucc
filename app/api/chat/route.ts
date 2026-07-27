import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { type NextRequest, NextResponse } from "next/server";
import executives from '@/data/executives.json';  
import events from '@/data/events.json';  
import predefined from '@/data/predefined.json';  

// Get API key from server environment variables
const apiKey = process.env.GOOGLE_API_KEY
const MODEL_NAME = "gemini-2.0-flash";

// Initialize the Google Generative AI client
const genAI = new GoogleGenerativeAI(apiKey!);

const generationConfig = {
  temperature: 0.9,
  topP: 1,
  topK: 1,
  maxOutputTokens: 2048,
};

const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// Store chat sessions in memory (in production, use a database)
const chatSessions = new Map();

export async function POST(request: NextRequest) {
  try {
    const { message, sessionId } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: "API key is missing" }, { status: 500 });
    }

    let chatSession;

    // Get or create a chat session
    if (sessionId && chatSessions.has(sessionId)) {
      chatSession = chatSessions.get(sessionId);
    } else {
      const genModel = genAI.getGenerativeModel({ model: MODEL_NAME });

      // Start the chat session with an initial history message
      chatSession = await genModel.startChat({
        generationConfig,
        safetySettings,
        history: [
          { role: "user", parts: [{ text: "Hello, how can I help today?" }] }
        ],
      });

      const newSessionId = Date.now().toString();
      chatSessions.set(newSessionId, chatSession);

      // Return the new session if no message is provided
      if (!message) {
        return NextResponse.json({ sessionId: newSessionId });
      }
    }

// Combine relevant context
const context = `
You are the GUCC Assistant.
Here’s the relevant data:
- Predefined: ${JSON.stringify(predefined)}
- Events: ${JSON.stringify(events)}
- Executives: ${JSON.stringify(executives)}

Please respond professionally in 2 lines or less. Avoid giving social network or ID data.
`;




    // Send the user message along with context
    const result = await chatSession.sendMessage(`${context}\nUser Query: ${message}`);
    const response = result.response.text();

    return NextResponse.json({
      sessionId: sessionId || chatSessions.keys().next().value,
      response,
    });

  } catch (error: any) {
    console.error("Error in chat API:", error);
    return NextResponse.json({ error: error.message || "Failed to process request" }, { status: 500 });
  }
}
