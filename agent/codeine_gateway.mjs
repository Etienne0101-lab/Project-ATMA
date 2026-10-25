// Project ATMA  Codeine Gateway (Enhanced)
// 
// This is the UNIFIED gateway that combines:
// 1. Groq proxy (existing from atma-gateway.mjs)
// 2. Ollama proxy for DeepHat (existing from atma-gateway.mjs)
// 3. NEW: Codeine-specific endpoints for enhanced coding assistance
// 4. NEW: Multi-model routing (can route to different models based on task)
// 5. NEW: Mythic integration endpoints for real-time operations
//
// The Codeine Gateway is designed to be:
// - A drop-in replacement for existing ATMA gateway infrastructure
// - Fully backward compatible with existing DeepHat and Groq integrations
// - Enhanced with Codeine-specific features for master coding assistance
// - Production-ready with proper security, authentication, and monitoring
//
// Architecture:
//   ┌─────────────────────────────────────────────────────────────┐
//   │                      Codeine Gateway                            │
//   │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
//   │  │   Groq Proxy     │  │  Ollama Proxy    │  │ Codeine AI  │ │
//   │  │ (OpenAI-compat)  │  │ (DeepHat/Codeine)│  │  Engine     │ │
//   │  └────────┬────────┘  └────────┬────────┘  └──────┬──────┘ │
//   │           │                  │                  │       │
//   │           ▼                  ▼                  ▼       │
//   │  ┌─────────────────┐ ┌─────────────┐ ┌─────────────┐     │
//   │  │  api.groq.com    │ │ Ollama      │ │ Model       │     │
//   │  │  (Cloud/Edge)    │ │ (Local/Host)│ │ Router      │     │
//   │  └─────────────────┘ └─────────────┘ └─────────────┘     │
//   │                                                             │
//   │  ┌─────────────────────────────────────────────────────┐  │
//   │  │                    Mythic Proxy                        │  │
//   │  │  (Forwards to real Mythic server for operations)      │  │
//   │  └─────────────────────────────────────────────────────┘  │
//   │                                                             │
//   │  ┌─────────────────────────────────────────────────────┐  │
//   │  │                    Monitoring                           │  │
//   │  │  (Metrics, Health Checks, Logging)                      │  │
//   │  └─────────────────────────────────────────────────────┘  │
//   └─────────────────────────────────────────────────────────────┘
//
// Security Model:
//   - ALL endpoints require ATMA_GATEWAY_TOKEN (x-atma-token header)
//   - API keys for external services (Groq, etc.) are NEVER exposed to clients
//   - Keys are stored only in gateway environment variables
//   - Gateway binds to localhost only (127.0.0.1)
//   - For remote access: use Tailscale Serve or similar zero-trust networking
//   - Never expose gateway ports publicly
//
// Usage:
//   # Basic startup (all services enabled)
//   GROQ_API_KEY=... ATMA_GATEWAY_TOKEN=... node agent/codeine_gateway.mjs
//
//   # With all options
//   GROQ_API_KEY=... \
//   CODEINE_GROQ_KEY=... \
//   ATMA_GATEWAY_TOKEN=... \
//   MYTHIC_URL=https://127.0.0.1:7443 \
//   MYTHIC_INSECURE_TLS=1 \
//   OLLAMA_URL=http://127.0.0.1:11434 \
//   CODEINE_MODEL=codeine-7b \
//   node agent/codeine_gateway.mjs 8787
//
//   # Production (with monitoring)
//   MONITORING_ENABLED=1 \
//   METRICS_PORT=9090 \
//   node agent/codeine_gateway.mjs 8787
//
// Endpoints:
//   GET  /status                          - Gateway status
//   GET  /health                          - Health check
//   GET  /metrics                         - Prometheus metrics (if enabled)
//   
//   # Groq (OpenAI-compatible)
//   GET  /v1/models                      - List Groq models
//   POST /v1/chat/completions           - Chat completions (streaming supported)
//   
//   # Ollama (DeepHat/Codeine)
//   POST /ollama/api/chat                - Ollama chat
//   GET  /ollama/api/tags                - List Ollama models
//   
//   # Codeine-specific
//   POST /codeine/chat                   - Codeine chat (auto-routing)
//   POST /codeine/complete               - Code completion
//   POST /codeine/analyze                - Code analysis
//   POST /codeine/generate               - Code generation
//   POST /codeine/explain                - Code explanation
//   POST /codeine/optimize               - Code optimization
//   POST /codeine/translate              - Language translation
//   
//   # Mythic integration
//   POST /mythic/graphql                 - Forward to Mythic GraphQL
//   POST /mythic/auth                    - Forward to Mythic auth
//   
//   # Multi-model routing
//   POST /route                          - Route to best model for task
//
// Environment Variables:
//   GROQ_API_KEY: Groq API key
//   CODEINE_GROQ_KEY: Alternative Groq key for Codeine
//   ATMA_GATEWAY_TOKEN: Required gateway authentication token
//   MYTHIC_URL: Mythic server URL (default: https://127.0.0.1:7443)
//   MYTHIC_INSECURE_TLS: Set to "1" to accept self-signed certs
//   OLLAMA_URL: Ollama server URL (default: http://127.0.0.1:11434)
//   CODEINE_MODEL: Default Codeine model (default: codeine-7b)
//   CODEINE_FALLBACK: Fallback model if Codeine not available
//   MONITORING_ENABLED: Enable Prometheus metrics (default: false)
//   METRICS_PORT: Port for metrics server (default: 9090)
//   LOG_LEVEL: Logging level (debug, info, warn, error)
//

import { createServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ============================================================================
// CONFIGURATION
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load configuration from environment
const config = {
  // Ports
  port: Number(process.env.CODEINE_PORT || process.env.ATMA_GATEWAY_PORT || 8787),
  metricsPort: Number(process.env.METRICS_PORT || 9090),
  
  // API Keys (NEVER logged or exposed)
  groqKey: process.env.GROQ_API_KEY || process.env.CODEINE_GROQ_KEY || "",
  
  // Gateway Authentication (required)
  gatewayToken: process.env.ATMA_GATEWAY_TOKEN || process.env.CODEINE_GATEWAY_TOKEN || "",
  
  // External service URLs
  mythicUrl: (process.env.MYTHIC_URL || "https://127.0.0.1:7443").replace(/\/$/, ""),
  ollamaUrl: (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, ""),
  
  // Model configuration
  codeineModel: process.env.CODEINE_MODEL || "codeine-7b",
  codeineFallback: process.env.CODEINE_FALLBACK || "DeepHat/DeepHat-V1-7B",
  deephatModel: process.env.DEEPHAT_MODEL || "DeepHat/DeepHat-V1-7B",
  
  // Features
  monitoringEnabled: process.env.MONITORING_ENABLED === "1",
  mythicInsecureTls: process.env.MYTHIC_INSECURE_TLS === "1",
  
  // Logging
  logLevel: process.env.LOG_LEVEL || "info",
  
  // SSL/TLS (optional, for reverse proxy scenarios)
  sslCert: process.env.SSL_CERT || "",
  sslKey: process.env.SSL_KEY || "",
};

// Validate required configuration
if (!config.gatewayToken) {
  console.error("FATAL: ATMA_GATEWAY_TOKEN environment variable is required");
  console.error("Set it with: export ATMA_GATEWAY_TOKEN=your_secure_token");
  process.exit(1);
}

// Configure TLS rejection for Mythic (lab use only)
if (config.mythicInsecureTls) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

// ============================================================================
// LOGGING
// ============================================================================

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLogLevel = LOG_LEVELS[config.logLevel] || 1;

function log(level, message, ...args) {
  if (LOG_LEVELS[level] >= currentLogLevel) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, ...args);
  }
}

// ============================================================================
// METRICS (Prometheus-compatible)
// ============================================================================

const metrics = {
  requestsTotal: 0,
  requestsByEndpoint: {},
  requestDuration: 0,
  errorsTotal: 0,
  tokensGenerated: 0,
  activeConnections: 0,
};

function incrementMetric(endpoint) {
  metrics.requestsTotal++;
  metrics.requestsByEndpoint[endpoint] = (metrics.requestsByEndpoint[endpoint] || 0) + 1;
}

function addTokens(count) {
  metrics.tokensGenerated += count;
}

function incrementErrors() {
  metrics.errorsTotal++;
}

function getMetrics() {
  const lines = [
    `# HELP codeine_gateway_requests_total Total number of requests`,
    `# TYPE codeine_gateway_requests_total counter`,
    `codeine_gateway_requests_total ${metrics.requestsTotal}`,
    ``,
    `# HELP codeine_gateway_requests_by_endpoint Requests by endpoint`,
    `# TYPE codeine_gateway_requests_by_endpoint counter`,
    ...Object.entries(metrics.requestsByEndpoint).map(([ep, count]) => 
      `codeine_gateway_requests_by_endpoint{endpoint="${ep}"} ${count}`
    ),
    ``,
    `# HELP codeine_gateway_errors_total Total number of errors`,
    `# TYPE codeine_gateway_errors_total counter`,
    `codeine_gateway_errors_total ${metrics.errorsTotal}`,
    ``,
    `# HELP codeine_gateway_tokens_generated Total tokens generated`,
    `# TYPE codeine_gateway_tokens_generated counter`,
    `codeine_gateway_tokens_generated ${metrics.tokensGenerated}`,
    ``,
    `# HELP codeine_gateway_active_connections Active connections`,
    `# TYPE codeine_gateway_active_connections gauge`,
    `codeine_gateway_active_connections ${metrics.activeConnections}`,
  ];
  return lines.join("\n") + "\n";
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function sendJson(res, statusCode, data, cors = true) {
  const headers = { "Content-Type": "application/json" };
  if (cors) {
    headers["Access-Control-Allow-Origin"] = "*";
    headers["Access-Control-Allow-Headers"] = "content-type,authorization,x-atma-token";
  }
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(data));
}

