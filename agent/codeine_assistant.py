#!/usr/bin/env python3
"""Project ATMA  Codeine AI Coding Assistant

A perfect clone combining DeepHat AI (DevSecOps) with Codeine AI (coding) capabilities.
This is a dedicated, production-ready coding assistant for Project ATMA that is:
- Multi-language proficient (Python, Go, JavaScript, C#, Java, Rust, etc.)
- Multi-method capable (functional, OOP, procedural, etc.)
- Multi-architecture aware (x86, ARM, WebAssembly, etc.)
- Integrated with existing ATMA infrastructure
- Compatible with all existing deployment modes (Ollama, Edge, Gateway)

Architecture:
    This assistant uses a hybrid approach:
    1. For local deployment: Runs through Ollama with fine-tuned Codeine models
    2. For edge deployment: Uses OpenAI-compatible endpoints (Groq, Featherless, etc.)
    3. For gateway deployment: Proxies through atma-gateway.mjs

Usage:
    # Local Ollama mode
    python agent/codeine_assistant.py "Write a Mythic agent in Go"
    
    # Edge API mode (Featherless, Groq, etc.)
    CODEINE_EDGE_URL=https://api.featherless.ai/v1 \
    CODEINE_EDGE_KEY=your_key \
    python agent/codeine_assistant.py "Explain the http C2 profile"
    
    # Gateway mode
    CODEINE_GATEWAY_URL=http://localhost:8787 \
    CODEINE_GATEWAY_TOKEN=your_token \
    python agent/codeine_assistant.py --gateway "Write a payload builder"
    
    # Interactive REPL mode
    python agent/codeine_assistant.py --interactive
    
    # With custom model
    python agent/codeine_assistant.py --model codeine-7b "Analyze this code"

Environment Variables:
    CODEINE_MODEL: Model to use (default: codeine-7b or DeepHat/DeepHat-V1-7B)
    CODEINE_EDGE_URL: Edge API endpoint URL
    CODEINE_EDGE_KEY: Edge API key
    CODEINE_GATEWAY_URL: Gateway URL for proxy mode
    CODEINE_GATEWAY_TOKEN: Gateway authentication token
    OLLAMA_HOST: Ollama server host (default: http://localhost:11434)
    GROQ_API_KEY: Groq API key (for Groq edge mode)

Security:
    - API keys are NEVER printed, logged, or committed
    - All keys are read from environment variables only
    - Keys are sent only to their intended endpoints
    - Gateway mode keeps keys on the host, not in browser
"""

import argparse
import asyncio
import json
import os
import sys
import aiohttp
from typing import Optional, Dict, Any, List, AsyncGenerator
from dataclasses import dataclass, field
from enum import Enum


class BackendType(Enum):
    """Supported backend types for Codeine assistant"""
    OLLAMA = "ollama"
    EDGE = "edge"
    GATEWAY = "gateway"
    DEMO = "demo"


@dataclass
class BackendConfig:
    """Configuration for a backend"""
    backend_type: BackendType
    url: str
    api_key: str
    model: str
    headers: Dict[str, str] = field(default_factory=dict)


@dataclass 
class CodeineResponse:
    """Response from Codeine assistant"""
    content: str
    model: str
    backend: str
    source: str
    usage: Optional[Dict[str, int]] = None
    finish_reason: Optional[str] = None


# Default models for different backends
DEFAULT_MODELS = {
    BackendType.OLLAMA: "codeine-7b",
    BackendType.EDGE: "codeine-7b",
    BackendType.GATEWAY: "codeine-7b",
}

# Fallback models
FALLBACK_MODELS = {
    BackendType.OLLAMA: ["DeepHat/DeepHat-V1-7B", "codellama:7b", "qwen2.5-coder:7b"],
    BackendType.EDGE: ["codeine-7b", "DeepHat/DeepHat-V1-7B", "llama-3.2-7b-code"],
}


