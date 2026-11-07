#!/usr/bin/env bash
# ATMA Mythic Integration Script
# This script integrates Mythic server with ATMA's existing frontend and Codeine assistant

set -euo pipefail

ATMA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MYTHIC_DIR="$ATMA_DIR/mythic-server"

echo "ATMA Mythic Integration"
echo "======================="
echo "ATMA Directory: $ATMA_DIR"
echo "Mythic Directory: $MYTHIC_DIR"
echo ""

# Function to check if Docker is available
check_docker() {
    if command -v docker >/dev/null 2>&1; then
        echo "✓ Docker is installed"
        docker --version
        docker compose version >/dev/null 2>&1 && echo "✓ Docker Compose plugin is available" || echo "✗ Docker Compose plugin is missing"
    else
        echo "✗ Docker is not installed"
        echo "Please install Docker first"
        exit 1
    fi
}

# Function to build Mythic CLI
build_mythic_cli() {
    echo ""
    echo "Building Mythic CLI..."
    cd "$MYTHIC_DIR/Mythic_CLI"
    if [ -f "mythic-cli" ]; then
        echo "Mythic CLI already exists, skipping build"
    else
        echo "Building Mythic CLI (this may take a few minutes)..."
        sudo make build_linux
        if [ -f "mythic-cli" ]; then
            echo "✓ Mythic CLI built successfully"
            mv mythic-cli ../
        else
            echo "✗ Failed to build Mythic CLI"
            exit 1
        fi
    fi
}

# Function to start Mythic services
start_mythic() {
    echo ""
    echo "Starting Mythic services..."
    cd "$MYTHIC_DIR"
    
    # Check if containers are already running
    if docker ps -a | grep -q "mythic_server"; then
        echo "Mythic containers already exist"
        echo "Starting existing containers..."
        docker compose -f docker-compose.yml up -d
    else
        echo "Creating and starting Mythic containers..."
        docker compose -f docker-compose.yml up -d
    fi
    
    # Wait for services to be ready
    echo "Waiting for Mythic services to be ready..."
    for i in {1..60}; do
        if curl -ks -o /dev/null -w "%{http_code}" "http://localhost:7443" 2>/dev/null | grep -qE '^(200|302|401|403)$'; then
            echo "✓ Mythic UI is responding at http://localhost:7443"
            break
        fi
        sleep 5
        echo -n "."
    done
    
    echo ""
    echo "Mythic services are running!"
    echo "- Mythic UI: http://localhost:7443"
    echo "- GraphQL: http://localhost:7443/graphql"
    echo "- WebSocket: ws://localhost:7444"
    echo ""
}

# Function to stop Mythic services
stop_mythic() {
    echo ""
    echo "Stopping Mythic services..."
    cd "$MYTHIC_DIR"
    docker compose -f docker-compose.yml down
    echo "✓ Mythic services stopped"
}

# Function to check Mythic status
status_mythic() {
    echo ""
    echo "Mythic services status:"
    cd "$MYTHIC_DIR"
    docker compose -f docker-compose.yml ps
    echo ""
    docker ps -a | grep mythic || echo "No Mythic containers running"
}

# Function to install agents and C2 profiles
install_lab_tools() {
    echo ""
    echo "Installing lab agents and C2 profiles..."
    cd "$MYTHIC_DIR"
    
    # Build Mythic CLI if not already built
    if [ ! -f "mythic-cli" ]; then
        build_mythic_cli
    fi
    
    # Install agents
    for agent in Apollo Poseidon Medusa Apfell; do
        echo "Installing agent: $agent"
        sudo ./mythic-cli install github "https://github.com/MythicAgents/$agent" || echo "Failed to install $agent"
    done
    
    # Install C2 profiles
    for c2 in http; do
        echo "Installing C2 profile: $c2"
        sudo ./mythic-cli install github "https://github.com/MythicC2Profiles/$c2" || echo "Failed to install $c2"
    done
    
    echo ""
    echo "Lab tools installed. Restarting Mythic..."
    sudo ./mythic-cli restart
}

