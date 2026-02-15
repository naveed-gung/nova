<div align="center">

![Nova Logo](logo.svg)

# Nova -- AI Voice Assistant

![Nova Voice Assistant Preview](/public/image.png)

</div>

---

## <img src="public/icons/star.svg" width="20" height="20" alt="star"> Overview

Nova is a production-grade, multilingual AI voice assistant that delivers natural conversation directly in the browser. Powered by Google Gemini 2.0 Flash with real-time SSE streaming, a 3D GLSL shader visualization, and full Web Speech API integration, Nova supports English, Arabic (Lebanese), and French. Talk, type, or say "Hey Nova" -- it handles all three.

---

## <img src="public/icons/sparkle.svg" width="20" height="20" alt="features"> Features

### <img src="public/icons/microphone.svg" width="18" height="18" alt="voice"> Voice & Speech

- <img src="public/icons/speaking.svg" width="14" height="14" alt="speech recognition"> **Speech Recognition** -- Browser-native speech-to-text via Web Speech API with interim results
- <img src="public/icons/music.svg" width="14" height="14" alt="tts"> **Text-to-Speech** -- Sentence-queue TTS with per-language pitch/rate tuning and intelligent voice selection
- <img src="public/icons/sound.svg" width="14" height="14" alt="wake word"> **Wake Word Detection** -- Hands-free activation with "Hey Nova" / "Nova"; extracts trailing query automatically
- <img src="public/icons/clock.svg" width="14" height="14" alt="chrome fix"> **Chrome 15s TTS Fix** -- Prevents Chrome from silently cutting off long utterances via sentence splitting and periodic pause/resume keep-alive
- <img src="public/icons/language.svg" width="14" height="14" alt="multilingual"> **Multilingual Support** -- English (US), Arabic (Lebanese), French with voice-triggered language switching
- <img src="public/icons/target.svg" width="14" height="14" alt="debounce"> **Listening Debounce** -- 250ms stop-restart delay prevents overlapping recognition sessions

### <img src="public/icons/robot.svg" width="18" height="18" alt="ai"> AI Backend

- <img src="public/icons/zap.svg" width="14" height="14" alt="streaming"> **SSE Streaming** -- Real-time progressive text delivery via Netlify Edge Functions (Deno runtime)
- <img src="public/icons/server.svg" width="14" height="14" alt="proxy"> **Server-side API Proxy** -- Gemini API key never reaches the browser; proxied through Netlify serverless functions
- <img src="public/icons/loading.svg" width="14" height="14" alt="context"> **Multi-turn Context** -- Last 10 conversation messages sent with each request for context-aware responses
- <img src="public/icons/shield.svg" width="14" height="14" alt="rate limit"> **Rate Limiting** -- 30 requests per 60-second window per IP with in-memory tracking
- <img src="public/icons/clock.svg" width="14" height="14" alt="retry"> **Retry with Backoff** -- Automatic retry on 503 errors (2 attempts, 1s base delay)
- <img src="public/icons/target.svg" width="14" height="14" alt="safety"> **Safety Filtering** -- 4 harm categories blocked at medium threshold (harassment, hate, sexual, dangerous content)
- <img src="public/icons/tools.svg" width="14" height="14" alt="config"> **Tuned Generation** -- temperature 0.7, topK 40, topP 0.95, maxOutputTokens 1024
- <img src="public/icons/wifi.svg" width="14" height="14" alt="fallback"> **Streaming Fallback** -- Automatically falls back to single-shot requests when streaming fails

### <img src="public/icons/magic.svg" width="18" height="18" alt="ux"> User Experience

- <img src="public/icons/click.svg" width="14" height="14" alt="text input"> **Text Input** -- Type-to-chat alternative with localized placeholders and RTL support for Arabic
- <img src="public/icons/search.svg" width="14" height="14" alt="search"> **Message Search & Filtering** -- Real-time case-insensitive search with highlighted matching text and result count
- <img src="public/icons/database.svg" width="14" height="14" alt="persistence"> **Conversation Persistence** -- Messages survive page refresh via localStorage (capped at 200 messages with schema validation)
- <img src="public/icons/wave.svg" width="14" height="14" alt="greeting"> **Time-based Greeting** -- Contextual welcome message based on time of day (morning / afternoon / evening)
- <img src="public/icons/responsive.svg" width="14" height="14" alt="responsive"> **Fully Responsive** -- Adapts layout and blob sizing for mobile and desktop
- <img src="public/icons/eye.svg" width="14" height="14" alt="accessibility"> **Accessible Conversation History** -- Focus trap, keyboard navigation, focus restoration, outside-click dismiss
- <img src="public/icons/globe.svg" width="14" height="14" alt="language selector"> **Language Selector** -- Visual picker with flag indicators; spoken confirmation on switch