class CodeineAssistant:
    """Main Codeine assistant class"""
    
    def __init__(
        self,
        backend: BackendType = BackendType.OLLAMA,
        model: Optional[str] = None,
        url: Optional[str] = None,
        api_key: Optional[str] = None,
        gateway_token: Optional[str] = None,
        system_prompt: Optional[str] = None,
        timeout: int = 120,
        max_tokens: int = 2000,
        temperature: float = 0.3,
    ):
        """Initialize Codeine assistant
        
        Args:
            backend: Backend type to use
            model: Model to use (defaults based on backend)
            url: API endpoint URL
            api_key: API key for authentication
            gateway_token: Token for gateway authentication
            system_prompt: Custom system prompt
            timeout: Request timeout in seconds
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
        """
        self.backend = backend
        self.model = model or DEFAULT_MODELS.get(backend, "codeine-7b")
        self.url = url or self._get_default_url(backend)
        self.api_key = api_key or ""
        self.gateway_token = gateway_token or ""
        self.system_prompt = system_prompt or self._get_system_prompt()
        self.timeout = timeout
        self.max_tokens = max_tokens
        self.temperature = temperature
        
    def _get_default_url(self, backend: BackendType) -> str:
        """Get default URL for backend type"""
        urls = {
            BackendType.OLLAMA: os.environ.get("OLLAMA_HOST", "http://localhost:11434"),
            BackendType.EDGE: os.environ.get("CODEINE_EDGE_URL", "https://api.groq.com/openai/v1"),
            BackendType.GATEWAY: os.environ.get("CODEINE_GATEWAY_URL", "http://localhost:8787"),
        }
        return urls.get(backend, "")
    
    def _get_system_prompt(self) -> str:
        """Get system prompt for Codeine assistant"""
        return (
            "You are Codeine, a master coding assistant for Project ATMA, a Mythic red-team platform. "
            "You are proficient in ALL programming languages, methods, and architectures. "
            "Your expertise includes but is not limited to: Python, Go, JavaScript/TypeScript, "
            "C#, Java, Rust, C/C++, Bash, PowerShell, and WebAssembly."
            "\n\n"
            "You understand and can work with any paradigm: "
            "functional programming, object-oriented programming, procedural programming, "
            "concurrent/parallel programming, distributed systems, and low-level systems programming."
            "\n\n"
            "You are also a DevSecOps expert, understanding Mythic architecture, "
            "C2 profiles, payload development, and red-team operations. "
            "\n\n"
            "When asked to write code:"
            "- Always provide complete, working examples"
            "- Include proper error handling"
            "- Add relevant comments and documentation"
            "- Follow best practices for the language"
            "- Consider security implications"
            "- Optimize for performance when appropriate"
            "\n\n"
            "When asked to analyze code:"
            "- Explain the functionality clearly"
            "- Identify potential bugs or issues"
            "- Suggest improvements"
            "- Analyze security implications"
            "- Provide time/space complexity analysis"
            "\n\n"
            "When asked to design systems:"
            "- Provide architectural diagrams in ASCII or Mermaid"
            "- Explain trade-offs between different approaches"
            "- Consider scalability, reliability, and maintainability"
            "- Address security concerns"
            "\n\n"
            "IMPORTANT: Only provide code and advice for systems the user owns or "
            "is explicitly authorized to test. Never provide code for malicious purposes. "
            "Always prioritize ethical and legal use of technology."
            "\n\n"
            "When providing file modifications, use the format:"
            "```atma-edit:path/to/file\n<full file content>\n```"
            "This allows the ATMA console to display it as an editable proposal."
        )
    
    def _get_ollama_models(self) -> List[str]:
        """Get list of available models from Ollama"""
        try:
            import ollama
            response = ollama.list()
            return [m['name'] for m in response.get('models', [])]
        except Exception:
            return []
    
    async def _check_ollama_model(self, model: str) -> bool:
        """Check if model is available in Ollama"""
        try:
            async with aiohttp.ClientSession() as session:
                url = f"{self.url}/api/tags"
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=self.timeout)) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        models = data.get('models', [])
                        return any(m.get('name') == model for m in models)
        except Exception:
            pass
        return False
    
    def _get_ollama_config(self) -> BackendConfig:
        """Get configuration for Ollama backend"""
        url = self.url.rstrip('/') + "/api/chat"
        return BackendConfig(
            backend_type=BackendType.OLLAMA,
            url=url,
            api_key="",
            model=self.model,
            headers={"Content-Type": "application/json"}
        )
    
    def _get_edge_config(self) -> BackendConfig:
        """Get configuration for Edge backend"""
        url = self.url.rstrip('/') + "/chat/completions"
        return BackendConfig(
            backend_type=BackendType.EDGE,
            url=url,
            api_key=self.api_key,
            model=self.model,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}" if self.api_key else ""
            }
        )
    
    def _get_gateway_config(self) -> BackendConfig:
        """Get configuration for Gateway backend"""
        url = self.url.rstrip('/') + "/ollama/api/chat"
        return BackendConfig(
            backend_type=BackendType.GATEWAY,
            url=url,
            api_key=self.gateway_token,
            model=self.model,
            headers={
                "Content-Type": "application/json",
                "x-atma-token": self.gateway_token
            }
        )
    
    def get_config(self) -> BackendConfig:
        """Get backend configuration based on type"""
        configs = {
            BackendType.OLLAMA: self._get_ollama_config,
            BackendType.EDGE: self._get_edge_config,
            BackendType.GATEWAY: self._get_gateway_config,
        }
        return configs.get(self.backend, self._get_ollama_config)()
    
    async def _try_model_fallback(self, original_model: str) -> str:
        """Try fallback models if original is not available"""
        if self.backend == BackendType.OLLAMA:
            available = await self._check_ollama_model(original_model)
            if available:
                return original_model
            for fallback in FALLBACK_MODELS.get(self.backend, []):
                if await self._check_ollama_model(fallback):
                    return fallback
        return original_model
    
    def _build_messages(self, prompt: str, history: Optional[List[Dict[str, str]]] = None) -> List[Dict[str, str]]:
        """Build messages array for API request"""
        messages = [{"role": "system", "content": self.system_prompt}]
        
        if history:
            for msg in history[-10:]:  # Keep last 10 messages for context
                role = "user" if msg.get("who") == "you" else "assistant"
                messages.append({"role": role, "content": msg.get("text", "")})
        
        messages.append({"role": "user", "content": prompt})
        return messages
    
    async def _ollama_request(
        self,
        messages: List[Dict[str, str]],
        stream: bool = False
    ) -> AsyncGenerator[str, None]:
        """Make request to Ollama API"""
        try:
            import ollama
            
            # Use the async client if available
            if hasattr(ollama, 'AsyncClient'):
                client = ollama.AsyncClient(host=self.url.replace('http://', '').replace('https://', ''))
                response = await client.chat(
                    model=self.model,
                    messages=messages,
                    stream=stream,
                    options={
                        'temperature': self.temperature,
                        'max_tokens': self.max_tokens
                    }
                )
                
                if stream:
                    async for chunk in response:
                        yield chunk.get('message', {}).get('content', '')
                else:
                    yield response.get('message', {}).get('content', '')
            else:
                # Fallback to requests-based approach
                import requests
                payload = {
                    "model": self.model,
                    "messages": messages,
                    "stream": stream,
                    "options": {
                        "temperature": self.temperature,
                        "num_predict": self.max_tokens
                    }
                }
                
                if stream:
                    with requests.post(
                        self.url.rstrip('/') + "/api/chat",
                        json=payload,
                        stream=True,
                        timeout=self.timeout
                    ) as response:
                        for line in response.iter_lines():
                            if line:
                                try:
                                    chunk = json.loads(line)
                                    yield chunk.get('message', {}).get('content', '')
                                except json.JSONDecodeError:
                                    continue
                else:
                    response = requests.post(
                        self.url.rstrip('/') + "/api/chat",
                        json=payload,
                        timeout=self.timeout
                    )
                    data = response.json()
                    yield data.get('message', {}).get('content', '')
                    
        except ImportError:
            # Pure aiohttp implementation
            async with aiohttp.ClientSession() as session:
                payload = {
                    "model": self.model,
                    "messages": messages,
                    "stream": stream,
                    "options": {
                        "temperature": self.temperature,
                        "num_predict": self.max_tokens
                    }
                }
                
                async with session.post(
                    self.url.rstrip('/') + "/api/chat",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=self.timeout)
                ) as response:
                    if stream:
                        async for line in response.content.iter_any():
                            if line:
                                try:
                                    chunk = json.loads(line)
                                    yield chunk.get('message', {}).get('content', '')
                                except (json.JSONDecodeError, UnicodeDecodeError):
                                    continue
                    else:
                        data = await response.json()
                        yield data.get('message', {}).get('content', '')
    
    async def _edge_request(
        self,
        messages: List[Dict[str, str]],
        stream: bool = False
    ) -> AsyncGenerator[str, None]:
        """Make request to Edge API (OpenAI-compatible)"""
        config = self._get_edge_config()
        
        payload = {
            "model": config.model,
            "messages": messages,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "stream": stream
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                config.url,
                json=payload,
                headers=config.headers,
                timeout=aiohttp.ClientTimeout(total=self.timeout)
            ) as response:
                if not response.ok:
                    error_data = await response.json().catch(lambda: {})
                    raise Exception(f"Edge API error: {response.status} {error_data.get('error', {}).get('message', '')}")
                
                if stream:
                    async for line in response.content.iter_any():
                        if line:
                            try:
                                if line.startswith(b'data: '):
                                    chunk_str = line.decode('utf-8').replace('data: ', '')
                                    if chunk_str.strip() != '[DONE]':
                                        chunk = json.loads(chunk_str)
                                        content = chunk.get('choices', [{}])[0].get('delta', {}).get('content', '')
                                        if content:
                                            yield content
                            except (json.JSONDecodeError, UnicodeDecodeError, IndexError):
                                continue
                else:
                    data = await response.json()
                    content = data.get('choices', [{}])[0].get('message', {}).get('content', '')
                    yield content
    
    async def _gateway_request(
        self,
        messages: List[Dict[str, str]],
        stream: bool = False
    ) -> AsyncGenerator[str, None]:
        """Make request through Gateway"""
        config = self._get_gateway_config()
        
        payload = {
            "model": config.model,
            "messages": messages,
            "stream": stream
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                config.url,
                json=payload,
                headers=config.headers,
                timeout=aiohttp.ClientTimeout(total=self.timeout)
            ) as response:
                if not response.ok:
                    error_data = await response.json().catch(lambda: {})
                    raise Exception(f"Gateway error: {response.status} {error_data.get('error', '')}")
                
                if stream:
                    async for line in response.content.iter_any():
                        if line:
                            try:
                                chunk = json.loads(line)
                                content = chunk.get('message', {}).get('content', '')
                                if content:
                                    yield content
                            except (json.JSONDecodeError, UnicodeDecodeError):
                                continue
                else:
                    data = await response.json()
                    content = data.get('message', {}).get('content', '')
                    yield content
    
    async def ask_stream(
        self,
        prompt: str,
        history: Optional[List[Dict[str, str]]] = None
    ) -> AsyncGenerator[str, None]:
        """Ask Codeine with streaming response
        
        Args:
            prompt: User prompt
            history: Optional conversation history
            
        Yields:
            Stream of response text chunks
        """
        # Resolve model with fallback
        original_model = self.model
        self.model = await self._try_model_fallback(original_model)
        
        messages = self._build_messages(prompt, history)
        
        try:
            if self.backend == BackendType.OLLAMA:
                async for chunk in self._ollama_request(messages, stream=True):
                    yield chunk
            elif self.backend == BackendType.EDGE:
                async for chunk in self._edge_request(messages, stream=True):
                    yield chunk
            elif self.backend == BackendType.GATEWAY:
                async for chunk in self._gateway_request(messages, stream=True):
                    yield chunk
            else:
                # Demo mode
                yield self._get_demo_response(prompt)
        except Exception as e:
            yield f"Error: {str(e)}"
    
    async def ask(
        self,
        prompt: str,
        history: Optional[List[Dict[str, str]]] = None
    ) -> CodeineResponse:
        """Ask Codeine and get complete response
        
        Args:
            prompt: User prompt
            history: Optional conversation history
            
        Returns:
            CodeineResponse with full response
        """
        # Resolve model with fallback
        original_model = self.model
        self.model = await self._try_model_fallback(original_model)
        
        messages = self._build_messages(prompt, history)
        full_response = ""
        
        try:
            if self.backend == BackendType.OLLAMA:
                async for chunk in self._ollama_request(messages, stream=False):
                    full_response += chunk
            elif self.backend == BackendType.EDGE:
                async for chunk in self._edge_request(messages, stream=False):
                    full_response += chunk
            elif self.backend == BackendType.GATEWAY:
                async for chunk in self._gateway_request(messages, stream=False):
                    full_response += chunk
            else:
                full_response = self._get_demo_response(prompt)
            
            return CodeineResponse(
                content=full_response,
                model=self.model,
                backend=self.backend.value,
                source="codeine" if self.backend != BackendType.DEMO else "demo"
            )
        except Exception as e:
            return CodeineResponse(
                content=str(e),
                model=self.model,
                backend=self.backend.value,
                source="error"
            )
    
    def _get_demo_response(self, prompt: str) -> str:
        """Get demo response when no backend is available"""
        return (
            f"DEMO MODE: Codeine assistant is ready but no backend is configured. "
            f"\n\nPrompt received: {prompt}\n\n"
            f"To enable live responses:\n"
            f"1. For Ollama local: Run `ollama pull codeine-7b` and start Ollama\n"
            f"2. For Edge API: Set CODEINE_EDGE_URL and CODEINE_EDGE_KEY\n"
            f"3. For Gateway: Run agent/atma-gateway.mjs and set CODEINE_GATEWAY_URL\n\n"
            f"Codeine is a master coding assistant proficient in ALL languages, "
            f"methods, and architectures for Project ATMA."
        )


