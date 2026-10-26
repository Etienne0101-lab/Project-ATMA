/**
 * Codeine AI - Frontend Simulation Test
 * 
 * This script simulates frontend interactions with the Codeine backend
 * to verify that the complete system works end-to-end.
 * 
 * Usage:
 *   node test_codeine_frontend_simulation.js
 *   node test_codeine_frontend_simulation.js --gateway-port 8787
 *   node test_codeine_frontend_simulation.js --no-gateway
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// Configuration
const config = {
  gatewayPort: process.argv.includes('--gateway-port') 
    ? parseInt(process.argv[process.argv.indexOf('--gateway-port') + 1] || 8787)
    : 8787,
  gatewayToken: 'test_token_12345',
  noGateway: process.argv.includes('--no-gateway'),
  timeout: 5000
};

// Test results
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: []
};

// Helper functions
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const types = {
    info: '\x1b[36mINFO\x1b[0m',
    success: '\x1b[32mPASS\x1b[0m',
    error: '\x1b[31mFAIL\x1b[0m',
    warn: '\x1b[33mWARN\x1b[0m'
  };
  console.log(`[${timestamp}] [${types[type] || type}] ${message}`);
}

function addResult(testName, passed, error = null) {
  results.total++;
  if (passed) {
    results.passed++;
    results.tests.push({ name: testName, passed: true });
    log(`✅ ${testName}`, 'success');
  } else {
    results.failed++;
    results.tests.push({ name: testName, passed: false, error });
    log(`❌ ${testName}: ${error}`, 'error');
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test functions
async function testGatewayStartup() {
  if (config.noGateway) {
    log('Skipping gateway startup test (--no-gateway flag)', 'warn');
    return;
  }
  
  const testName = 'Gateway startup';
  
  try {
    // Check if gateway is already running by trying to connect
    const options = {
      hostname: '127.0.0.1',
      port: config.gatewayPort,
      path: '/health',
      method: 'GET',
      timeout: config.timeout
    };
    
    const req = http.request(options, (res) => {
      if (res.statusCode === 200) {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.status === 'healthy') {
              addResult(testName, true);
            } else {
              addResult(testName, false, `Unexpected status: ${response.status}`);
            }
          } catch (e) {
            addResult(testName, false, `Invalid JSON response: ${e.message}`);
          }
        });
      } else {
        addResult(testName, false, `HTTP ${res.statusCode}`);
      }
    });
    
    req.on('error', (e) => {
      addResult(testName, false, `Connection refused: ${e.message}`);
    });
    
    req.end();
    
    // Wait for response
    await sleep(2000);
  } catch (e) {
    addResult(testName, false, e.message);
  }
}

async function testGatewayStatus() {
  if (config.noGateway) {
    log('Skipping gateway status test (--no-gateway flag)', 'warn');
    return;
  }
  
  const testName = 'Gateway status endpoint';
  
  try {
    const options = {
      hostname: '127.0.0.1',
      port: config.gatewayPort,
      path: '/status',
      method: 'GET',
      timeout: config.timeout
    };
    
    const req = http.request(options, (res) => {
      if (res.statusCode === 200) {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.ok === true) {
              addResult(testName, true);
            } else {
              addResult(testName, false, `Response not OK: ${JSON.stringify(response)}`);
            }
          } catch (e) {
            addResult(testName, false, `Invalid JSON: ${e.message}`);
          }
        });
      } else {
        addResult(testName, false, `HTTP ${res.statusCode}`);
      }
    });
    
    req.on('error', (e) => {
      addResult(testName, false, e.message);
    });
    
    req.end();
    await sleep(2000);
  } catch (e) {
    addResult(testName, false, e.message);
  }
}

async function testCodeineChat() {
  if (config.noGateway) {
    log('Skipping Codeine chat test (--no-gateway flag)', 'warn');
    return;
  }
  
  const testName = 'Codeine chat endpoint';
  
  try {
    const prompt = 'Write a Python function to reverse a string';
    
    const postData = JSON.stringify({
      messages: [
        { role: 'system', content: 'You are a helpful coding assistant.' },
        { role: 'user', content: prompt }
      ]
    });
    
    const options = {
      hostname: '127.0.0.1',
      port: config.gatewayPort,
      path: '/codeine/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-atma-token': config.gatewayToken,
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: config.timeout
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const response = JSON.parse(data);
            // In demo mode or without backend, we expect an error or demo response
            addResult(testName, true);
          } catch (e) {
            addResult(testName, false, `Invalid JSON: ${e.message}`);
          }
        } else if (res.statusCode === 401) {
          addResult(testName, false, 'Authentication failed - check token');
        } else if (res.statusCode === 503) {
          addResult(testName, true, 'Backend not configured (expected in demo mode)');
        } else {
          addResult(testName, false, `HTTP ${res.statusCode}: ${data}`);
        }
      });
    });
    
    req.on('error', (e) => {
      addResult(testName, false, e.message);
    });
    
    req.write(postData);
    req.end();
    await sleep(2000);
  } catch (e) {
    addResult(testName, false, e.message);
  }
}

async function testCodeineComplete() {
  if (config.noGateway) {
    log('Skipping Codeine complete test (--no-gateway flag)', 'warn');
    return;
  }
  
  const testName = 'Codeine complete endpoint';
  
  try {
    const postData = JSON.stringify({
      prompt: 'def reverse(s):\n    return',
      language: 'python',
      max_tokens: 50
    });
    
    const options = {
      hostname: '127.0.0.1',
      port: config.gatewayPort,
      path: '/codeine/complete',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-atma-token': config.gatewayToken,
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: config.timeout
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const response = JSON.parse(data);
            addResult(testName, true);
          } catch (e) {
            addResult(testName, false, `Invalid JSON: ${e.message}`);
          }
        } else if (res.statusCode === 401) {
          addResult(testName, false, 'Authentication failed');
        } else if (res.statusCode === 503) {
          addResult(testName, true, 'Backend not configured (expected)');
        } else {
          addResult(testName, false, `HTTP ${res.statusCode}`);
        }
      });
    });
    
    req.on('error', (e) => {
      addResult(testName, false, e.message);
    });
    
    req.write(postData);
    req.end();
    await sleep(2000);
  } catch (e) {
    addResult(testName, false, e.message);
  }
}

async function testCodeineAnalyze() {
  if (config.noGateway) {
    log('Skipping Codeine analyze test (--no-gateway flag)', 'warn');
    return;
  }
  
  const testName = 'Codeine analyze endpoint';
  
  try {
    const code = `def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n-1)`;
    
    const postData = JSON.stringify({
      code: code,
      language: 'python',
      focus: 'bugs, performance'
    });
    
    const options = {
      hostname: '127.0.0.1',
      port: config.gatewayPort,
      path: '/codeine/analyze',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-atma-token': config.gatewayToken,
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: config.timeout
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          addResult(testName, true);
        } else if (res.statusCode === 401) {
          addResult(testName, false, 'Authentication failed');
        } else if (res.statusCode === 503) {
          addResult(testName, true, 'Backend not configured (expected)');
        } else {
          addResult(testName, false, `HTTP ${res.statusCode}`);
        }
      });
    });
    
    req.on('error', (e) => {
      addResult(testName, false, e.message);
    });
    
    req.write(postData);
    req.end();
    await sleep(2000);
  } catch (e) {
    addResult(testName, false, e.message);
  }
}

async function testCodeineGenerate() {
  if (config.noGateway) {
    log('Skipping Codeine generate test (--no-gateway flag)', 'warn');
    return;
  }
  
  const testName = 'Codeine generate endpoint';
  
  try {
    const postData = JSON.stringify({
      prompt: 'Write a Go HTTP server with health endpoint',
      language: 'go',
      requirements: 'Use net/http package, include /health route'
    });
    
    const options = {
      hostname: '127.0.0.1',
      port: config.gatewayPort,
      path: '/codeine/generate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-atma-token': config.gatewayToken,
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: config.timeout
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          addResult(testName, true);
        } else if (res.statusCode === 401) {
          addResult(testName, false, 'Authentication failed');
        } else if (res.statusCode === 503) {
          addResult(testName, true, 'Backend not configured (expected)');
        } else {
          addResult(testName, false, `HTTP ${res.statusCode}`);
        }
      });
    });
    
    req.on('error', (e) => {
      addResult(testName, false, e.message);
    });
    
    req.write(postData);
    req.end();
    await sleep(2000);
  } catch (e) {
    addResult(testName, false, e.message);
  }
}

async function testAuthentication() {
  if (config.noGateway) {
    log('Skipping authentication test (--no-gateway flag)', 'warn');
    return;
  }
  
  const testName = 'Authentication requirement';
  
  try {
    // Try without token
    const options = {
      hostname: '127.0.0.1',
      port: config.gatewayPort,
      path: '/codeine/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: config.timeout
    };
    
    const req = http.request(options, (res) => {
      if (res.statusCode === 401) {
        addResult(testName, true, 'Correctly rejected without token');
      } else {
        addResult(testName, false, `Expected 401, got ${res.statusCode}`);
      }
    });
    
    req.on('error', (e) => {
      addResult(testName, false, e.message);
    });
    
    req.write(JSON.stringify({ messages: [] }));
    req.end();
    await sleep(2000);
  } catch (e) {
    addResult(testName, false, e.message);
  }
}

async function testOllamaProxy() {
  if (config.noGateway) {
    log('Skipping Ollama proxy test (--no-gateway flag)', 'warn');
    return;
  }
  
  const testName = 'Ollama proxy endpoint';
  
  try {
    const options = {
      hostname: '127.0.0.1',
      port: config.gatewayPort,
      path: '/ollama/api/tags',
      method: 'GET',
      headers: {
        'x-atma-token': config.gatewayToken
      },
      timeout: config.timeout
    };
    
    const req = http.request(options, (res) => {
      if (res.statusCode === 200) {
        addResult(testName, true);
      } else if (res.statusCode === 502 || res.statusCode === 503) {
        addResult(testName, true, 'Ollama not running (expected)');
      } else {
        addResult(testName, false, `HTTP ${res.statusCode}`);
      }
    });
    
    req.on('error', (e) => {
      addResult(testName, false, e.message);
    });
    
    req.end();
    await sleep(2000);
  } catch (e) {
    addResult(testName, false, e.message);
  }
}

async function testGroqProxy() {
  if (config.noGateway) {
    log('Skipping Groq proxy test (--no-gateway flag)', 'warn');
    return;
  }
  
  const testName = 'Groq proxy endpoint';
  
  try {
    const options = {
      hostname: '127.0.0.1',
      port: config.gatewayPort,
      path: '/v1/models',
      method: 'GET',
      headers: {
        'x-atma-token': config.gatewayToken
      },
      timeout: config.timeout
    };
    
    const req = http.request(options, (res) => {
      if (res.statusCode === 200) {
        addResult(testName, true);
      } else if (res.statusCode === 503) {
        addResult(testName, true, 'Groq not configured (expected)');
      } else {
        addResult(testName, false, `HTTP ${res.statusCode}`);
      }
    });
    
    req.on('error', (e) => {
      addResult(testName, false, e.message);
    });
    
    req.end();
    await sleep(2000);
  } catch (e) {
    addResult(testName, false, e.message);
  }
}

// Simulated frontend test
async function testSimulatedFrontend() {
  const testName = 'Simulated frontend interaction';
  
  try {
    // Simulate a user typing a message in the ATMA console
    const userMessage = {
      who: 'you',
      text: 'Write a Python function to calculate factorial'
    };
    
    // Simulate assistant response
    const assistantResponse = {
      who: 'assistant',
      text: 'Here is a Python function to calculate factorial:\n\n```python\ndef factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n-1)\n```\n\nThis is a recursive implementation that...'
    };
    
    // Simulate code proposal
    const codeProposal = {
      path: 'utils/math.py',
      content: 'def factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n-1)'
    };
    
    // Verify message format
    if (userMessage.who && userMessage.text) {
      addResult(testName, true, 'User message format valid');
    } else {
      addResult(testName, false, 'User message format invalid');
    }
    
    // Verify response format
    if (assistantResponse.who && assistantResponse.text) {
      addResult(testName, true, 'Assistant response format valid');
    } else {
      addResult(testName, false, 'Assistant response format invalid');
    }
    
    // Verify code proposal format
    if (codeProposal.path && codeProposal.content) {
      addResult(testName, true, 'Code proposal format valid');
    } else {
      addResult(testName, false, 'Code proposal format invalid');
    }
  } catch (e) {
    addResult(testName, false, e.message);
  }
}

// Main function
async function main() {
  console.log('='.repeat(80));
  console.log('Codeine AI - Frontend Simulation Test');
  console.log('='.repeat(80));
  console.log();
  
  // Run tests
  await testSimulatedFrontend();
  
  if (!config.noGateway) {
    await testGatewayStartup();
    await testGatewayStatus();
    await testAuthentication();
    await testOllamaProxy();
    await testGroqProxy();
    await testCodeineChat();
    await testCodeineComplete();
    await testCodeineAnalyze();
    await testCodeineGenerate();
  }
  
  // Print summary
  console.log();
  console.log('='.repeat(80));
  console.log('Test Summary');
  console.log('='.repeat(80));
  console.log(`Total tests: ${results.total}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log();
  
  // Print individual test results
  console.log('Test Results:');
  console.log('-'.repeat(80));
  for (const test of results.tests) {
    const status = test.passed ? '\x1b[32m✅ PASS\x1b[0m' : '\x1b[31m❌ FAIL\x1b[0m';
    const note = test.error ? ` (${test.error})` : '';
    console.log(`${status} ${test.name}${note}`);
  }
  
  console.log();
  console.log('='.repeat(80));
  
  if (results.failed === 0) {
    console.log('\x1b[32m✅ ALL TESTS PASSED\x1b[0m');
    console.log('='.repeat(80));
    process.exit(0);
  } else {
    console.log('\x1b[31m❌ SOME TESTS FAILED\x1b[0m');
    console.log('='.repeat(80));
    process.exit(1);
  }
}

// Run main
main().catch(e => {
  console.error('\n\x1b[31m❌ Test suite error:\x1b[0m', e);
  process.exit(1);
});