### <img src="public/icons/wifi.svg" width="18" height="18" alt="network"> Network Awareness

- <img src="public/icons/wifi.svg" width="14" height="14" alt="online"> **Online/Offline Detection** -- Reactive connectivity status with localized banner (EN/AR/FR)
- <img src="public/icons/zap.svg" width="14" height="14" alt="quality"> **Network Quality Monitoring** -- Reads effective connection type, downlink, RTT, and Save-Data via Network Information API
- <img src="public/icons/loading.svg" width="14" height="14" alt="adaptive"> **Adaptive Streaming** -- Automatically disables SSE on 2G / slow-2G / Save-Data connections
- <img src="public/icons/target.svg" width="14" height="14" alt="slow"> **Slow Network Banner** -- Visual warning when degraded connection is detected

### <img src="public/icons/palette.svg" width="18" height="18" alt="visualization"> 3D Blob Visualization

- <img src="public/icons/sparkle.svg" width="14" height="14" alt="three"> **Three.js Animated Blob** -- IcosahedronGeometry at detail level 5 (~20K faces) with custom GLSL shaders
- <img src="public/icons/wave.svg" width="14" height="14" alt="noise"> **Simplex Noise Deformation** -- Organic surface morphing via 3D simplex noise in vertex shader
- <img src="public/icons/magic.svg" width="14" height="14" alt="fresnel"> **Fresnel Rim Lighting** -- Glowing edge effect with pulse color oscillation in fragment shader
- <img src="public/icons/palette.svg" width="14" height="14" alt="colors"> **State-driven Colors** -- Idle (purple), Listening (blue), Speaking (purple), Responding (green)
- <img src="public/icons/lightning.svg" width="14" height="14" alt="webgl"> **WebGL Context Recovery** -- Handles GPU context loss/restore without reloading
- <img src="public/icons/click.svg" width="14" height="14" alt="keyboard"> **Keyboard & Screen Reader Support** -- Enter/Space activation, dynamic aria-labels per state

### <img src="public/icons/shield.svg" width="18" height="18" alt="security"> Security

- <img src="public/icons/shield.svg" width="14" height="14" alt="csp"> **Content Security Policy** -- Strict CSP with whitelisted sources; frame-ancestors and object-src set to none
- <img src="public/icons/shield.svg" width="14" height="14" alt="hsts"> **HSTS** -- Forced HTTPS with 2-year max-age, includeSubDomains, and preload
- <img src="public/icons/shield.svg" width="14" height="14" alt="headers"> **Security Headers** -- X-Frame-Options (DENY), X-Content-Type-Options (nosniff), Referrer-Policy (strict-origin-when-cross-origin)
- <img src="public/icons/shield.svg" width="14" height="14" alt="permissions"> **Permissions Policy** -- Microphone restricted to self; camera blocked entirely
- <img src="public/icons/shield.svg" width="14" height="14" alt="validation"> **Input Validation** -- Query length (2000 chars), history cap (10 items), language enum enforcement

### <img src="public/icons/star.svg" width="18" height="18" alt="extras"> Additional Features

- <img src="public/icons/heart.svg" width="14" height="14" alt="favicon"> **Dynamic Favicon** -- Favicon changes to match assistant state (idle / listening / speaking / responding)
- <img src="public/icons/rocket.svg" width="14" height="14" alt="pwa"> **Progressive Web App** -- Installable with offline caching via Workbox service worker
- <img src="public/icons/eye.svg" width="14" height="14" alt="analytics"> **Privacy-friendly Analytics** -- Plausible integration (production-only) with custom event tracking
- <img src="public/icons/tools.svg" width="14" height="14" alt="errors"> **Error Tracking** -- Global error capture with FIFO buffer (max 20 reports); unhandled rejection handling
- <img src="public/icons/globe.svg" width="14" height="14" alt="localized errors"> **Localized Error Messages** -- Error text displayed in the user's active language

---

## <img src="public/icons/rocket.svg" width="20" height="20" alt="rocket"> Getting Started

