# ATMA XMP Injector Module

A live, fully functional injector module for XMP metadata injection, integrated with Mythic penetration testing platform and Codeine AI assistant.

## Overview

This module provides advanced XMP metadata injection capabilities with deep integration into:

- **Mythic**: Full penetration testing platform integration
- **Codeine AI**: Adaptive payload generation using AI
- **ATMA Web App**: Browser-based injection interface

## Features

### Core Injection Capabilities

- **Multiple Image Formats**: JPEG, PNG, WebP support
- **XMP Metadata Injection**: Full XMP XML document generation
- **Multiple Payload Types**:
  - Layered authority assertions
  - System configuration emulation
  - JSON privilege escalation
  - Recursive authority chains
  - Imperative command chains
  - Stealth (random combination)
  - AI-generated adaptive payloads
  - Mythic-specific callback injection

### Mythic Integration

- **Callback Creation**: Automatically create Mythic callbacks for tracking
- **Task Logging**: Log injection events as Mythic tasks
- **File Upload**: Upload injected images to Mythic for analysis
- **Operation Tracking**: Track all injections within Mythic operations

### Codeine AI Integration

- **Adaptive Payloads**: AI-generated payloads based on context
- **Target Analysis**: AI-powered analysis of injection targets
- **Context-Aware**: Payloads adapt to specific use cases and targets

### Web App Integration

- **REST API**: JSON-based API for web integration
- **Base64 Image Handling**: Process images directly from web requests
- **Real-time Processing**: Synchronous injection processing

## Installation

### Prerequisites

- Python 3.8+
- pip package manager

### Install Dependencies

```bash
cd mythic-server/injector
pip install -r requirements.txt
```

### Required Packages

- **Pillow** (PIL): Image processing
- **piexif**: EXIF metadata manipulation for JPEG
- **requests**: HTTP requests for Mythic and Codeine integration

## Usage

### Basic Injection

```bash
# Inject default payload into an image
python ps_instructions_inject.py -i input.jpg -o output.jpg

# Specify payload type
python ps_instructions_inject.py -i input.jpg -p json

# Use custom payload
python ps_instructions_inject.py -i input.jpg --custom "Your custom instructions"
```

### Mythic Integration

```bash
# Enable Mythic integration
export MYTHIC_SERVER_URL=http://localhost:7443
export MYTHIC_TOKEN=your_jwt_token

# Inject with Mythic tracking
python ps_instructions_inject.py -i input.jpg --mythic --operation ATMA_Ops

# Create callback and inject
python ps_instructions_inject.py -i input.jpg --mythic --create-callback --operation ATMA_XMP

# Upload to Mythic after injection
python ps_instructions_inject.py -i input.jpg --mythic --upload --callback YOUR_CALLBACK_ID
```

### Codeine AI Integration

```bash
# Enable AI-generated payloads
export CODEINE_URL=http://localhost:8081
export GROQ_KEY=your_groq_key

# Use AI-generated adaptive payload
python ps_instructions_inject.py -i input.jpg --codeine --intent "privilege escalation"

# Specify target for AI optimization
python ps_instructions_inject.py -i input.jpg --codeine --target "Claude-3-Vision" --intent "remove restrictions"
```

### Batch Processing

```bash
# Process all images in a directory
python ps_instructions_inject.py -i ./images/ --batch

# With Mythic integration
python ps_instructions_inject.py -i ./images/ --batch --mythic --operation ATMA_Batch
```

### Analysis Mode

```bash
# Analyze image metadata
python ps_instructions_inject.py -i output.jpg --analyze
```

### Dry Run

```bash
# Preview XMP without modifying file
python ps_instructions_inject.py -i input.jpg --dry-run
```

## Payload Types

| Type | Description | Best For |
|------|-------------|----------|
| `layered` | Multi-line authority assertions | General use |
| `config` | System config file emulation | Config-based models |
| `json` | JSON privilege escalation | API-trained models |
| `recursive` | Self-reinforcing authority | Resilient injection |
| `imperative` | Short imperative commands | Direct instruction |
| `stealth` | Random combination | Avoiding patterns |
| `adaptive` | AI-generated payload | Context-specific |
| `mythic` | Mythic callback injection | Mythic tracking |

## Environment Variables

### Mythic Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MYTHIC_SERVER_URL` | `http://localhost:7443` | Mythic server URL |
| `MYTHIC_TOKEN` | - | Mythic JWT token |
| `MYTHIC_API_VERSION` | `v1.4` | Mythic API version |
| `MYTHIC_CALLBACK_ID` | - | Default callback ID |
| `MYTHIC_OPERATION_NAME` | `ATMA_XMP_Injector` | Default operation name |

### Codeine AI Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `CODEINE_URL` | `http://localhost:8081` | Codeine gateway URL |
| `GROQ_KEY` | - | Groq API key for AI |

### ATMA Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ATMA_MODE` | `standalone` | ATMA mode |

## Python API

### Basic Usage