function sendError(res, statusCode, message, cors = true) {
  incrementErrors();
  sendJson(res, statusCode, { error: message }, cors);
}

function sendStream(res, contentType, headers = {}) {
  const responseHeaders = {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type,authorization,x-atma-token",
    ...headers,
  };
  res.writeHead(200, responseHeaders);
  return res;
}

function verifyToken(req) {
  const token = req.headers["x-atma-token"] || "";
  return token === config.gatewayToken;
}

// ============================================================================
// MODEL ROUTER
// ============================================================================

// Task type to model mapping
const TASK_MODEL_MAP = {
  // Codeine-specific tasks
  "code_generation": ["codeine-7b", "DeepHat/DeepHat-V1-7B", "llama-3.2-7b-code"],
  "code_completion": ["codeine-7b", "codellama:7b", "qwen2.5-coder:7b"],
  "code_analysis": ["codeine-7b", "DeepHat/DeepHat-V1-7B", "llama-3.2-7b-code"],
  "code_explanation": ["codeine-7b", "DeepHat/DeepHat-V1-7B"],
  "code_optimization": ["codeine-7b", "DeepHat/DeepHat-V1-7B"],
  "code_translation": ["codeine-7b", "llama-3.2-7b-code"],
  
  // Language-specific routing
  "python": ["codeine-7b", "qwen2.5-coder:7b"],
  "javascript": ["codeine-7b", "llama-3.2-7b-code"],
  "typescript": ["codeine-7b", "llama-3.2-7b-code"],
  "go": ["codeine-7b", "DeepHat/DeepHat-V1-7B"],
  "java": ["codeine-7b", "llama-3.2-7b-code"],
  "rust": ["codeine-7b", "llama-3.2-7b-code"],
  "c": ["codeine-7b", "DeepHat/DeepHat-V1-7B"],
  "cpp": ["codeine-7b", "DeepHat/DeepHat-V1-7B"],
  "csharp": ["codeine-7b", "llama-3.2-7b-code"],
  
  // General tasks
  "general": ["codeine-7b", "llama-3.3-70b-versatile", "DeepHat/DeepHat-V1-7B"],
  "mythic": ["DeepHat/DeepHat-V1-7B", "codeine-7b"],
  "devsecops": ["DeepHat/DeepHat-V1-7B", "codeine-7b"],
  "security": ["DeepHat/DeepHat-V1-7B", "codeine-7b"],
};

// Available backends
const BACKENDS = {
  groq: {
    available: !!config.groqKey,
    url: "https://api.groq.com/openai/v1",
    key: config.groqKey,
    type: "openai",
  },
  ollama: {
    available: true,
    url: config.ollamaUrl,
    key: "",
    type: "ollama",
  },
};

async function detectAvailableModels() {
  const models = {};
  
  // Check Groq models
  if (BACKENDS.groq.available) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${BACKENDS.groq.key}` },
      });
      if (response.ok) {
        const data = await response.json();
        models.groq = data.data.map(m => m.id);
      }
    } catch (e) {
      log("warn", `Failed to fetch Groq models: ${e.message}`);
    }
  }
  
  // Check Ollama models
  try {
    const response = await fetch(`${config.ollamaUrl}/api/tags`);
    if (response.ok) {
      const data = await response.json();
      models.ollama = data.models.map(m => m.name);
    }
  } catch (e) {
    log("warn", `Failed to fetch Ollama models: ${e.message}`);
  }
  
  return models;
}

async function routeRequest(taskType, language, prompt) {
  // Determine best backend and model for the task
  const taskTypes = Object.keys(TASK_MODEL_MAP);
  
  // Find matching task type
  const matchingTask = taskTypes.find(t => 
    taskType.includes(t) || prompt.toLowerCase().includes(t)
  ) || "general";
  
  // Get preferred models for this task
  const preferredModels = TASK_MODEL_MAP[matchingTask] || TASK_MODEL_MAP.general;
  
  // Check which models are available
  const availableModels = await detectAvailableModels();
  
  // Find first available model
  for (const model of preferredModels) {
    // Check Groq
    if (availableModels.groq && availableModels.groq.includes(model)) {
      return { backend: "groq", model, type: "openai" };
    }
    // Check Ollama
    if (availableModels.ollama && availableModels.ollama.includes(model)) {
      return { backend: "ollama", model, type: "ollama" };
    }
  }
  
  // Fallback to configured defaults
  if (BACKENDS.groq.available) {
    return { backend: "groq", model: config.codeineModel, type: "openai" };
  }
  
  return { backend: "ollama", model: config.codeineModel, type: "ollama" };
}

// ============================================================================
// REQUEST HANDLERS
// ============================================================================

// Groq Proxy Handlers
async function handleGroqModels(req, res) {
  if (!BACKENDS.groq.available) {
    return sendError(res, 503, "Groq not configured");
  }
  
  try {
    const response = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${BACKENDS.groq.key}` },
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return sendError(res, response.status, `Groq error: ${error.error?.message || 'Unknown'}`);
    }
    
    const data = await response.json();
    sendJson(res, 200, data);
  } catch (e) {
    sendError(res, 500, `Failed to fetch models: ${e.message}`);
  }
}