# CLI Interface

def detect_backend() -> BackendType:
    """Auto-detect available backend"""
    # Check environment variables
    if os.environ.get("CODEINE_GATEWAY_URL"):
        return BackendType.GATEWAY
    if os.environ.get("CODEINE_EDGE_KEY") or os.environ.get("GROQ_API_KEY"):
        return BackendType.EDGE
    return BackendType.OLLAMA


def parse_args():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(
        description="Codeine AI Coding Assistant for Project ATMA",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python codeine_assistant.py 'Write a Mythic agent in Go'\n"
            "  python codeine_assistant.py --stream 'Explain the http C2 profile'\n"
            "  python codeine_assistant.py --interactive\n"
            "  python codeine_assistant.py --backend edge --model llama-3.2-7b-code 'Code review'\n"
            "\nEnvironment Variables:\n"
            "  CODEINE_MODEL: Model to use\n"
            "  CODEINE_EDGE_URL: Edge API endpoint\n"
            "  CODEINE_EDGE_KEY: Edge API key\n"
            "  CODEINE_GATEWAY_URL: Gateway URL\n"
            "  CODEINE_GATEWAY_TOKEN: Gateway token\n"
            "  OLLAMA_HOST: Ollama server host\n"
            "  GROQ_API_KEY: Groq API key"
        )
    )
    
    parser.add_argument(
        "prompt",
        nargs="?",
        help="Prompt to send to Codeine"
    )
    parser.add_argument(
        "--backend",
        choices=[b.value for b in BackendType],
        default=None,
        help="Backend to use (default: auto-detect)"
    )
    parser.add_argument(
        "--model",
        default=None,
        help="Model to use (default: codeine-7b)"
    )
    parser.add_argument(
        "--stream",
        action="store_true",
        help="Stream response tokens"
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Interactive REPL mode"
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Check backend availability"
    )
    parser.add_argument(
        "--gateway",
        action="store_true",
        help="Use gateway mode (shorthand for --backend gateway)"
    )
    parser.add_argument(
        "--edge",
        action="store_true",
        help="Use edge mode (shorthand for --backend edge)"
    )
    parser.add_argument(
        "--ollama",
        action="store_true",
        help="Use Ollama mode (shorthand for --backend ollama)"
    )
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=2000,
        help="Maximum tokens to generate"
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=0.3,
        help="Sampling temperature"
    )
    
    return parser.parse_args()


