
// Mock API endpoint for development
// In production, this would be replaced with a real serverless function

import { ProxyRequestBody } from '../services/AIProxyService';

export async function post(request) {
  try {
    const { query, language, systemMessage } = request.body as ProxyRequestBody;
    
    // In production, this would call the OpenRouter API
    // For now, we'll use the client-side proxy
    
    const { handleAIRequest } = await import('../services/AIProxyService');
    
    const result = await handleAIRequest({
      query,
      language,
      systemMessage
    });
    
    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('API error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}