# Function to integrate with ATMA frontend
integrate_atma() {
    echo ""
    echo "Integrating ATMA frontend with Mythic..."
    
    # Create a symlink from ATMA docs to Mythic React build
    if [ ! -d "$ATMA_DIR/docs/mythic" ]; then
        mkdir -p "$ATMA_DIR/docs/mythic"
    fi
    
    # Copy Mythic React build to ATMA docs
    if [ -d "$MYTHIC_DIR/mythic-react-docker/mythic" ]; then
        cp -r "$MYTHIC_DIR/mythic-react-docker/mythic"/* "$ATMA_DIR/docs/mythic/" 2>/dev/null || echo "No Mythic React build found"
    fi
    
    # Update ATMA app.js to include Mythic integration
    echo "Updating ATMA frontend to include Mythic integration..."
    
    # Create a Mythic integration file
    cat > "$ATMA_DIR/docs/mythic-integration.js" << 'EOF'
// ATMA Mythic Integration
// This file provides integration between ATMA frontend and Mythic server

class MythicIntegration {
    constructor() {
        this.mythicUrl = localStorage.getItem('mythic_url') || 'http://localhost:7443';
        this.mythicWsUrl = localStorage.getItem('mythic_ws_url') || 'ws://localhost:7444';
        this.token = localStorage.getItem('mythic_token') || '';
        this.connected = false;
        this.ws = null;
    }
    
    setMythicUrl(url) {
        this.mythicUrl = url;
        localStorage.setItem('mythic_url', url);
    }
    
    setMythicWsUrl(url) {
        this.mythicWsUrl = url;
        localStorage.setItem('mythic_ws_url', url);
    }
    
    setToken(token) {
        this.token = token;
        localStorage.setItem('mythic_token', token);
    }
    
    async testConnection() {
        try {
            const response = await fetch(`${this.mythicUrl}/api/v1.4/graphql`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    query: '{ me { username } }'
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.data && data.data.me) {
                    this.connected = true;
                    return { success: true, user: data.data.me };
                }
            }
            
            this.connected = false;
            return { success: false, error: 'Invalid response' };
        } catch (error) {
            this.connected = false;
            return { success: false, error: error.message };
        }
    }
    
    connectWebSocket(onMessage) {
        try {
            this.ws = new WebSocket(this.mythicWsUrl);
            
            this.ws.onopen = () => {
                console.log('Mythic WebSocket connected');
                this.connected = true;
            };
            
            this.ws.onmessage = (event) => {
                if (onMessage) {
                    onMessage(event);
                }
            };
            
            this.ws.onclose = () => {
                console.log('Mythic WebSocket disconnected');
                this.connected = false;
            };
            
            this.ws.onerror = (error) => {
                console.error('Mythic WebSocket error:', error);
                this.connected = false;
            };
            
            return true;
        } catch (error) {
            console.error('Failed to connect WebSocket:', error);
            return false;
        }
    }
    
    disconnectWebSocket() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            this.connected = false;
        }
    }
    
    async queryGraphQL(query, variables = {}) {
        const response = await fetch(`${this.mythicUrl}/api/v1.4/graphql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token}`
            },
            body: JSON.stringify({
                query: query,
                variables: variables
            })
        });
        
        return await response.json();
    }
    
    // Mythic-specific queries
    async getCallbacks() {
        const query = `
            query GetCallbacks {
                callbacks(where: { deleted: { _eq: false } }, order_by: { init_callback: desc }) {
                    id
                    agent_callback_id
                    init_callback
                    last_seen
                    user
                    host
                    ip
                    description
                    active
                    payload_type {
                        ptname
                    }
                    operation {
                        name
                    }
                }
            }
        `;
        return await this.queryGraphQL(query);
    }
    
    async getOperations() {
        const query = `
            query GetOperations {
                operations(where: { deleted: { _eq: false } }, order_by: { name: asc }) {
                    id
                    name
                    description
                    webhook
                    channel
                    completed
                }
            }
        `;
        return await this.queryGraphQL(query);
    }
    
    async getPayloadTypes() {
        const query = `
            query GetPayloadTypes {
                payloadtypes(where: { deleted: { _eq: false } }, order_by: { ptname: asc }) {
                    id
                    ptname
                    description
                    supported_os
                    wrapper
                    author
                }
            }
        `;
        return await this.queryGraphQL(query);
    }
    
    async getC2Profiles() {
        const query = `
            query GetC2Profiles {
                c2profiles(where: { deleted: { _eq: false } }, order_by: { name: asc }) {
                    id
                    name
                    description
                    author
                    is_p2p
                    is_server_running
                }
            }
        `;
        return await this.queryGraphQL(query);
    }
}

// Export for use in ATMA app
window.MythicIntegration = MythicIntegration;
EOF
    
    echo "✓ Mythic integration file created"
    echo ""
}

# Function to create ATMA Mythic launcher
create_launcher() {
    echo ""
    echo "Creating ATMA Mythic launcher..."
    
    cat > "$ATMA_DIR/mythic-server/atma-mythic-launcher.sh" << 'EOF'
#!/usr/bin/env bash
# ATMA Mythic Launcher
# This script provides a unified interface for launching Mythic as part of ATMA

set -euo pipefail

ATMA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MYTHIC_DIR="$ATMA_DIR/mythic-server"

echo "ATMA Mythic Launcher"
echo "===================="
echo ""

case "${1:-help}" in
    start)
        echo "Starting ATMA Mythic..."
        cd "$MYTHIC_DIR"
        docker compose -f docker-compose.yml up -d
        echo ""
        echo "ATMA Mythic is starting..."
        echo "- Mythic UI: http://localhost:7443"
        echo "- ATMA Console: https://etienne0101-lab.github.io/Project-ATMA/"
        echo "- Connect ATMA console to Mythic using: http://localhost:7443"
        ;;
    stop)
        echo "Stopping ATMA Mythic..."
        cd "$MYTHIC_DIR"
        docker compose -f docker-compose.yml down
        echo "ATMA Mythic stopped"
        ;;
    restart)
        echo "Restarting ATMA Mythic..."
        cd "$MYTHIC_DIR"
        docker compose -f docker-compose.yml down
        docker compose -f docker-compose.yml up -d
        echo "ATMA Mythic restarted"
        ;;
    status)
        echo "ATMA Mythic Status:"
        cd "$MYTHIC_DIR"
        docker compose -f docker-compose.yml ps
        echo ""
        echo "Container Details:"
        docker ps -a | grep mythic || echo "No Mythic containers running"
        ;;
    build)
        echo "Building ATMA Mythic..."
        cd "$MYTHIC_DIR/Mythic_CLI"
        sudo make build_linux
        mv mythic-cli ../
        echo "ATMA Mythic CLI built"
        ;;
    install-lab)
        echo "Installing lab tools..."
        cd "$MYTHIC_DIR"
        sudo ./mythic-cli install github https://github.com/MythicAgents/Apollo
        sudo ./mythic-cli install github https://github.com/MythicAgents/Poseidon
        sudo ./mythic-cli install github https://github.com/MythicAgents/Medusa
        sudo ./mythic-cli install github https://github.com/MythicAgents/Apfell
        sudo ./mythic-cli install github https://github.com/MythicC2Profiles/http
        sudo ./mythic-cli restart
        echo "Lab tools installed"
        ;;
    logs)
        echo "ATMA Mythic Logs:"
        cd "$MYTHIC_DIR"
        docker compose -f docker-compose.yml logs -f "${2:-mythic_server}"
        ;;
    check)
        echo "ATMA Mythic Check:"
        if command -v docker >/dev/null 2>&1; then
            echo "✓ Docker is installed"
            docker --version
        else
            echo "✗ Docker is not installed"
            exit 1
        fi
        
        if [ -f "$MYTHIC_DIR/mythic-cli" ]; then
            echo "✓ Mythic CLI is built"
        else
            echo "✗ Mythic CLI is not built"
        fi
        
        if docker ps -a | grep -q "mythic_server"; then
            echo "✓ Mythic containers exist"
        else
            echo "✗ Mythic containers do not exist"
        fi
        ;;
    help|*)
        echo "Usage: $0 {start|stop|restart|status|build|install-lab|logs [container]|check|help}"
        echo ""
        echo "Commands:"
        echo "  start          - Start ATMA Mythic services"
        echo "  stop           - Stop ATMA Mythic services"
        echo "  restart        - Restart ATMA Mythic services"
        echo "  status         - Show status of ATMA Mythic services"
        echo "  build          - Build Mythic CLI"
        echo "  install-lab    - Install lab agents and C2 profiles"
        echo "  logs [name]    - Show logs for a specific container"
        echo "  check          - Check if all dependencies are installed"
        echo "  help           - Show this help message"
        ;;
esac
EOF
    
    chmod +x "$ATMA_DIR/mythic-server/atma-mythic-launcher.sh"
    echo "✓ ATMA Mythic launcher created"
    echo ""
}

# Main execution
case "${1:-help}" in
    check)
        check_docker
        ;;
    build)
        check_docker
        build_mythic_cli
        ;;
    start)
        check_docker
        start_mythic
        ;;
    stop)
        stop_mythic
        ;;
    status)
        status_mythic
        ;;
    install-lab)
        check_docker
        install_lab_tools
        ;;
    integrate)
        integrate_atma
        create_launcher
        ;;
    full-setup)
        check_docker
        build_mythic_cli
        start_mythic
        integrate_atma
        create_launcher
        ;;
    help|*)
        echo "ATMA Mythic Integration Script"
        echo "================================"
        echo ""
        echo "Usage: $0 {check|build|start|stop|status|install-lab|integrate|full-setup|help}"
        echo ""
        echo "Commands:"
        echo "  check          - Check if Docker is installed"
        echo "  build          - Build Mythic CLI"
        echo "  start          - Start Mythic services"
        echo "  stop           - Stop Mythic services"
        echo "  status         - Show status of Mythic services"
        echo "  install-lab    - Install lab agents and C2 profiles"
        echo "  integrate      - Integrate ATMA frontend with Mythic"
        echo "  full-setup     - Perform full setup (check, build, start, integrate)"
        echo "  help           - Show this help message"
        ;;
esac