async def check_backend(assistant: CodeineAssistant) -> int:
    """Check backend availability and return exit code"""
    print(f"Checking {assistant.backend.value} backend...")
    print(f"  Model: {assistant.model}")
    print(f"  URL: {assistant.url}")
    
    try:
        if assistant.backend == BackendType.OLLAMA:
            # Check Ollama
            try:
                import ollama
                models = ollama.list()
                available_models = [m['name'] for m in models.get('models', [])]
                print(f"  Available models: {', '.join(available_models) or '(none)'}")
                
                if assistant.model in available_models:
                    print(f"  ✓ Model {assistant.model} is available")
                    return 0
                else:
                    print(f"  ✗ Model {assistant.model} not found")
                    print(f"  Try: ollama pull {assistant.model}")
                    return 1
            except Exception as e:
                print(f"  ✗ Cannot reach Ollama: {e}")
                return 1
        
        elif assistant.backend == BackendType.EDGE:
            # Check Edge API
            config = assistant._get_edge_config()
            if not config.api_key:
                print(f"  ✗ No API key configured")
                return 1
            
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        config.url.replace('/chat/completions', '/models'),
                        headers=config.headers,
                        timeout=aiohttp.ClientTimeout(total=10)
                    ) as response:
                        if response.ok:
                            print(f"  ✓ Edge API is reachable")
                            return 0
                        else:
                            print(f"  ✗ Edge API error: {response.status}")
                            return 1
            except Exception as e:
                print(f"  ✗ Cannot reach Edge API: {e}")
                return 1
        
        elif assistant.backend == BackendType.GATEWAY:
            # Check Gateway
            config = assistant._get_gateway_config()
            if not config.api_key:
                print(f"  ✗ No gateway token configured")
                return 1
            
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        f"{assistant.url}/gateway/status",
                        headers=config.headers,
                        timeout=aiohttp.ClientTimeout(total=10)
                    ) as response:
                        if response.ok:
                            data = await response.json()
                            print(f"  ✓ Gateway is reachable")
                            print(f"  Status: {data}")
                            return 0
                        else:
                            print(f"  ✗ Gateway error: {response.status}")
                            return 1
            except Exception as e:
                print(f"  ✗ Cannot reach Gateway: {e}")
                return 1
        
        else:
            print(f"  ✓ Demo mode (no backend required)")
            return 0
            
    except Exception as e:
        print(f"  ✗ Error checking backend: {e}")
        return 1


