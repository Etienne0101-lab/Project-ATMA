# Project ATMA - Mythic Server Integration

This directory contains a complete, standalone Mythic penetration testing platform integrated with Project ATMA. It provides all the functionality of the official Mythic platform while maintaining ATMA's unique features like the Codeine AI assistant.

## What is Mythic?

Mythic is an open-source, collaborative, multi-agent red teaming framework. It provides:

- **Agent Management**: Control and monitor multiple agents (Apollo, Poseidon, Medusa, Apfell, etc.)
- **Command & Control**: Various C2 profiles (HTTP, HTTPS, SMB, TCP, WebSocket, etc.)
- **Payload Generation**: Build custom payloads for different operating systems
- **Task Management**: Execute commands and tasks on compromised systems
- **File Management**: Upload, download, and manage files
- **Operations**: Organize and track red team operations
- **GraphQL API**: Full API access for automation and integration

## Quick Start

### Prerequisites

- Docker (with Docker Compose plugin)
- Docker Compose v2+ (included with modern Docker installations)
- At least 4GB RAM (8GB recommended)
- At least 2 CPU cores

### Installation

1. **Clone the Project-ATMA repository:**
   ```bash
   git clone https://github.com/Etienne0101-lab/Project-ATMA
   cd Project-ATMA
   ```

2. **Navigate to the Mythic server directory:**
   ```bash
   cd mythic-server
   ```

3. **Run the full setup:**
   ```bash
   bash atma-integration.sh full-setup
   ```
   This will:
   - Check Docker installation
   - Build the Mythic CLI
   - Start all Mythic services
   - Integrate with ATMA frontend
   - Create the launcher script

4. **Access Mythic:**
   - **Mythic UI**: http://localhost:7443
   - **Default credentials**: `mythic_admin` / (password generated on first start)
   - **GraphQL API**: http://localhost:7443/graphql
   - **WebSocket**: ws://localhost:7444

## Integration with ATMA

The Mythic server is fully integrated with Project ATMA's existing frontend and Codeine AI assistant.

### ATMA Mythic Launcher

Use the `atma-mythic-launcher.sh` script for easy management:

```bash
# Start Mythic
bash atma-mythic-launcher.sh start

# Stop Mythic
bash atma-mythic-launcher.sh stop

# Check status
bash atma-mythic-launcher.sh status

# View logs
bash atma-mythic-launcher.sh logs mythic_server

# Install lab tools
bash atma-mythic-launcher.sh install-lab
```

## Docker Services

The `docker-compose.yml` file defines the following services:

| Service | Port | Description |
|---------|------|-------------|
| mythic_server | 17443, 17444 | Mythic Go server and WebSocket |
| mythic_react | 3000 | Mythic React frontend |
| postgres | 5432 | PostgreSQL database |
| rabbitmq | 5672, 15672 | RabbitMQ message broker |
| hasura | 8080 | GraphQL engine |
| nginx | 80, 443 | Reverse proxy |
| atma_gateway | 8081 | ATMA integration with Codeine |

## Security Note

**IMPORTANT**: This is a lab-only setup. Never expose Mythic to the internet without proper security controls. Use only on localhost or in a secure, isolated network.

## License

MIT License - See LICENSE file for details.
