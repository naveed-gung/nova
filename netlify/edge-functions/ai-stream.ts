/* eslint-disable */
// @ts-nocheck — This file runs in Netlify's Deno Edge Function runtime, not Node.js.

/**
 * Streaming AI proxy — uses Gemini's streamGenerateContent endpoint
 * to return Server-Sent Events to the client for progressive text display.
 *
 * Also includes basic per-IP rate limiting.
 */

// ─── Types ───────────────────────────────────────────────────────────
type SupportedLanguage = "en-US" | "ar-LB" | "fr-FR";

// ─── Constants ───────────────────────────────────────────────────────
const VALID_LANGUAGES: SupportedLanguage[] = ["en-US", "ar-LB", "fr-FR"];
const MAX_QUERY_LENGTH = 2000;
const MAX_HISTORY_ITEMS = 10;
const FETCH_TIMEOUT_MS = 30000;

const SYSTEM_MESSAGES: Record<SupportedLanguage, string> = {
  "ar-LB":
    "أنت مساعد شخصي ذكي اسمه نوفا. أجب بشكل مباشر على الأسئلة بدون مقدمات أو أسئلة توضيحية. قدم معلومات مختصرة ودقيقة فقط.",
  "fr-FR":
    "Vous êtes un assistant personnel intelligent nommé Nova. Répondez directement aux questions sans introduction et sans poser de questions de clarification. Soyez concis et précis.",
  "en-US":
    "You are an intelligent personal assistant named Nova. Answer questions directly without introductions or asking clarifying questions back. Be concise and accurate.",
};

// ─── Rate limiting (per-IP, in-memory) ───────────────────────────────
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const requestLog = new Map();

function isRateLimited(ip) {
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

// Periodic cleanup to prevent memory leaks (runs inline, not setInterval)
let lastCleanup = Date.now();
function cleanupRateLimitLog() {
  const now = Date.now();
  if (now - lastCleanup < RATE_LIMIT_WINDOW_MS) return;
  lastCleanup = now;
  for (const [ip, timestamps] of requestLog) {
    const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length === 0) requestLog.delete(ip);
    else requestLog.set(ip, recent);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Main handler ────────────────────────────────────────────────────
export default async (request) => {
  cleanupRateLimitLog();

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Rate limiting
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
  if (isRateLimited(ip)) {
    return jsonResponse({ error: "Too many requests. Please slow down." }, 429);
  }

  // Parse body
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (!body.query || !body.language) {
    return jsonResponse({ error: "Missing required fields" }, 400);
  }

  if (!VALID_LANGUAGES.includes(body.language)) {
    return jsonResponse({ error: "Invalid language" }, 400);
  }

  if (body.query.length > MAX_QUERY_LENGTH) {
    return jsonResponse({ error: `Query exceeds ${MAX_QUERY_LENGTH} characters` }, 400);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.error("GEMINI_API_KEY not set");
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const systemMessage = SYSTEM_MESSAGES[body.language];

  // Build multi-turn contents
  const contents = [];
  if (Array.isArray(body.history)) {
    const history = body.history.slice(-MAX_HISTORY_ITEMS);
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
  contents.push({ role: "user", parts: [{ text: body.query }] });

  // Call Gemini streaming endpoint
  let geminiResponse;
  try {
    geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse`,
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
      },
    );
  } catch (error) {
    console.error("Gemini fetch error:", error);
    return jsonResponse({ error: "AI service unavailable" }, 502);
  }

  if (!geminiResponse.ok || !geminiResponse.body) {
    const errBody = await geminiResponse.text().catch(() => "");
    console.error(`Gemini API error ${geminiResponse.status}:`, errBody);
    return jsonResponse({ error: "AI service error" }, 502);
  }

  // Transform Gemini SSE → clean text-only SSE for the client
  const reader = geminiResponse.body.getReader();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ text })}\n\n`),
                  );
                }
              } catch {
                // Skip malformed JSON chunks
              }
            }
          }
        }

        // Process any remaining data in the buffer
        if (buffer.trim().startsWith("data: ")) {
          const data = buffer.trim().slice(6).trim();
          if (data && data !== "[DONE]") {
            try {
              const parsed = JSON.parse(data);
              const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ text })}\n\n`),
                );
              }
            } catch {
              // Skip malformed final chunk
            }
          }
        }
      } catch (error) {
        console.error("Stream read error:", error);
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
};

export const config = { path: "/api/ai-stream" };
