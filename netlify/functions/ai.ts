import type { Handler, HandlerEvent } from "@netlify/functions";

type SupportedLanguage = "en-US" | "ar-LB" | "fr-FR";

interface HistoryMessage {
  role: "user" | "assistant";
  text: string;
}

interface ProxyRequestBody {
  query: string;
  language: SupportedLanguage;
  history?: HistoryMessage[];
}

const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;
const MAX_QUERY_LENGTH = 2000;
const MAX_HISTORY_ITEMS = 10;
const FETCH_TIMEOUT_MS = 15000;

// ─── Rate limiting (per-IP, in-memory) ───────────────────────────────
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30;           // requests per window
const requestLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  let timestamps = requestLog.get(ip) || [];
  timestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (timestamps.length >= RATE_LIMIT_MAX) {
    requestLog.set(ip, timestamps);
    return true;
  }

  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return false;
}

// Inline cleanup (no setInterval in serverless)
let lastCleanup = Date.now();
function cleanupRateLimit(): void {
  const now = Date.now();
  if (now - lastCleanup < RATE_LIMIT_WINDOW_MS) return;
  lastCleanup = now;
  for (const [ip, timestamps] of requestLog) {
    const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length === 0) requestLog.delete(ip);
    else requestLog.set(ip, recent);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Server-side system prompts — never trust the client for these. */
const SYSTEM_MESSAGES: Record<SupportedLanguage, string> = {
  "ar-LB":
    "أنت مساعد شخصي ذكي اسمه نوفا. أجب بشكل مباشر على الأسئلة بدون مقدمات أو أسئلة توضيحية. قدم معلومات مختصرة ودقيقة فقط.",
  "fr-FR":
    "Vous êtes un assistant personnel intelligent nommé Nova. Répondez directement aux questions sans introduction et sans poser de questions de clarification. Soyez concis et précis.",
  "en-US":
    "You are an intelligent personal assistant named Nova. Answer questions directly without introductions or asking clarifying questions back. Be concise and accurate.",
};

function getLocalizedErrorMessage(language: SupportedLanguage): string {
  switch (language) {
    case "ar-LB":
      return "عذراً، النظام مشغول حالياً. يرجى المحاولة مرة أخرى بعد قليل.";
    case "fr-FR":
      return "Désolé, le système est actuellement occupé. Veuillez réessayer dans un moment.";
    default:
      return "Sorry, the system is currently busy. Please try again in a moment.";
  }
}

const handler: Handler = async (event: HandlerEvent) => {
  cleanupRateLimit();

  // Only allow POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  // Rate limiting
  const ip = event.headers["x-forwarded-for"]?.split(",")[0]?.trim() || event.headers["client-ip"] || "unknown";
  if (isRateLimited(ip)) {
    return {
      statusCode: 429,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Too many requests. Please slow down." }),
    };
  }

  // Parse body
  let request: ProxyRequestBody;
  try {
    request = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  if (!request.query || !request.language) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing required fields: query, language" }),
    };
  }

  // Validate language
  const validLanguages: SupportedLanguage[] = ["en-US", "ar-LB", "fr-FR"];
  if (!validLanguages.includes(request.language)) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid language" }),
    };
  }

  // Input length validation
  if (request.query.length > MAX_QUERY_LENGTH) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: `Query exceeds maximum length of ${MAX_QUERY_LENGTH} characters` }),
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY environment variable is not set");
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Server configuration error" }),
    };
  }

  // Use server-side system message (never from client)
  const systemMessage = SYSTEM_MESSAGES[request.language];

  // Build multi-turn conversation contents
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  if (Array.isArray(request.history)) {
    const history = request.history.slice(-MAX_HISTORY_ITEMS);
    for (const msg of history) {
      if (
        msg &&
        typeof msg.text === "string" &&
        msg.text.length > 0 &&
        (msg.role === "user" || msg.role === "assistant")
      ) {
        contents.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.text }],
        });
      }
    }
  }
  contents.push({ role: "user", parts: [{ text: request.query }] });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        await sleep(RETRY_DELAY * attempt);
      }

      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemMessage }] },
            contents,
            generationConfig: {
              temperature: 0.7,
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 1024,
            },
            safetySettings: [
              { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
              { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
              { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
              { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            ],
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Only retry on 503 (overloaded) — 4xx errors are not retriable
        if (response.status === 503) {
          console.warn(`Attempt ${attempt + 1}/${MAX_RETRIES}: Gemini API overloaded, retrying...`);
          lastError = new Error(`Gemini API overloaded: ${JSON.stringify(errorData)}`);
          continue;
        }

        // Non-retriable error — break immediately
        console.error(`Gemini API error ${response.status}:`, errorData);
        return {
          statusCode: 502,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: true,
            responseText: getLocalizedErrorMessage(request.language),
            language: request.language,
          }),
        };
      }

      const data = await response.json();

      if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
        lastError = new Error("Invalid response format from Gemini API");
        continue;
      }

      const aiResponse = data.candidates[0].content.parts[0].text.trim();

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responseText: aiResponse,
          language: request.language,
        }),
      };
    } catch (error) {
      console.error(`Attempt ${attempt + 1}/${MAX_RETRIES} error:`, error);
      lastError = error as Error;
    }
  }

  // All retries failed — return proper error status
  console.error("All retries failed:", lastError?.message);
  return {
    statusCode: 502,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      error: true,
      responseText: getLocalizedErrorMessage(request.language),
      language: request.language,
    }),
  };
};

export { handler };