1. **Clone the Repository**

   ```bash
   git clone https://github.com/naveed-gung/nova.git
   cd nova
   ```

2. **Install Dependencies**

   ```bash
   npm install
   ```

3. **Set Up Environment Variables**

   For **local development**, create a `.env` file:

   ```env
   VITE_GEMINI_API_KEY=your_gemini_api_key
   ```

   For **Netlify deployment**, set `GEMINI_API_KEY` in the Netlify dashboard (Settings > Environment variables). The API key is proxied through a serverless function and never exposed to the client.

4. **Start Development Server**

   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:8080`.

---

## <img src="public/icons/speaking.svg" width="20" height="20" alt="voice"> Voice Commands

### Wake Word

Say **"Hey Nova"** or **"Nova"** followed by your question to activate hands-free. The assistant will detect the wake word and process the trailing query automatically.

### Language Switching

| Language    | Commands                                                               |
| ----------- | ---------------------------------------------------------------------- |
| **English** | "Switch to Arabic", "Speak Arabic", "Switch to French", "Speak French" |
| **Arabic**  | "تكلم انجليزي" (Speak English), "تكلم فرنسي" (Speak French)            |
| **French**  | "Parle anglais", "Passer a l'anglais", "Parle arabe"                   |

---

## <img src="public/icons/tools.svg" width="20" height="20" alt="tech"> Tech Stack

| Layer                                                                               | Technology                                                       |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| <img src="public/icons/sparkle.svg" width="14" height="14" alt="frontend"> Frontend | React 18.3.1 + TypeScript 5.5.3                                  |
| <img src="public/icons/palette.svg" width="14" height="14" alt="styling"> Styling   | Tailwind CSS 3.4.11 + tailwindcss-animate                        |
| <img src="public/icons/robot.svg" width="14" height="14" alt="ai"> AI               | Google Gemini 2.0 Flash (via Netlify Functions + Edge Functions) |
| <img src="public/icons/music.svg" width="14" height="14" alt="speech"> Speech       | Web Speech API (SpeechRecognition + SpeechSynthesis)             |
| <img src="public/icons/sparkle.svg" width="14" height="14" alt="3d"> 3D             | Three.js 0.159.0 (custom GLSL shaders)                           |
| <img src="public/icons/lightning.svg" width="14" height="14" alt="build"> Build     | Vite 7.3.1 + SWC                                                 |
| <img src="public/icons/rocket.svg" width="14" height="14" alt="pwa"> PWA            | vite-plugin-pwa 1.2.0 + Workbox                                  |
| <img src="public/icons/server.svg" width="14" height="14" alt="backend"> Backend    | Netlify Functions (Node.js) + Edge Functions (Deno)              |

---

## <img src="public/icons/globe.svg" width="20" height="20" alt="architecture"> Architecture

### <img src="public/icons/palette.svg" width="18" height="18" alt="blob"> Dynamic Blob Visualization

- GLSL simplex noise vertex shader drives organic surface deformation
- Fresnel rim lighting with pulse color oscillation in fragment shader
- State-driven color and animation parameters (speed, amplitude, pulse rate)
- WebGL context recovery for resilience against GPU context loss
- Code-split Three.js chunk (~452KB) loaded independently

### <img src="public/icons/robot.svg" width="18" height="18" alt="ai"> AI Pipeline

- **Streaming path**: Client → Netlify Edge Function (Deno) → Gemini SSE endpoint → chunked text back to UI
- **Non-streaming path**: Client → Netlify Handler Function (Node.js) → Gemini REST endpoint → complete response
- Automatic path selection based on network quality; manual fallback on stream failure
- Per-language system prompts instruct concise, direct responses

### <img src="public/icons/shield.svg" width="18" height="18" alt="security"> Security Model

- API key isolated on server; never bundled or transmitted to the client
- CSP, HSTS, X-Frame-Options, and Permissions-Policy headers enforced via `netlify.toml`
- Rate limiting at the function layer (30 req/min per IP)
- Input validation on query length, history depth, and language enum

### <img src="public/icons/server.svg" width="18" height="18" alt="deployment"> Deployment

- Hosted on Netlify with automatic builds from the repository
- PWA with Workbox service worker for offline asset caching
- Code-split bundles for optimal loading performance
- SPA fallback routing configured for client-side navigation

---

<div align="center">

[Live Demo](https://n0v0.netlify.app/)

</div>