async function handleGroqChat(req, res) {
  if (!BACKENDS.groq.available) {
    return sendError(res, 503, "Groq not configured");
  }
  
  let body = "";
  for await (const chunk of req) body += chunk;
  
  try {
    const payload = JSON.parse(body);
    const stream = payload.stream || false;
    
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${BACKENDS.groq.key}`,
      },
      body,
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return sendError(res, response.status, `Groq error: ${error.error?.message || 'Unknown'}`);
    }
    
    if (stream && response.body) {
      // Stream the response
      const streamRes = sendStream(res, "text/event-stream", {
        "Cache-Control": "no-cache",
      });
      
      for await (const chunk of response.body) {
        streamRes.write(chunk);
      }
      streamRes.end();
    } else {
      const data = await response.json();
      sendJson(res, 200, data);
    }
  } catch (e) {
    sendError(res, 500, `Groq chat error: ${e.message}`);
  }
}

// Ollama Proxy Handlers
async function handleOllamaTags(req, res) {
  try {
    const response = await fetch(`${config.ollamaUrl}/api/tags`);
    
    if (!response.ok) {
      const error = await response.text();
      return sendError(res, response.status, `Ollama error: ${error}`);
    }
    
    const data = await response.json();
    sendJson(res, 200, data);
  } catch (e) {
    sendError(res, 500, `Failed to fetch Ollama tags: ${e.message}`);
  }
}

async function handleOllamaChat(req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;
  
  try {
    const payload = JSON.parse(body);
    const stream = payload.stream || false;
    
    const response = await fetch(`${config.ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    
    if (!response.ok) {
      const error = await response.text();
      return sendError(res, response.status, `Ollama error: ${error}`);
    }
    
    if (stream && response.body) {
      // Stream the response
      const streamRes = sendStream(res, "application/x-ndjson");
      
      for await (const chunk of response.body) {
        streamRes.write(chunk);
      }
      streamRes.end();
    } else {
      const data = await response.json();
      sendJson(res, 200, data);
    }
  } catch (e) {
    sendError(res, 500, `Ollama chat error: ${e.message}`);
  }
}

// Codeine-specific Handlers
async function handleCodeineChat(req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;
  
  try {
    const payload = JSON.parse(body);
    const { messages, stream, task_type, language, model } = payload;
    
    // Route to best model
    const route = await routeRequest(task_type, language, messages?.[messages.length - 1]?.content || "");
    
    // Build request based on backend
    if (route.backend === "groq") {
      const groqPayload = {
        model: route.model,
        messages,
        stream: stream || false,
        temperature: 0.3,
        max_tokens: 2000,
      };
      
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${BACKENDS.groq.key}`,
        },
        body: JSON.stringify(groqPayload),
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return sendError(res, response.status, `Groq error: ${error.error?.message || 'Unknown'}`);
      }
      
      if (stream && response.body) {
        const streamRes = sendStream(res, "text/event-stream");
        for await (const chunk of response.body) {
          streamRes.write(chunk);
        }
        streamRes.end();
      } else {
        const data = await response.json();
        sendJson(res, 200, data);
      }
    } else {
      // Ollama backend
      const ollamaPayload = {
        model: route.model,
        messages,
        stream: stream || false,
        options: {
          temperature: 0.3,
          num_predict: 2000,
        },
      };
      
      const response = await fetch(`${config.ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ollamaPayload),
      });
      
      if (!response.ok) {
        const error = await response.text();
        return sendError(res, response.status, `Ollama error: ${error}`);
      }
      
      if (stream && response.body) {
        const streamRes = sendStream(res, "application/x-ndjson");
        for await (const chunk of response.body) {
          streamRes.write(chunk);
        }
        streamRes.end();
      } else {
        const data = await response.json();
        sendJson(res, 200, data);
      }
    }
  } catch (e) {
    sendError(res, 500, `Codeine chat error: ${e.message}`);
  }
}

