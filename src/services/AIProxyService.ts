// API Proxy Service - For handling API requests without exposing keys in client-side code

// This would typically be a serverless function, but for demonstration,
// we'll create a placeholder that would be replaced with actual serverless implementation

import { SupportedLanguage } from './SpeechService';

interface ProxyRequestBody {
  query: string;
  language: SupportedLanguage;
  systemMessage: string;
}

interface AIResponse {
  responseText: string;
  language: SupportedLanguage;
}

const cleanQuery = (query: string): string => {
  return query.trim();
};

const detectArabicText = (text: string): boolean => {
  const arabicPattern = /[\u0600-\u06FF]/;
  return arabicPattern.test(text);
};

const MAX_RETRIES = 2;
const RETRY_DELAY = 1000; // 1 second

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function tryHuggingFaceAPI(request: ProxyRequestBody): Promise<AIResponse> {
  try {
    // Select appropriate model based on language
    const model = request.language === 'ar-LB' 
      ? 'Salesforce/xgen-7b-8k-arabic'  // Arabic model
      : 'mistralai/Mistral-7B-Instruct-v0.1'; // Default model for other languages

    const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_HUGGING_FACE_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: `${request.systemMessage}\n\nUser: ${request.query}\nAssistant:`,
        parameters: {
          max_new_tokens: 250,
          temperature: 0.7,
          top_p: 0.95,
          do_sample: true,
          return_full_text: false
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Hugging Face API failed with status ${response.status}`);
    }

    const data = await response.json();
    let aiResponse = Array.isArray(data) ? data[0].generated_text : data.generated_text;

    // Clean up response
    aiResponse = aiResponse.trim();
    
    // Validate Arabic responses
    if (request.language === 'ar-LB' && !detectArabicText(aiResponse)) {
      throw new Error('Response does not contain Arabic text');
    }

    return {
      responseText: aiResponse,
      language: request.language
    };
  } catch (error) {
    console.error('Hugging Face API error:', error);
    throw error;
  }
}

export async function handleAIRequest(request: ProxyRequestBody): Promise<AIResponse> {
  let lastError: Error | null = null;
  
  // First try Gemini API
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        await sleep(RETRY_DELAY * attempt);
      }

      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': import.meta.env.VITE_GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${request.systemMessage}\n\nUser: ${request.query}`
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          },
          safetySettings: [
            {
              category: "HARM_CATEGORY_HARASSMENT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_HATE_SPEECH",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            }
          ]
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        
        if (response.status === 503) {
          console.warn(`Attempt ${attempt + 1}/${MAX_RETRIES}: Gemini API overloaded, retrying...`);
          lastError = new Error(`Gemini API overloaded: ${JSON.stringify(errorData)}`);
          continue;
        }
        
        throw new Error(`Gemini API failed with status ${response.status}: ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      
      if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error('Invalid response format from Gemini API');
      }

      let aiResponse = data.candidates[0].content.parts[0].text;
      aiResponse = aiResponse.trim();

      if (request.language === 'ar-LB' && !detectArabicText(aiResponse)) {
        throw new Error('Response does not contain Arabic text');
      }

      return {
        responseText: aiResponse,
        language: request.language
      };

    } catch (error) {
      console.error('Gemini API error:', error);
      lastError = error as Error;
      
      // Only try Hugging Face on the last attempt
      if (attempt === MAX_RETRIES - 1) {
        console.log('Gemini API failed, falling back to Hugging Face...');
        try {
          return await tryHuggingFaceAPI(request);
        } catch (hfError) {
          console.error('Hugging Face API also failed:', hfError);
          // If both APIs fail, return a user-friendly error
          return {
            responseText: getLocalizedErrorMessage(request.language),
            language: request.language
          };
        }
      }
    }
  }

  // This should never be reached due to the error handling above, but TypeScript needs it
  throw lastError || new Error('Unknown error occurred');
}

function getLocalizedErrorMessage(language: SupportedLanguage): string {
  switch (language) {
    case 'ar-LB':
      return 'عذراً، النظام مشغول حالياً. يرجى المحاولة مرة أخرى بعد قليل.';
    case 'fr-FR':
      return 'Désolé, le système est actuellement occupé. Veuillez réessayer dans un moment.';
    default:
      return 'Sorry, the system is currently busy. Please try again in a moment.';
  }
}

export type { ProxyRequestBody };