async def interactive_mode(assistant: CodeineAssistant):
    """Run interactive REPL mode"""
    print(f"\nCodeine AI Assistant - Interactive Mode")
    print(f"Backend: {assistant.backend.value}")
    print(f"Model: {assistant.model}")
    print(f"Type 'quit' or 'exit' to end, 'clear' to clear context\n")
    
    history: List[Dict[str, str]] = []
    
    while True:
        try:
            prompt = input("codeine> ").strip()
            
            if not prompt:
                continue
            if prompt.lower() in ['quit', 'exit', 'q']:
                break
            if prompt.lower() == 'clear':
                history = []
                print("Context cleared.")
                continue
            
            # Add user message to history
            history.append({"who": "you", "text": prompt})
            
            # Get response
            response = await assistant.ask(prompt, history)
            
            # Add assistant message to history
            history.append({"who": "assistant", "text": response.content})
            
            print(f"\n{response.content}\n")
            
        except KeyboardInterrupt:
            print("\nUse 'quit' or 'exit' to end the session.")
        except EOFError:
            break
        except Exception as e:
            print(f"Error: {e}")


async def main():
    """Main entry point"""
    args = parse_args()
    
    # Determine backend
    if args.gateway:
        backend = BackendType.GATEWAY
    elif args.edge:
        backend = BackendType.EDGE
    elif args.ollama:
        backend = BackendType.OLLAMA
    elif args.backend:
        backend = BackendType(args.backend)
    else:
        backend = detect_backend()
    
    # Get API key and token from environment
    api_key = os.environ.get("CODEINE_EDGE_KEY") or os.environ.get("GROQ_API_KEY", "")
    gateway_token = os.environ.get("CODEINE_GATEWAY_TOKEN") or os.environ.get("ATMA_GATEWAY_TOKEN", "")
    
    # Create assistant
    assistant = CodeineAssistant(
        backend=backend,
        model=args.model,
        api_key=api_key,
        gateway_token=gateway_token,
        max_tokens=args.max_tokens,
        temperature=args.temperature
    )
    
    # Check mode
    if args.check:
        return await check_backend(assistant)
    
    # Interactive mode
    if args.interactive or not args.prompt:
        return await interactive_mode(assistant)
    
    # Single prompt mode
    if args.stream:
        print(f"[Codeine {assistant.backend.value}] Streaming response...")
        print("-" * 60)
        async for chunk in assistant.ask_stream(args.prompt):
            print(chunk, end='', flush=True)
        print("\n" + "-" * 60)
    else:
        response = await assistant.ask(args.prompt)
        print(f"[Codeine {assistant.backend.value}]")
        print(f"Model: {response.model}")
        print(f"Source: {response.source}")
        print("-" * 60)
        print(response.content)
        print("-" * 60)
    
    return 0


if __name__ == "__main__":
    try:
        exit_code = asyncio.run(main())
        sys.exit(exit_code)
    except KeyboardInterrupt:
        sys.exit(130)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