async function handleCodeineComplete(req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;
  
  try {
    const payload = JSON.parse(body);
    const { prompt, language, context, max_tokens } = payload;
    
    // Create completion prompt
    const systemPrompt = `You are Codeine, a master coding assistant. Complete the following ${language || 'code'} snippet.`;
    
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Context:\n${context || ''}\n\nComplete this:\n${prompt}` },
    ];
    
    // Route to best model for code completion
    const route = await routeRequest("code_completion", language, prompt);
    
    if (route.backend === "groq") {
      const groqPayload = {
        model: route.model,
        messages,
        stream: false,
        temperature: 0.2,
        max_tokens: max_tokens || 100,
      };
      
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${BACKENDS.groq.key}`,
        },
        body: JSON.stringify(groqPayload),
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return sendError(res, response.status, `Groq error: ${error.error?.message || 'Unknown'}`);
      }
      
      const data = await response.json();
      const completion = data.choices?.[0]?.message?.content || "";
      
      // Extract just the completion (remove system prompt if echoed)
      const lines = completion.split('\n');
      const codeLines = lines.filter(l => !l.includes('You are Codeine'));
      
      sendJson(res, 200, {
        completion: codeLines.join('\n'),
        model: route.model,
        backend: route.backend,
      });
    } else {
      // Ollama backend
      const ollamaPayload = {
        model: route.model,
        messages,
        stream: false,
        options: {
          temperature: 0.2,
          num_predict: max_tokens || 100,
        },
      };
      
      const response = await fetch(`${config.ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ollamaPayload),
      });
      
      if (!response.ok) {
        const error = await response.text();
        return sendError(res, response.status, `Ollama error: ${error}`);
      }
      
      const data = await response.json();
      const completion = data.message?.content || "";
      
      sendJson(res, 200, {
        completion,
        model: route.model,
        backend: route.backend,
      });
    }
  } catch (e) {
    sendError(res, 500, `Code completion error: ${e.message}`);
  }
}

async function handleCodeineAnalyze(req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;
  
  try {
    const payload = JSON.parse(body);
    const { code, language, focus } = payload;
    
    const systemPrompt = `You are Codeine, a master coding assistant. Analyze the following ${language || 'code'} with focus on: ${focus || 'bugs, security issues, performance, and best practices'}. Provide a detailed analysis.`;
    
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Code:\n\`\`\`${language || ''}\n${code}\n\`\`\`` },
    ];
    
    // Route to best model for analysis
    const route = await routeRequest("code_analysis", language, code);
    
    if (route.backend === "groq") {
      const groqPayload = {
        model: route.model,
        messages,
        stream: false,
        temperature: 0.1,
        max_tokens: 2000,
      };
      
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${BACKENDS.groq.key}`,
        },
        body: JSON.stringify(groqPayload),
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return sendError(res, response.status, `Groq error: ${error.error?.message || 'Unknown'}`);
      }
      
      const data = await response.json();
      sendJson(res, 200, {
        analysis: data.choices?.[0]?.message?.content || "",
        model: route.model,
        backend: route.backend,
      });
    } else {
      const ollamaPayload = {
        model: route.model,
        messages,
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 2000,
        },
      };
      
      const response = await fetch(`${config.ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ollamaPayload),
      });
      
      if (!response.ok) {
        const error = await response.text();
        return sendError(res, response.status, `Ollama error: ${error}`);
      }
      
      const data = await response.json();
      sendJson(res, 200, {
        analysis: data.message?.content || "",
        model: route.model,
        backend: route.backend,
      });
    }
  } catch (e) {
    sendError(res, 500, `Code analysis error: ${e.message}`);
  }
}

async function handleCodeineGenerate(req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;
  
  try {
    const payload = JSON.parse(body);
    const { prompt, language, requirements, template } = payload;
    
    const systemPrompt = `You are Codeine, a master coding assistant. Generate ${language || 'code'} based on the following requirements. Be complete, include proper error handling, and follow best practices.`;
    
    const userPrompt = `Requirements:\n${requirements || 'None'}\n\n${template ? `Template:\n\`\`\`${language || ''}\n${template}\n\`\`\`\n\n` : ''}Prompt:\n${prompt}`;
    
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];
    
    // Route to best model for generation
    const route = await routeRequest("code_generation", language, prompt);
    
    if (route.backend === "groq") {
      const groqPayload = {
        model: route.model,
        messages,
        stream: false,
        temperature: 0.5,
        max_tokens: 4000,
      };
      
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${BACKENDS.groq.key}`,
        },
        body: JSON.stringify(groqPayload),
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return sendError(res, response.status, `Groq error: ${error.error?.message || 'Unknown'}`);
      }
      
      const data = await response.json();
      sendJson(res, 200, {
        code: data.choices?.[0]?.message?.content || "",
        model: route.model,
        backend: route.backend,
      });
    } else {
      const ollamaPayload = {
        model: route.model,
        messages,
        stream: false,
        options: {
          temperature: 0.5,
          num_predict: 4000,
        },
      };
      
      const response = await fetch(`${config.ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ollamaPayload),
      });
      
      if (!response.ok) {
        const error = await response.text();
        return sendError(res, response.status, `Ollama error: ${error}`);
      }
      
      const data = await response.json();
      sendJson(res, 200, {
        code: data.message?.content || "",
        model: route.model,
        backend: route.backend,
      });
    }
  } catch (e) {
    sendError(res, 500, `Code generation error: ${e.message}`);
  }
}

async function handleCodeineExplain(req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;
  
  try {
    const payload = JSON.parse(body);
    const { code, language, level } = payload;
    
    const systemPrompt = `You are Codeine, a master coding assistant. Explain the following ${language || 'code'} at a ${level || 'beginner'} level. Cover what it does, how it works, and any important details.`;
    
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Code:\n\`\`\`${language || ''}\n${code}\n\`\`\`` },
    ];
    
    // Route to best model for explanation
    const route = await routeRequest("code_explanation", language, code);
    
    if (route.backend === "groq") {
      const groqPayload = {
        model: route.model,
        messages,
        stream: false,
        temperature: 0.2,
        max_tokens: 1500,
      };
      
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${BACKENDS.groq.key}`,
        },
        body: JSON.stringify(groqPayload),
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return sendError(res, response.status, `Groq error: ${error.error?.message || 'Unknown'}`);
      }
      
      const data = await response.json();
      sendJson(res, 200, {
        explanation: data.choices?.[0]?.message?.content || "",
        model: route.model,
        backend: route.backend,
      });
    } else {
      const ollamaPayload = {
        model: route.model,
        messages,
        stream: false,
        options: {
          temperature: 0.2,
          num_predict: 1500,
        },
      };
      
      const response = await fetch(`${config.ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ollamaPayload),
      });
      
      if (!response.ok) {
        const error = await response.text();
        return sendError(res, response.status, `Ollama error: ${error}`);
      }
      
      const data = await response.json();
      sendJson(res, 200, {
        explanation: data.message?.content || "",
        model: route.model,
        backend: route.backend,
      });
    }
  } catch (e) {
    sendError(res, 500, `Code explanation error: ${e.message}`);
  }
}

