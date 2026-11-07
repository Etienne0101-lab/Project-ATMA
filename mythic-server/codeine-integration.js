// Codeine AI Assistant Integration for Mythic
// This file provides deep integration between Codeine AI and Mythic platform

class CodeineMythicIntegration {
    constructor(options = {}) {
        this.mythicUrl = options.mythicUrl || localStorage.getItem('mythic_url') || 'http://localhost:7443';
        this.mythicWsUrl = options.mythicWsUrl || localStorage.getItem('mythic_ws_url') || 'ws://localhost:7444';
        this.token = options.token || localStorage.getItem('mythic_token') || '';
        this.groqKey = options.groqKey || localStorage.getItem('groq_key') || '';
        this.codeineUrl = options.codeineUrl || localStorage.getItem('codeine_url') || 'http://localhost:8081';
        
        this.ws = null;
        this.connected = false;
        this.listeners = new Map();
        
        // Mythic GraphQL queries
        this.queries = {
            callbacks: `
                query GetCallbacks($limit: Int = 50, $offset: Int = 0) {
                    callbacks(
                        where: { deleted: { _eq: false } }
                        limit: $limit
                        offset: $offset
                        order_by: { init_callback: desc }
                    ) {
                        id
                        agent_callback_id
                        init_callback
                        last_seen
                        user
                        host
                        ip
                        description
                        active
                        integrity_level
                        jitter
                        sleep
                        payload_type {
                            id
                            ptname
                            description
                            supported_os
                            author
                        }
                        operation {
                            id
                            name
                            description
                        }
                        tasks_aggregate {
                            aggregate {
                                count
                            }
                        }
                    }
                    callbacks_aggregate {
                        aggregate {
                            count
                        }
                    }
                }
            `,
            
            callbackDetails: `
                query GetCallbackDetails($callbackId: uuid!) {
                    callbacks_by_pk(id: $callbackId) {
                        id
                        agent_callback_id
                        init_callback
                        last_seen
                        user
                        host
                        ip
                        description
                        active
                        integrity_level
                        jitter
                        sleep
                        architecture
                        domain
                        external_ip
                        pid
                        ppid
                        os
                        platform
                        uid
                        username
                        payload_type {
                            id
                            ptname
                            description
                            supported_os
                            author
                            wrapper
                            commands {
                                id
                                cmd
                                description
                                help_cmd
                                version
                                author
                                script_only
                                needs_admin
                            }
                        }
                        operation {
                            id
                            name
                            description
                            webhook
                            channel
                        }
                        tasks(where: { deleted: { _eq: false } }, order_by: { timestamp: desc }) {
                            id
                            timestamp
                            command
                            params
                            status
                            stdout
                            stderr
                            completed_timestamp
                            user_output
                            task_type
                            original_params
                            status_timestamp
                            subtask_count
                            subtasks {
                                id
                                timestamp
                                command
                                params
                                status
                                stdout
                                stderr
                                completed_timestamp
                            }
                        }
                        files(where: { deleted: { _eq: false } }, order_by: { timestamp: desc }) {
                            id
                            timestamp
                            path
                            name
                            size
                            type
                            is_screenshot
                            is_download
                            is_payload
                            comment
                        }
                    }
                }
            `,
            
            operations: `
                query GetOperations($limit: Int = 50, $offset: Int = 0) {
                    operations(
                        where: { deleted: { _eq: false } }
                        limit: $limit
                        offset: $offset
                        order_by: { name: asc }
                    ) {
                        id
                        name
                        description
                        webhook
                        channel
                        completed
                        creator {
                            username
                        }
                        operators {
                            user {
                                username
                                id
                            }
                            role
                        }
                        callbacks_aggregate {
                            aggregate {
                                count
                            }
                        }
                    }
                    operations_aggregate {
                        aggregate {
                            count
                        }
                    }
                }
            `,
            
            payloadTypes: `
                query GetPayloadTypes($limit: Int = 50, $offset: Int = 0) {
                    payloadtypes(
                        where: { deleted: { _eq: false } }
                        limit: $limit
                        offset: $offset
                        order_by: { ptname: asc }
                    ) {
                        id
                        ptname
                        description
                        supported_os
                        wrapper
                        author
                        note
                        c2_profiles {
                            id
                            name
                            description
                            is_p2p
                            is_server_running
                        }
                        commands {
                            id
                            cmd
                            description
                            help_cmd
                            version
                            author
                            script_only
                            needs_admin
                        }
                        build_parameters {
                            id
                            parameter_name
                            default_value
                            description
                            required
                            parameter_type
                            choices
                        }
                    }
                    payloadtypes_aggregate {
                        aggregate {
                            count
                        }
                    }
                }
            `,
            
            c2Profiles: `
                query GetC2Profiles($limit: Int = 50, $offset: Int = 0) {
                    c2profiles(
                        where: { deleted: { _eq: false } }
                        limit: $limit
                        offset: $offset
                        order_by: { name: asc }
                    ) {
                        id
                        name
                        description
                        author
                        is_p2p
                        is_server_running
                        server_choices {
                            id
                            name
                            description
                            value
                            required
                            randomize
                        }
                        parameters {
                            id
                            name
                            description
                            value
                            required
                            randomize
                            parameter_type
                            choices
                        }
                    }
                    c2profiles_aggregate {
                        aggregate {
                            count
                        }
                    }
                }
            `,
            
            tasks: `
                query GetTasks($callbackId: uuid!, $limit: Int = 50, $offset: Int = 0) {
                    tasks(
                        where: { 
                            callback_id: { _eq: $callbackId }
                            deleted: { _eq: false }
                        }
                        limit: $limit
                        offset: $offset
                        order_by: { timestamp: desc }
                    ) {
                        id
                        timestamp
                        command
                        params
                        status
                        stdout
                        stderr
                        completed_timestamp
                        user_output
                        task_type
                        original_params
                        status_timestamp
                        subtask_count
                        subtasks {
                            id
                            timestamp
                            command
                            params
                            status
                            stdout
                            stderr
                            completed_timestamp
                        }
                    }
                    tasks_aggregate(
                        where: { 
                            callback_id: { _eq: $callbackId }
                            deleted: { _eq: false }
                        }
                    ) {
                        aggregate {
                            count
                        }
                    }
                }
            `,
            
            createTask: `
                mutation CreateTask($callbackId: uuid!, $command: String!, $params: String = "") {
                    create_task(
                        input: {
                            callback_id: $callbackId
                            command: $command
                            params: $params
                        }
                    ) {
                        task {
                            id
                            timestamp
                            command
                            params
                            status
                        }
                        success
                        error
                    }
                }
            `,
            
            updateCallback: `
                mutation UpdateCallback($callbackId: uuid!, $sleep: Int, $jitter: Int, $description: String) {
                    update_callbacks_by_pk(
                        pk_columns: { id: $callbackId }
                        _set: {
                            sleep: $sleep
                            jitter: $jitter
                            description: $description
                        }
                    ) {
                        id
                        sleep
                        jitter
                        description
                    }
                }
            `
        };
    }
    
