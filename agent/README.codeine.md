# Project ATMA  Codeine AI Coding Assistant

## Overview

Codeine is a **perfect, production-ready, master coding assistant** for Project ATMA that combines the best of DeepHat AI (DevSecOps) with enhanced coding capabilities. It is designed to be:

- **Multi-Language Proficient**: Expert in ALL programming languages (Python, Go, JavaScript, Java, C/C++, C#, Rust, Bash, PowerShell, YAML, JSON, and more)
- **Multi-Method Capable**: Supports functional, OOP, procedural, concurrent, and distributed programming paradigms
- **Multi-Architecture Aware**: Understands x86, ARM, WebAssembly, and various system architectures
- **Fully Integrated**: Works seamlessly with existing ATMA infrastructure
- **Production-Ready**: Built for reliability, security, and scalability

## Architecture

```
Project ATMA + Codeine Architecture:
┌─────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACE                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    ATMA Console (GitHub Pages)                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │   │
│  │  │   Dashboard  │  │  Callbacks   │  │     DeepHat/Codeine       │   │   │
│  │  │   (Demo)    │  │  (Demo)      │  │         Chat Panel         │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           BACKEND SERVICES                                   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        GitHub Actions                              │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │   │
│  │  │ atma-agent  │  │atma-scheduler│  │   codeine-agent (NEW)    │   │   │
│  │  │  (Missions) │  │   (Daily)    │  │   (Codeine Missions)     │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Self-Hosted Services                            │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │   │
│  │  │  Ollama      │  │  Mythic      │  │    Codeine Gateway        │   │   │
│  │  │ (Local LLM)  │  │ (Optional)   │  │    (Enhanced)             │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL SERVICES                                   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        Edge Providers                               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │   │
│  │  │   Groq      │  │ Featherless  │  │    NVIDIA NIM            │   │   │
│  │  │ (Preferred) │  │ (DeepHat)    │  │ (Nemotron)               │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Codeine Assistant (`codeine_assistant.py`)

The main assistant implementation that provides:

- **Multi-Backend Support**: Works with Ollama, Edge APIs (Groq, Featherless), and Gateway
- **Streaming Responses**: Real-time token streaming for interactive use
- **Intelligent Routing**: Automatically selects the best model for each task
- **Code-Specific Features**: Specialized endpoints for code generation, analysis, optimization, etc.
- **Backward Compatible**: Fully compatible with existing DeepHat infrastructure

**Features:**
- Code generation in any language
- Code completion and autofill
- Code analysis and review
- Code explanation at any level
- Code optimization
- Language translation
- Architecture design

### 2. Codeine Training Pipeline (`codeine_training_pipeline.py`)

A **perfect machine learning pipeline** to train a master coding assistant model:

**Stages:**
1. **Data Collection**: Gathers code from Mythic, open-source repos, DevSecOps docs
2. **Data Preprocessing**: Cleans, filters, and prepares training data
3. **Model Training**: Fine-tunes with LoRA for efficiency
4. **Evaluation**: Tests model performance on coding tasks
5. **Deployment**: Exports and deploys the trained model

**Capabilities:**
- Multi-language training (12+ languages)
- LoRA (Low-Rank Adaptation) for efficient fine-tuning
- FP16 and quantization support
- Hugging Face Hub integration
- Comprehensive evaluation suite

### 3. Codeine Gateway (`codeine_gateway.mjs`)

The **unified gateway** that combines and extends existing ATMA infrastructure:

**Endpoints:**
- `/v1/models` - List Groq models
- `/v1/chat/completions` - OpenAI-compatible chat (Groq)
- `/ollama/api/chat` - Ollama chat (DeepHat/Codeine)
- `/ollama/api/tags` - List Ollama models
- `/codeine/chat` - Auto-routed Codeine chat
- `/codeine/complete` - Code completion
- `/codeine/analyze` - Code analysis
- `/codeine/generate` - Code generation
- `/codeine/explain` - Code explanation
- `/codeine/optimize` - Code optimization
- `/codeine/translate` - Language translation
- `/mythic/graphql` - Mythic GraphQL proxy
- `/mythic/auth` - Mythic authentication proxy
- `/route` - Multi-model routing

**Features:**
- **Authentication**: Required `x-atma-token` header for all endpoints
- **Security**: API keys never exposed to clients
- **Monitoring**: Prometheus metrics endpoint
- **Rate Limiting**: Built-in request limiting
- **Health Checks**: Comprehensive health monitoring

### 4. GitHub Actions Workflows

Three new workflows for Codeine:

- **`codeine-agent.yml`**: Run Codeine missions (serverless backend)
- **`codeine-training.yml`**: Train Codeine models (requires GPU)
- **`codeine-gateway.yml`**: Build and deploy Codeine Gateway

### 5. Docker Deployment

Production-ready Docker containers:

- **`Dockerfile.codeine-gateway`**: Gateway container
- **`docker-compose.codeine-gateway.yml`**: Basic deployment
- **`docker-compose.codeine-gateway.ollama.yml`**: With Ollama
- **`docker-compose.codeine-gateway.traefik.yml`**: Full production stack with HTTPS

## Quick Start

### Option 1: Use Existing Infrastructure (No Training)

You can use Codeine immediately with existing models:

```bash
# Using Groq (recommended)
export GROQ_API_KEY=your_groq_key
export ATMA_GATEWAY_TOKEN=your_secure_token

# Run the assistant
python agent/codeine_assistant.py "Write a Mythic agent in Go"

# Or use the gateway
node agent/codeine_gateway.mjs
```

### Option 2: Local Ollama Deployment

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Start Ollama
ollama serve

# Pull Codeine model (or use DeepHat as fallback)
ollama pull codeine-7b || ollama pull DeepHat/DeepHat-V1-7B

# Run the assistant
export OLLAMA_HOST=http://localhost:11434
python agent/codeine_assistant.py "Analyze this Python code"
```

### Option 3: Full Training Pipeline

```bash
# WARNING: Requires GPU with 24GB+ VRAM

# Collect and preprocess data
python agent/codeine_training_pipeline.py --collect
python agent/codeine_training_pipeline.py --preprocess

# Train the model (on GPU machine)
python agent/codeine_training_pipeline.py --train \
  --model codeine-7b \
  --batch-size 4 \
  --epochs 3

# Evaluate
python agent/codeine_training_pipeline.py --evaluate

# Deploy
python agent/codeine_training_pipeline.py --deploy --push true
```

## Usage Examples

### Code Generation

```python
# Using the Python API
from codeine_assistant import CodeineAssistant, BackendType

assistant = CodeineAssistant(
    backend=BackendType.OLLAMA,
    model="codeine-7b"
)

response = await assistant.ask("Write a Python function to reverse a string")
print(response.content)
```

```bash
# Using CLI
python agent/codeine_assistant.py "Write a Go HTTP server with health endpoint"
```

### Code Analysis

```bash
python agent/codeine_assistant.py --backend groq \
  "Analyze this code for security vulnerabilities"
```

### Multi-Language Support

```bash
# Generate Java code
python agent/codeine_assistant.py \
  --language java \
  "Create a Java class for Mythic callback handling"

# Translate Python to Go
python agent/codeine_assistant.py \
  --model codeine-7b \
  "Translate this Python code to Go"
```

### Gateway Usage

```bash
# Start gateway
GROQ_API_KEY=your_key \
ATMA_GATEWAY_TOKEN=your_token \
node agent/codeine_gateway.mjs

# Use via curl
curl -X POST http://localhost:8787/codeine/chat \
  -H "x-atma-token: your_token" \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Write a payload builder"}]}'
```

## Deployment Options

### Option 1: GitHub Pages + GitHub Actions (Serverless)

This is the default ATMA deployment:

1. Copy workflow files to `.github/workflows/`:
   - `codeine-agent.yml`
   - `codeine-training.yml` (optional)
   - `codeine-gateway.yml` (optional)

2. Configure secrets:
   - `PROJECT_ATMA`: Your Groq API key
   - `ATMA_GATEWAY_TOKEN`: Gateway authentication token

3. Dispatch missions from the ATMA console or via CLI

### Option 2: Local Development

```bash
# Clone the repo
git clone https://github.com/Etienne0101-lab/Project-ATMA
cd Project-ATMA

# Install dependencies
pip install -r requirements.txt

# Run assistant
python agent/codeine_assistant.py --interactive
```

### Option 3: Docker Deployment

```bash
# Build and run gateway
docker build -t codeine-gateway -f Dockerfile.codeine-gateway .
docker run -d \
  -p 8787:8787 \
  -e ATMA_GATEWAY_TOKEN=your_token \
  -e GROQ_API_KEY=your_key \
  codeine-gateway
```

### Option 4: Docker Compose (Production)

```bash
# Create .env file
echo "ATMA_GATEWAY_TOKEN=your_token" > .env
echo "GROQ_API_KEY=your_key" >> .env
echo "TRAEFIK_DOMAIN=your-domain.com" >> .env
echo "TRAEFIK_EMAIL=your-email@example.com" >> .env

# Start full stack
docker compose \
  -f docker-compose.codeine-gateway.yml \
  -f docker-compose.codeine-gateway.ollama.yml \
  -f docker-compose.codeine-gateway.traefik.yml \
  up -d
```

### Option 5: Self-Hosted Runner (For Training)

1. Set up a GPU machine
2. Install Docker and NVIDIA Container Toolkit
3. Add as self-hosted runner to GitHub
4. Run `codeine-training.yml` workflow

## Configuration

### Environment Variables

**Codeine Assistant:**
```bash
CODEINE_MODEL=codeine-7b              # Default model
CODEINE_EDGE_URL=https://api.groq.com/openai/v1  # Edge API URL
CODEINE_EDGE_KEY=your_key             # Edge API key
CODEINE_GATEWAY_URL=http://localhost:8787  # Gateway URL
CODEINE_GATEWAY_TOKEN=your_token     # Gateway token
OLLAMA_HOST=http://localhost:11434    # Ollama host
GROQ_API_KEY=your_key                # Groq API key
```

**Training Pipeline:**
```bash
CODEINE_DATA_DIR=./data/codeine        # Data directory
CODEINE_MODEL_DIR=./models/codeine     # Model directory
CODEINE_BASE_MODEL=Qwen2.5-Coder-7B    # Base model
CODEINE_OUTPUT_MODEL=codeine-7b        # Output model
WANDB_API_KEY=your_key                # Weights & Biases
HUGGINGFACE_TOKEN=your_token          # Hugging Face
```

**Gateway:**
```bash
ATMA_GATEWAY_TOKEN=your_token          # Required
GROQ_API_KEY=your_key                 # For Groq proxy
OLLAMA_URL=http://localhost:11434      # Ollama URL
MYTHIC_URL=https://127.0.0.1:7443      # Mythic URL
CODEINE_MODEL=codeine-7b              # Default Codeine model
MONITORING_ENABLED=true               # Enable metrics
LOG_LEVEL=info                        # Logging level
```

## Integration with ATMA Console

The Codeine assistant integrates seamlessly with the existing ATMA console:

1. **DeepHat Panel**: Now supports Codeine models
2. **Missions Tab**: Can dispatch Codeine-specific missions
3. **Connect Tab**: Configure gateway and API keys
4. **Chat Interface**: Enhanced with Codeine-specific commands

### Using Codeine in the Console

1. Open the ATMA console: https://etienne0101-lab.github.io/Project-ATMA/
2. Navigate to the DeepHat AI view
3. Select "Codeine" as the backend
4. Choose your preferred model
5. Start coding!

## Security

### Authentication

- All gateway endpoints require `x-atma-token` header
- API keys are NEVER printed, logged, or committed
- Keys are stored only in environment variables
- Gateway binds to localhost only

### Best Practices

1. **Never expose gateway ports publicly**
2. **Use Tailscale or similar zero-trust networking** for remote access
3. **Rotate API keys regularly**
4. **Use different tokens for different services**
5. **Monitor access logs**

### For Production Deployments

1. Use HTTPS with valid certificates (Traefik handles this automatically)
2. Enable basic authentication or OAuth
3. Configure IP whitelisting
4. Set up rate limiting
5. Enable monitoring and alerting

## Performance

### Model Recommendations

| Model | Size | VRAM Required | Use Case |
|-------|------|---------------|----------|
| codeine-7b | 7B | 8GB | General coding, fast inference |
| DeepHat/DeepHat-V1-7B | 7B | 8GB | DevSecOps, Mythic-specific |
| llama-3.2-7b-code | 7B | 8GB | Code generation |
| qwen2.5-coder-7b | 7B | 8GB | Multi-language coding |
| llama-3.3-70b-versatile | 70B | 80GB | Complex tasks, analysis |

### Hardware Requirements

| Task | CPU | RAM | GPU | Storage |
|------|-----|-----|-----|---------|
| Inference (7B) | 4+ | 16GB | 8GB | 10GB |
| Inference (70B) | 8+ | 64GB | 80GB | 100GB |
| Training (7B) | 8+ | 32GB | 24GB | 200GB |
| Training (70B) | 16+ | 256GB | 160GB | 1TB+ |

## Troubleshooting

### Common Issues

**"No models available"**
- Check Ollama is running: `ollama list`
- Pull the model: `ollama pull codeine-7b`
- Verify Ollama URL: `curl http://localhost:11434/api/tags`

**"Groq API error"**
- Verify API key is correct
- Check rate limits: https://console.groq.com/usage
- Try a different model

**"Gateway token invalid"**
- Ensure `ATMA_GATEWAY_TOKEN` is set
- Check token matches what client sends
- Verify token is passed as `x-atma-token` header

**"Training out of memory"**
- Reduce batch size
- Use gradient checkpointing
- Use smaller model
- Add more GPU memory

### Debug Mode

Enable verbose logging:

```bash
# For assistant
export LOG_LEVEL=debug
python agent/codeine_assistant.py --interactive

# For gateway
export LOG_LEVEL=debug
node agent/codeine_gateway.mjs
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Development Setup

```bash
git clone https://github.com/Etienne0101-lab/Project-ATMA
cd Project-ATMA
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Testing

```bash
# Test assistant
python -m pytest tests/test_codeine_assistant.py

# Test gateway
node tests/test_codeine_gateway.mjs

# Test training pipeline
python -m pytest tests/test_codeine_training.py
```

## License

Codeine is released under the Apache 2.0 license, with the following additional restrictions:

- No military use
- No use to harm minors
- No use to spread false information
- No use for unauthorized access
- Use only on systems you own or are authorized to test

## Support

- **GitHub Issues**: https://github.com/Etienne0101-lab/Project-ATMA/issues
- **Documentation**: https://github.com/Etienne0101-lab/Project-ATMA
- **Discussions**: https://github.com/Etienne0101-lab/Project-ATMA/discussions

## Roadmap

### Future Enhancements

1. **Enhanced Code Understanding**
   - Static analysis integration
   - AST-based code comprehension
   - Dependency graph generation

2. **Improved Multi-Language Support**
   - Language-specific optimizations
   - Cross-language translation improvements
   - Framework-aware generation

3. **Advanced Features**
   - Code refactoring suggestions
   - Performance optimization
   - Security vulnerability detection
   - Automated testing generation

4. **Integration Improvements**
   - Mythic CLI integration
   - Payload builder integration
   - C2 profile generator

5. **Deployment Options**
   - Kubernetes support
   - Helm charts
   - Terraform modules
   - Ansible playbooks

## Changelog

### v1.0.0 (Current)

- Initial release of Codeine assistant
- Multi-language support (12+ languages)
- Multi-backend architecture (Ollama, Groq, Edge)
- Enhanced gateway with Codeine endpoints
- Training pipeline for custom models
- Docker and Docker Compose support
- GitHub Actions workflows
- Full backward compatibility with DeepHat

## Acknowledgments

- **DeepHat**: Kindo's finetune of Qwen2.5-Coder-7B
- **Mythic**: Cross-platform post-exploitation framework
- **Ollama**: Local LLM inference server
- **Groq**: Cloud LLM inference provider
- **Hugging Face**: Model hosting and training infrastructure

---

**Codeine: The Perfect Coding Assistant for Project ATMA**

*Master any language. Build any architecture. Solve any problem.*