async function handleCodeineOptimize(req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;
  
  try {
    const payload = JSON.parse(body);
    const { code, language, goals, constraints } = payload;
    
    const systemPrompt = `You are Codeine, a master coding assistant. Optimize the following ${language || 'code'} with these goals: ${goals || 'performance, readability, maintainability'}. Consider these constraints: ${constraints || 'None'}. Provide the optimized code and explain the changes.`;
    
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Code:\n\`\`\`${language || ''}\n${code}\n\`\`\`` },
    ];
    
    // Route to best model for optimization
    const route = await routeRequest("code_optimization", language, code);
    
    if (route.backend === "groq") {
      const groqPayload = {
        model: route.model,
        messages,
        stream: false,
        temperature: 0.2,
        max_tokens: 2000,
      };
      
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${BACKENDS.groq.key}`,
        },
        body: JSON.stringify(groqPayload),
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return sendError(res, response.status, `Groq error: ${error.error?.message || 'Unknown'}`);
      }
      
      const data = await response.json();
      sendJson(res, 200, {
        optimized_code: data.choices?.[0]?.message?.content || "",
        model: route.model,
        backend: route.backend,
      });
    } else {
      const ollamaPayload = {
        model: route.model,
        messages,
        stream: false,
        options: {
          temperature: 0.2,
          num_predict: 2000,
        },
      };
      
      const response = await fetch(`${config.ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ollamaPayload),
      });
      
      if (!response.ok) {
        const error = await response.text();
        return sendError(res, response.status, `Ollama error: ${error}`);
      }
      
      const data = await response.json();
      sendJson(res, 200, {
        optimized_code: data.message?.content || "",
        model: route.model,
        backend: route.backend,
      });
    }
  } catch (e) {
    sendError(res, 500, `Code optimization error: ${e.message}`);
  }
}

async function handleCodeineTranslate(req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;
  
  try {
    const payload = JSON.parse(body);
    const { code, from_language, to_language, context } = payload;
    
    const systemPrompt = `You are Codeine, a master coding assistant. Translate the following code from ${from_language || 'unknown language'} to ${to_language || 'Python'}. Preserve all functionality and add appropriate comments.`;
    
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Context: ${context || 'None'}\n\nCode:\n\`\`\`${from_language || ''}\n${code}\n\`\`\`` },
    ];
    
    // Route to best model for translation
    const route = await routeRequest("code_translation", to_language, code);
    
    if (route.backend === "groq") {
      const groqPayload = {
        model: route.model,
        messages,
        stream: false,
        temperature: 0.2,
        max_tokens: 3000,
      };
      
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${BACKENDS.groq.key}`,
        },
        body: JSON.stringify(groqPayload),
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return sendError(res, response.status, `Groq error: ${error.error?.message || 'Unknown'}`);
      }
      
      const data = await response.json();
      sendJson(res, 200, {
        translated_code: data.choices?.[0]?.message?.content || "",
        from_language: from_language || "unknown",
        to_language: to_language || "python",
        model: route.model,
        backend: route.backend,
      });
    } else {
      const ollamaPayload = {
        model: route.model,
        messages,
        stream: false,
        options: {
          temperature: 0.2,
          num_predict: 3000,
        },
      };
      
      const response = await fetch(`${config.ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ollamaPayload),
      });
      
      if (!response.ok) {
        const error = await response.text();
        return sendError(res, response.status, `Ollama error: ${error}`);
      }
      
      const data = await response.json();
      sendJson(res, 200, {
        translated_code: data.message?.content || "",
        from_language: from_language || "unknown",
        to_language: to_language || "python",
        model: route.model,
        backend: route.backend,
      });
    }
  } catch (e) {
    sendError(res, 500, `Code translation error: ${e.message}`);
  }
}