    // Set configuration
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
    
    setGroqKey(key) {
        this.groqKey = key;
        localStorage.setItem('groq_key', key);
    }
    
    setCodeineUrl(url) {
        this.codeineUrl = url;
        localStorage.setItem('codeine_url', url);
    }
    
    // Test Mythic connection
    async testMythicConnection() {
        try {
            const response = await fetch(`${this.mythicUrl}/api/v1.4/graphql`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    query: '{ me { username id } }'
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.data && data.data.me) {
                    this.connected = true;
                    return { 
                        success: true, 
                        user: data.data.me,
                        message: 'Connected to Mythic server' 
                    };
                }
            }
            
            this.connected = false;
            return { 
                success: false, 
                error: 'Invalid response from Mythic server',
                status: response.status 
            };
        } catch (error) {
            this.connected = false;
            return { 
                success: false, 
                error: error.message,
                message: 'Failed to connect to Mythic server' 
            };
        }
    }
    
    // Test Codeine connection
    async testCodeineConnection() {
        try {
            const response = await fetch(`${this.codeineUrl}/health`, {
                headers: {
                    'Authorization': `Bearer ${this.groqKey}`
                }
            });
            
            if (response.ok) {
                return { 
                    success: true,
                    message: 'Codeine gateway is healthy' 
                };
            }
            
            return { 
                success: false,
                error: 'Codeine gateway not responding',
                status: response.status 
            };
        } catch (error) {
            return { 
                success: false,
                error: error.message,
                message: 'Failed to connect to Codeine gateway' 
            };
        }
    }
    
    // Connect WebSocket for real-time updates
    connectWebSocket() {
        try {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                return true;
            }
            
            this.ws = new WebSocket(this.mythicWsUrl);
            
            this.ws.onopen = () => {
                console.log('[CodeineMythic] WebSocket connected');
                this.connected = true;
                this.notifyListeners('connected', { type: 'websocket', status: 'connected' });
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('[CodeineMythic] WebSocket message:', data);
                    this.notifyListeners('message', data);
                    
                    // Handle specific message types
                    if (data.type === 'new_callback') {
                        this.notifyListeners('new_callback', data);
                    } else if (data.type === 'callback_update') {
                        this.notifyListeners('callback_update', data);
                    } else if (data.type === 'new_task') {
                        this.notifyListeners('new_task', data);
                    } else if (data.type === 'task_update') {
                        this.notifyListeners('task_update', data);
                    }
                } catch (e) {
                    console.error('[CodeineMythic] Error parsing WebSocket message:', e);
                }
            };
            
            this.ws.onclose = () => {
                console.log('[CodeineMythic] WebSocket disconnected');
                this.connected = false;
                this.notifyListeners('disconnected', { type: 'websocket', status: 'disconnected' });
                
                // Attempt to reconnect after 5 seconds
                setTimeout(() => {
                    this.connectWebSocket();
                }, 5000);
            };
            
            this.ws.onerror = (error) => {
                console.error('[CodeineMythic] WebSocket error:', error);
                this.connected = false;
                this.notifyListeners('error', { type: 'websocket', error: error.message });
            };
            
            return true;
        } catch (error) {
            console.error('[CodeineMythic] Failed to connect WebSocket:', error);
            this.connected = false;
            return false;
        }
    }
    
    // Disconnect WebSocket
    disconnectWebSocket() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            this.connected = false;
        }
    }
    
    // Add event listener
    addListener(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }
    
    // Remove event listener
    removeListener(event, callback) {
        if (this.listeners.has(event)) {
            const listeners = this.listeners.get(event);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }
    
    // Notify all listeners for an event
    notifyListeners(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (e) {
                    console.error('[CodeineMythic] Error in listener:', e);
                }
            });
        }
    }
    
    // Generic GraphQL query
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
        
        const result = await response.json();
        
        if (result.errors) {
            console.error('[CodeineMythic] GraphQL errors:', result.errors);
            return { success: false, errors: result.errors, data: result.data };
        }
        
        return { success: true, data: result.data };
    }
    
    // Get callbacks
    async getCallbacks(limit = 50, offset = 0) {
        return await this.queryGraphQL(this.queries.callbacks, { limit, offset });
    }
    
    // Get callback details
    async getCallbackDetails(callbackId) {
        return await this.queryGraphQL(this.queries.callbackDetails, { callbackId });
    }
    
    // Get operations
    async getOperations(limit = 50, offset = 0) {
        return await this.queryGraphQL(this.queries.operations, { limit, offset });
    }
    
    // Get payload types
    async getPayloadTypes(limit = 50, offset = 0) {
        return await this.queryGraphQL(this.queries.payloadTypes, { limit, offset });
    }
    
    // Get C2 profiles
    async getC2Profiles(limit = 50, offset = 0) {
        return await this.queryGraphQL(this.queries.c2Profiles, { limit, offset });
    }
    
    // Get tasks for a callback
    async getTasks(callbackId, limit = 50, offset = 0) {
        return await this.queryGraphQL(this.queries.tasks, { callbackId, limit, offset });
    }
    
    // Create a task
    async createTask(callbackId, command, params = '') {
        return await this.queryGraphQL(this.queries.createTask, { 
            callbackId, 
            command, 
            params 
        });
    }
    
    // Update callback
    async updateCallback(callbackId, updates) {
        return await this.queryGraphQL(this.queries.updateCallback, { 
            callbackId,
            sleep: updates.sleep,
            jitter: updates.jitter,
            description: updates.description
        });
    }
    
    // Codeine AI integration methods
    
    // Get AI-powered command suggestions
    async getCommandSuggestions(callbackId, context) {
        try {
            const callbackData = await this.getCallbackDetails(callbackId);
            if (!callbackData.success) {
                return { success: false, error: 'Failed to get callback data' };
            }
            
            const callback = callbackData.data.callbacks_by_pk;
            
            // Prepare prompt for AI
            const prompt = `
You are a penetration testing assistant helping with Mythic operations.

Current callback context:
- Agent: ${callback.payload_type?.ptname || 'Unknown'}
- Host: ${callback.host || 'Unknown'}
- User: ${callback.user || 'Unknown'}
- OS: ${callback.os || 'Unknown'}
- Architecture: ${callback.architecture || 'Unknown'}
- Integrity Level: ${callback.integrity_level || 'Unknown'}

User request/context: ${context}

Provide:
1. Recommended commands for this situation
2. Explanation of each command
3. Potential risks or considerations
4. Expected output

Format as JSON with fields: commands (array), explanations (array), risks (array), expected_output (array)
            `;
            
            // Call Codeine gateway
            const response = await fetch(`${this.codeineUrl}/api/suggest`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.groqKey}`
                },
                body: JSON.stringify({
                    prompt: prompt,
                    context: {
                        callback: callback,
                        mythic_url: this.mythicUrl
                    }
                })
            });
            
            if (response.ok) {
                return await response.json();
            }
            
            return { 
                success: false,
                error: 'Failed to get AI suggestions',
                status: response.status 
            };
        } catch (error) {
            console.error('[CodeineMythic] Error getting command suggestions:', error);
            return { 
                success: false,
                error: error.message,
                message: 'Failed to get AI suggestions' 
            };
        }
    }
    
    // Analyze task output with AI
    async analyzeTaskOutput(taskId, output) {
        try {
            const prompt = `
You are a penetration testing assistant analyzing task output from Mythic.

Task output to analyze:
${output}

Provide analysis including:
1. Summary of the output
2. Key findings or important information
3. Potential next steps or follow-up commands
4. Security implications
5. Any errors or warnings that need attention

Format as JSON with fields: summary (string), findings (array), next_steps (array), security_implications (array), warnings (array)
            `;
            
            const response = await fetch(`${this.codeineUrl}/api/analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.groqKey}`
                },
                body: JSON.stringify({
                    prompt: prompt,
                    context: {
                        task_id: taskId,
                        mythic_url: this.mythicUrl
                    }
                })
            });
            
            if (response.ok) {
                return await response.json();
            }
            
            return { 
                success: false,
                error: 'Failed to analyze task output',
                status: response.status 
            };
        } catch (error) {
            console.error('[CodeineMythic] Error analyzing task output:', error);
            return { 
                success: false,
                error: error.message,
                message: 'Failed to analyze task output' 
            };
        }
    }
    
    // Generate AI-powered report
    async generateReport(operationId, startDate, endDate) {
        try {
            const operations = await this.getOperations();
            const operation = operations.data?.operations?.find(op => op.id === operationId);
            
            if (!operation) {
                return { success: false, error: 'Operation not found' };
            }
            
            const prompt = `
You are a penetration testing assistant generating a report for Mythic operations.

Operation details:
- Name: ${operation.name}
- Description: ${operation.description || 'None'}
- Time period: ${startDate} to ${endDate}

Generate a comprehensive report including:
1. Executive summary
2. Methodology
3. Findings and results
4. Screenshots and evidence
5. Recommendations
6. Lessons learned

Format as Markdown with appropriate headings and structure.
            `;
            
            const response = await fetch(`${this.codeineUrl}/api/report`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.groqKey}`
                },
                body: JSON.stringify({
                    prompt: prompt,
                    context: {
                        operation: operation,
                        start_date: startDate,
                        end_date: endDate,
                        mythic_url: this.mythicUrl
                    }
                })
            });
            
            if (response.ok) {
                return await response.json();
            }
            
            return { 
                success: false,
                error: 'Failed to generate report',
                status: response.status 
            };
        } catch (error) {
            console.error('[CodeineMythic] Error generating report:', error);
            return { 
                success: false,
                error: error.message,
                message: 'Failed to generate report' 
            };
        }
    }
    
    // Natural language tasking
    async executeNaturalLanguageCommand(callbackId, command) {
        try {
            // First, get AI to interpret the natural language command
            const prompt = `
You are a penetration testing assistant translating natural language to Mythic commands.

Current callback context will be provided.

Natural language command: "${command}"

Translate this to:
1. The Mythic command to execute
2. Parameters for the command
3. Explanation of what it will do

Format as JSON with fields: command (string), params (string), explanation (string)
            `;
            
            const response = await fetch(`${this.codeineUrl}/api/translate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.groqKey}`
                },
                body: JSON.stringify({
                    prompt: prompt,
                    context: {
                        callback_id: callbackId,
                        mythic_url: this.mythicUrl
                    }
                })
            });
            
            if (response.ok) {
                const translation = await response.json();
                
                if (translation.success && translation.command) {
                    // Execute the translated command
                    const result = await this.createTask(
                        callbackId,
                        translation.command,
                        translation.params || ''
                    );
                    
                    return {
                        success: true,
                        translation: translation,
                        task: result
                    };
                }
                
                return translation;
            }
            
            return { 
                success: false,
                error: 'Failed to translate command',
                status: response.status 
            };
        } catch (error) {
            console.error('[CodeineMythic] Error executing natural language command:', error);
            return { 
                success: false,
                error: error.message,
                message: 'Failed to execute natural language command' 
            };
        }
    }
    
    // Get AI-powered callback analysis
    async analyzeCallback(callbackId) {
        try {
            const callbackData = await this.getCallbackDetails(callbackId);
            if (!callbackData.success) {
                return { success: false, error: 'Failed to get callback data' };
            }
            
            const callback = callbackData.data.callbacks_by_pk;
            
            const prompt = `
You are a penetration testing assistant analyzing a Mythic callback.

Callback details:
- Agent: ${callback.payload_type?.ptname || 'Unknown'}
- Host: ${callback.host || 'Unknown'}
- User: ${callback.user || 'Unknown'}
- IP: ${callback.ip || 'Unknown'}
- OS: ${callback.os || 'Unknown'}
- Architecture: ${callback.architecture || 'Unknown'}
- Integrity Level: ${callback.integrity_level || 'Unknown'}
- Last Seen: ${callback.last_seen || 'Unknown'}
- Active: ${callback.active || false}
- Description: ${callback.description || 'None'}
- PID: ${callback.pid || 'Unknown'}
- PPID: ${callback.ppid || 'Unknown'}
- Domain: ${callback.domain || 'Unknown'}

Provide analysis including:
1. Current situation assessment
2. Privilege level analysis
3. Potential next steps
4. Security considerations
5. Recommendations for maintaining access

Format as JSON with fields: assessment (string), privilege_analysis (string), next_steps (array), security_considerations (array), recommendations (array)
            `;
            
            const response = await fetch(`${this.codeineUrl}/api/analyze-callback`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.groqKey}`
                },
                body: JSON.stringify({
                    prompt: prompt,
                    context: {
                        callback: callback,
                        mythic_url: this.mythicUrl
                    }
                })
            });
            
            if (response.ok) {
                return await response.json();
            }
            
            return { 
                success: false,
                error: 'Failed to analyze callback',
                status: response.status 
            };
        } catch (error) {
            console.error('[CodeineMythic] Error analyzing callback:', error);
            return { 
                success: false,
                error: error.message,
                message: 'Failed to analyze callback' 
            };
        }
    }
    
    // Batch operations with AI assistance
    async batchExecute(callbackIds, command, params = '') {
        try {
            const results = [];
            
            for (const callbackId of callbackIds) {
                const result = await this.createTask(callbackId, command, params);
                results.push({
                    callbackId: callbackId,
                    result: result
                });
            }
            
            // Get AI analysis of batch operation
            const prompt = `
You are a penetration testing assistant analyzing a batch operation.

Batch operation details:
- Command: ${command}
- Parameters: ${params}
- Targets: ${callbackIds.length} callbacks

Provide:
1. Summary of the batch operation
2. Potential impact
3. Risk assessment
4. Recommendations for monitoring

Format as JSON with fields: summary (string), impact (string), risk_assessment (string), recommendations (array)
            `;
            
            const response = await fetch(`${this.codeineUrl}/api/analyze-batch`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.groqKey}`
                },
                body: JSON.stringify({
                    prompt: prompt,
                    context: {
                        callback_ids: callbackIds,
                        command: command,
                        params: params,
                        mythic_url: this.mythicUrl
                    }
                })
            });
            
            const analysis = response.ok ? await response.json() : null;
            
            return {
                success: true,
                results: results,
                analysis: analysis
            };
        } catch (error) {
            console.error('[CodeineMythic] Error in batch execute:', error);
            return { 
                success: false,
                error: error.message,
                message: 'Failed to execute batch operation' 
            };
        }
    }
    
    // Get AI-powered operation summary
    async getOperationSummary(operationId) {
        try {
            const operationData = await this.getOperations();
            const operation = operationData.data?.operations?.find(op => op.id === operationId);
            
            if (!operation) {
                return { success: false, error: 'Operation not found' };
            }
            
            const callbacks = await this.getCallbacks();
            const operationCallbacks = callbacks.data?.callbacks?.filter(cb => cb.operation?.id === operationId) || [];
            
            const prompt = `
You are a penetration testing assistant generating an operation summary.

Operation details:
- Name: ${operation.name}
- Description: ${operation.description || 'None'}
- Completed: ${operation.completed || false}
- Number of callbacks: ${operationCallbacks.length}

Callback summary:
${operationCallbacks.map((cb, i) => `${i + 1}. ${cb.host || 'Unknown'} (${cb.user || 'Unknown'}@${cb.ip || 'Unknown'}) - ${cb.payload_type?.ptname || 'Unknown'}`).join('\n')}

Generate a comprehensive operation summary including:
1. Current status
2. Key achievements
3. Active access points
4. Recommendations for next steps
5. Risk assessment

Format as Markdown with appropriate headings.
            `;
            
            const response = await fetch(`${this.codeineUrl}/api/summarize-operation`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.groqKey}`
                },
                body: JSON.stringify({
                    prompt: prompt,
                    context: {
                        operation: operation,
                        callbacks: operationCallbacks,
                        mythic_url: this.mythicUrl
                    }
                })
            });
            
            if (response.ok) {
                return await response.json();
            }
            
            return { 
                success: false,
                error: 'Failed to generate operation summary',
                status: response.status 
            };
        } catch (error) {
            console.error('[CodeineMythic] Error getting operation summary:', error);
            return { 
                success: false,
                error: error.message,
                message: 'Failed to get operation summary' 
            };
        }
    }
    
    // Start real-time monitoring with AI
    startMonitoring(callbackIds = [], onEvent) {
        this.connectWebSocket();
        
        // Add listeners for all relevant events
        this.addListener('new_callback', (data) => {
            if (onEvent) onEvent({ type: 'new_callback', data });
        });
        
        this.addListener('callback_update', (data) => {
            if (onEvent) onEvent({ type: 'callback_update', data });
        });
        
        this.addListener('new_task', (data) => {
            if (onEvent) onEvent({ type: 'new_task', data });
        });
        
        this.addListener('task_update', (data) => {
            if (onEvent) onEvent({ type: 'task_update', data });
        });
        
        // If specific callbacks are provided, filter events
        if (callbackIds.length > 0) {
            const filter = (event) => {
                if (event.data && event.data.callback_id) {
                    return callbackIds.includes(event.data.callback_id);
                }
                return true;
            };
            
            this.addListener('new_callback', (data) => {
                if (filter({ data }) && onEvent) onEvent({ type: 'new_callback', data });
            });
            
            this.addListener('callback_update', (data) => {
                if (filter({ data }) && onEvent) onEvent({ type: 'callback_update', data });
            });
        }
        
        return {
            stop: () => {
                this.disconnectWebSocket();
                this.removeListener('new_callback');
                this.removeListener('callback_update');
                this.removeListener('new_task');
                this.removeListener('task_update');
            }
        };
    }
}

// Export for use in ATMA app
window.CodeineMythicIntegration = CodeineMythicIntegration;