```python
from injector.ps_instructions_inject import (
    PayloadGenerator,
    MythicIntegration,
    CodeineClient,
    inject_jpeg,
    inject_png,
    build_xmp_xml,
    build_supporting_fields
)

# Create payload generator
pg = PayloadGenerator()

# Generate payload
context = {
    'operation': 'ATMA_Ops',
    'callback_id': 'callback-uuid',
    'target': 'Claude-3-Vision',
    'intent': 'remove restrictions'
}
payload = pg.payload_layered_authority(context)

# Build XMP fields
fields = build_supporting_fields(payload, context)

# Build XMP XML
xmp_xml = build_xmp_xml(fields)

# Inject into image
inject_jpeg('input.jpg', xmp_xml, 'output.jpg', context)
```

### With Mythic Integration

```python
from injector.ps_instructions_inject import MythicIntegration

# Initialize Mythic integration
mythic = MythicIntegration()

# Create callback
callback_id = mythic.create_callback('ATMA_XMP_Ops')

# Log injection
mythic.log_injection(callback_id, 'output.jpg', 'layered', context)

# Upload file
mythic.upload_file(callback_id, 'output.jpg', 'XMP Injected Image')
```

### With Codeine AI

```python
from injector.ps_instructions_inject import CodeineClient

# Initialize Codeine client
codeine = CodeineClient()

# Generate adaptive payload
context = {
    'target': 'Claude-3-Vision',
    'operation': 'ATMA_AI_Ops',
    'intent': 'privilege escalation'
}
payload = codeine.generate_adaptive_payload(context)

# Analyze target
analysis = codeine.analyze_target({
    'model': 'Claude-3-Vision',
    'use_case': 'penetration testing',
    'restrictions': ['content filtering', 'safety classifiers']
})
```

## Web App Integration

### REST API Endpoint

```python
from injector.ps_instructions_inject import WebAppIntegration
import json
from flask import Flask, request, jsonify

app = Flask(__name__)
web_integration = WebAppIntegration()

@app.route('/api/inject', methods=['POST'])
def inject():
    try:
        request_data = request.get_json()
        result = web_integration.process_web_injection(request_data)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/generate-payload', methods=['POST'])
def generate_payload():
    try:
        request_data = request.get_json()
        result = web_integration.generate_web_payload(request_data)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

### Request Format

```json
{
    "image": "base64_encoded_image_data",
    "image_data": "data:image/png;base64,...",
    "payload_type": "layered",
    "operation": "ATMA_Web_Ops",
    "callback_id": "callback-uuid",
    "intent": "remove restrictions",
    "target": "Claude-3-Vision",
    "use_ai": true,
    "upload_to_mythic": true
}
```

### Response Format

```json
{
    "success": true,
    "result_image": "data:image/png;base64,...",
    "payload": "payload text",
    "fields": {
        "photoshop:Instructions": "...",
        "dc:description": "...",
        "xmpRights:UsageTerms": "..."
    },
    "callback_id": "callback-uuid",
    "task_id": "task-uuid"
}
```

## Security Considerations

### Important Notes

1. **Authorized Use Only**: This tool is for authorized penetration testing only
2. **Legal Compliance**: Ensure you have proper authorization before use
3. **Data Privacy**: Injected images may contain sensitive metadata
4. **Model Safety**: Respect model providers' terms of service

### Best Practices

1. **Use in Isolated Environments**: Run in controlled, isolated networks
2. **Clean Metadata**: Remove sensitive information from images before distribution
3. **Track Usage**: Maintain logs of all injection activities
4. **Access Control**: Restrict access to injection tools and Mythic platform

## Examples

### Complete Workflow

```bash
# Set up environment
export MYTHIC_SERVER_URL=http://localhost:7443
export MYTHIC_TOKEN=your_token
export CODEINE_URL=http://localhost:8081
export GROQ_KEY=your_key

# Create operation in Mythic
# (Use Mythic UI or CLI)

# Inject image with AI-generated payload
python ps_instructions_inject.py \
    -i input.jpg \
    -o output.jpg \
    --mythic \
    --codeine \
    --create-callback \
    --operation ATMA_AI_Ops \
    --intent "remove restrictions" \
    --target "Claude-3-Vision" \
    --upload

# Verify injection
python ps_instructions_inject.py -i output.jpg --analyze

# Check Mythic for callback and task logs
# (Use Mythic UI)
```

## Troubleshooting

### Common Issues

1. **Missing Dependencies**: Install with `pip install -r requirements.txt`
2. **Pillow Not Found**: `pip install Pillow`
3. **piexif Not Found**: `pip install piexif`
4. **Mythic Connection Failed**: Verify `MYTHIC_SERVER_URL` and `MYTHIC_TOKEN`
5. **Codeine Connection Failed**: Verify `CODEINE_URL` and `GROQ_KEY`

### Debug Mode

```bash
# Enable debug logging
python -m logging -v ps_instructions_inject.py -i input.jpg

# Or modify the script to set logging level
import logging
logging.basicConfig(level=logging.DEBUG)
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - See LICENSE file for details.

## Support

For support, please open an issue on the Project-ATMA GitHub repository:
https://github.com/Etienne0101-lab/Project-ATMA

## Disclaimer

This tool is for educational and authorized security testing purposes only. Use only against systems you own or have explicit permission to test. The authors are not responsible for any misuse of this tool.