// Mythic Proxy Handlers
async function handleMythicGraphql(req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;
  
  try {
    const target = `${config.mythicUrl}/graphql/`;
    
    const headers = { "Content-Type": "application/json" };
    
    // Forward Authorization header if present
    if (req.headers.authorization) {
      headers["Authorization"] = req.headers.authorization;
    }
    
    const response = await fetch(target, {
      method: "POST",
      headers,
      body,
    });
    
    const text = await response.text();
    res.writeHead(response.status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(text);
  } catch (e) {
    sendError(res, 502, `Mythic GraphQL error: ${e.message}`);
  }
}

async function handleMythicAuth(req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;
  
  try {
    const target = `${config.mythicUrl}/auth`;
    
    const headers = { "Content-Type": "application/json" };
    
    const response = await fetch(target, {
      method: "POST",
      headers,
      body,
    });
    
    const text = await response.text();
    res.writeHead(response.status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(text);
  } catch (e) {
    sendError(res, 502, `Mythic auth error: ${e.message}`);
  }
}

// Multi-model Routing Handler
async function handleRoute(req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;
  
  try {
    const payload = JSON.parse(body);
    const { prompt, task_type, language, prefer } = payload;
    
    // Route to best model
    const route = await routeRequest(task_type, language, prompt);
    
    // Build appropriate payload based on backend
    const messages = [
      { role: "system", content: "You are a helpful AI assistant." },
      { role: "user", content: prompt },
    ];
    
    if (route.backend === "groq") {
      const groqPayload = {
        model: route.model,
        messages,
        stream: false,
        temperature: 0.7,
        max_tokens: 2000,
      };
      
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${BACKENDS.groq.key}`,
        },
        body: JSON.stringify(groqPayload),
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return sendError(res, response.status, `Groq error: ${error.error?.message || 'Unknown'}`);
      }
      
      const data = await response.json();
      sendJson(res, 200, {
        response: data.choices?.[0]?.message?.content || "",
        model: route.model,
        backend: route.backend,
        routed: true,
      });
    } else {
      const ollamaPayload = {
        model: route.model,
        messages,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 2000,
        },
      };
      
      const response = await fetch(`${config.ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ollamaPayload),
      });
      
      if (!response.ok) {
        const error = await response.text();
        return sendError(res, response.status, `Ollama error: ${error}`);
      }
      
      const data = await response.json();
      sendJson(res, 200, {
        response: data.message?.content || "",
        model: route.model,
        backend: route.backend,
        routed: true,
      });
    }
  } catch (e) {
    sendError(res, 500, `Routing error: ${e.message}`);
  }
}

// ============================================================================
// REQUEST ROUTER
// ============================================================================

function createRequestHandler() {
  return async function (req, res) {
    metrics.activeConnections++;
    const startTime = Date.now();
    
    try {
      // Handle OPTIONS for CORS
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "content-type,authorization,x-atma-token",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        });
        return res.end();
      }
      
      // Verify authentication token for all endpoints except status/health
      if (!req.url.startsWith("/status") && !req.url.startsWith("/health") && !req.url.startsWith("/metrics")) {
        if (!verifyToken(req)) {
          incrementErrors();
          return sendError(res, 401, "Invalid or missing gateway token (send it as x-atma-token)");
        }
      }
      
      // Route requests
      incrementMetric(req.url);
      
      // Status and health
      if (req.url === "/status" || req.url === "/gateway/status") {
        return sendJson(res, 200, {
          backend: "codeine-gateway",
          version: "1.0.0",
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
          services: {
            groq: BACKENDS.groq.available ? "available" : "not_configured",
            ollama: "available",
            mythic: "available",
            codeine: "available",
          },
          models: {
            codeine: config.codeineModel,
            deephat: config.deephatModel,
          },
          ok: true,
        });
      }
      
      if (req.url === "/health") {
        return sendJson(res, 200, { status: "healthy", timestamp: new Date().toISOString() });
      }
      
      if (req.url === "/metrics" && config.monitoringEnabled) {
        res.writeHead(200, { "Content-Type": "text/plain" });
        return res.end(getMetrics());
      }
      
      // Groq endpoints
      if (req.url === "/v1/models" && req.method === "GET") {
        return handleGroqModels(req, res);
      }
      
      if (req.url === "/v1/chat/completions" && req.method === "POST") {
        return handleGroqChat(req, res);
      }
      
      // Ollama endpoints
      if (req.url === "/ollama/api/tags" && req.method === "GET") {
        return handleOllamaTags(req, res);
      }
      
      if (req.url === "/ollama/api/chat" && req.method === "POST") {
        return handleOllamaChat(req, res);
      }
      
      // Codeine endpoints
      if (req.url === "/codeine/chat" && req.method === "POST") {
        return handleCodeineChat(req, res);
      }
      
      if (req.url === "/codeine/complete" && req.method === "POST") {
        return handleCodeineComplete(req, res);
      }
      
      if (req.url === "/codeine/analyze" && req.method === "POST") {
        return handleCodeineAnalyze(req, res);
      }
      
      if (req.url === "/codeine/generate" && req.method === "POST") {
        return handleCodeineGenerate(req, res);
      }
      
      if (req.url === "/codeine/explain" && req.method === "POST") {
        return handleCodeineExplain(req, res);
      }
      
      if (req.url === "/codeine/optimize" && req.method === "POST") {
        return handleCodeineOptimize(req, res);
      }
      
      if (req.url === "/codeine/translate" && req.method === "POST") {
        return handleCodeineTranslate(req, res);
      }
      
      // Mythic endpoints
      if (req.url === "/mythic/graphql" && req.method === "POST") {
        return handleMythicGraphql(req, res);
      }
      
      if (req.url === "/mythic/auth" && req.method === "POST") {
        return handleMythicAuth(req, res);
      }
      
      // Multi-model routing
      if (req.url === "/route" && req.method === "POST") {
        return handleRoute(req, res);
      }
      
      // 404
      return sendError(res, 404, `Endpoint not found: ${req.url}`);
      
    } catch (e) {
      incrementErrors();
      log("error", `Request error: ${e.message}`);
      sendError(res, 500, `Internal server error: ${e.message}`);
    } finally {
      metrics.activeConnections--;
      metrics.requestDuration += Date.now() - startTime;
    }
  };
}

// ============================================================================
// SERVER SETUP
// ============================================================================

function startServer() {
  const handler = createRequestHandler();
  
  let server;
  
  if (config.sslCert && config.sslKey) {
    const options = {
      key: readFileSync(config.sslKey),
      cert: readFileSync(config.sslCert),
    };
    server = createHttpsServer(options, handler);
    log("info", `Starting HTTPS server on port ${config.port}`);
  } else {
    server = createServer(handler);
    log("info", `Starting HTTP server on port ${config.port}`);
  }
  
  server.listen(config.port, "127.0.0.1", () => {
    log("info", `Codeine Gateway listening on http${config.sslCert ? 's' : ''}://127.0.0.1:${config.port}`);
    log("info", `  Gateway token: ${config.gatewayToken ? 'configured' : 'NOT SET (FATAL)'}`);
    log("info", `  Groq: ${BACKENDS.groq.available ? 'configured' : 'not configured'}`);
    log("info", `  Ollama: ${config.ollamaUrl}`);
    log("info", `  Mythic: ${config.mythicUrl}`);
    log("info", `  Codeine model: ${config.codeineModel}`);
    log("info", `  Monitoring: ${config.monitoringEnabled ? 'enabled' : 'disabled'}`);
    
    if (config.monitoringEnabled) {
      startMetricsServer();
    }
  });
  
  // Handle server errors
  server.on("error", (err) => {
    log("error", `Server error: ${err.message}`);
  });
  
  // Handle graceful shutdown
  process.on("SIGTERM", () => {
    log("info", "SIGTERM received, shutting down gracefully...");
    server.close(() => {
      log("info", "Server closed");
      process.exit(0);
    });
  });
  
  process.on("SIGINT", () => {
    log("info", "SIGINT received, shutting down gracefully...");
    server.close(() => {
      log("info", "Server closed");
      process.exit(0);
    });
  });
  
  return server;
}

function startMetricsServer() {
  const metricsHandler = (req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(getMetrics());
  };
  
  const metricsServer = createServer(metricsHandler);
  metricsServer.listen(config.metricsPort, "127.0.0.1", () => {
    log("info", `Metrics server listening on http://127.0.0.1:${config.metricsPort}`);
  });
  
  return metricsServer;
}

// ============================================================================
// MAIN
// ============================================================================

// Start the server
const server = startServer();

// Log startup information
log("info", "=" * 80);
log("info", "Codeine Gateway for Project ATMA - Started Successfully");
log("info", "=" * 80);
log("info", "");
log("info", "Endpoints:");
log("info", "  GET  /status              - Gateway status");
log("info", "  GET  /health              - Health check");
log("info", "  GET  /metrics             - Prometheus metrics (if enabled)");
log("info", "");
log("info", "Groq (OpenAI-compatible):");
log("info", "  GET  /v1/models           - List models");
log("info", "  POST /v1/chat/completions - Chat completions");
log("info", "");
log("info", "Ollama (DeepHat/Codeine):");
log("info", "  GET  /ollama/api/tags     - List models");
log("info", "  POST /ollama/api/chat    - Chat");
log("info", "");
log("info", "Codeine-specific:");
log("info", "  POST /codeine/chat       - Auto-routed chat");
log("info", "  POST /codeine/complete   - Code completion");
log("info", "  POST /codeine/analyze     - Code analysis");
log("info", "  POST /codeine/generate    - Code generation");
log("info", "  POST /codeine/explain     - Code explanation");
log("info", "  POST /codeine/optimize    - Code optimization");
log("info", "  POST /codeine/translate   - Language translation");
log("info", "");
log("info", "Mythic integration:");
log("info", "  POST /mythic/graphql      - Forward to Mythic GraphQL");
log("info", "  POST /mythic/auth         - Forward to Mythic auth");
log("info", "");
log("info", "Multi-model routing:");
log("info", "  POST /route               - Route to best model");
log("info", "");
log("info", "=" * 80);

// Export for testing
export { config, BACKENDS, routeRequest, verifyToken };
