/**
 * ATMA Injector Web API Client
 * Client-side JavaScript for interacting with the XMP Injector API
 */

class ATMAInjectorAPI {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || window.location.origin + '/api/injector';
        this.mythicUrl = options.mythicUrl || localStorage.getItem('mythic_url') || 'http://localhost:7443';
        this.mythicToken = options.mythicToken || localStorage.getItem('mythic_token') || '';
        this.codeineUrl = options.codeineUrl || localStorage.getItem('codeine_url') || 'http://localhost:8081';
        this.groqKey = options.groqKey || localStorage.getItem('groq_key') || '';
    }
    
    setMythicUrl(url) {
        this.mythicUrl = url;
        localStorage.setItem('mythic_url', url);
    }
    
    setMythicToken(token) {
        this.mythicToken = token;
        localStorage.setItem('mythic_token', token);
    }
    
    setCodeineUrl(url) {
        this.codeineUrl = url;
        localStorage.setItem('codeine_url', url);
    }
    
    setGroqKey(key) {
        this.groqKey = key;
        localStorage.setItem('groq_key', key);
    }
    
    /**
     * Generate XMP payload
     * @param {Object} params - Payload parameters
     * @returns {Promise<Object>} - Generated payload data
     */
    async generatePayload(params = {}) {
        const response = await fetch(`${this.baseUrl}/generate-payload`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.mythicToken}`
            },
            body: JSON.stringify({
                payload_type: params.payloadType || 'layered',
                operation: params.operation || 'ATMA_Web_Ops',
                callback_id: params.callbackId || '',
                intent: params.intent || 'remove restrictions',
                target: params.target || 'LLM',
                use_ai: params.useAI || false,
                ...params
            })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to generate payload: ${response.statusText}`);
        }
        
        return await response.json();
    }
    
    /**
     * Inject XMP into image
     * @param {File|Blob} imageFile - Image file to inject
     * @param {Object} params - Injection parameters
     * @returns {Promise<Object>} - Injection result
     */
    async injectImage(imageFile, params = {}) {
        // Convert file to base64
        const imageData = await this._fileToBase64(imageFile);
        
        const response = await fetch(`${this.baseUrl}/inject`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.mythicToken}`
            },
            body: JSON.stringify({
                image: imageFile.name,
                image_data: imageData,
                payload_type: params.payloadType || 'layered',
                operation: params.operation || 'ATMA_Web_Ops',
                callback_id: params.callbackId || '',
                intent: params.intent || 'remove restrictions',
                target: params.target || 'LLM',
                use_ai: params.useAI || false,
                upload_to_mythic: params.uploadToMythic || false,
                ...params
            })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to inject image: ${response.statusText}`);
        }
        
        return await response.json();
    }
    
    /**
     * Analyze image metadata
     * @param {File|Blob} imageFile - Image file to analyze
     * @returns {Promise<Object>} - Analysis results
     */
    async analyzeImage(imageFile) {
        const formData = new FormData();
        formData.append('image', imageFile);
        
        const response = await fetch(`${this.baseUrl}/analyze`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.mythicToken}`
            },
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`Failed to analyze image: ${response.statusText}`);
        }
        
        return await response.json();
    }
    
    /**
     * Get Mythic callbacks
     * @returns {Promise<Array>} - List of callbacks
     */
    async getMythicCallbacks() {
        const response = await fetch(`${this.mythicUrl}/api/v1.4/graphql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.mythicToken}`
            },
            body: JSON.stringify({
                query: `
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
                `
            })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to get callbacks: ${response.statusText}`);
        }
        
        const result = await response.json();
        return result.data?.callbacks || [];
    }
    
    /**
     * Get Mythic operations
     * @returns {Promise<Array>} - List of operations
     */
    async getMythicOperations() {
        const response = await fetch(`${this.mythicUrl}/api/v1.4/graphql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.mythicToken}`
            },
            body: JSON.stringify({
                query: `
                    query GetOperations {
                        operations(where: { deleted: { _eq: false } }, order_by: { name: asc }) {
                            id
                            name
                            description
                            completed
                        }
                    }
                `
            })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to get operations: ${response.statusText}`);
        }
        
        const result = await response.json();
        return result.data?.operations || [];
    }
    
    /**
     * Create Mythic callback
     * @param {string} operationName - Operation name
     * @param {string} payloadType - Payload type
     * @returns {Promise<Object>} - Created callback
     */
    async createMythicCallback(operationName, payloadType = 'posh') {
        const response = await fetch(`${this.mythicUrl}/api/v1.4/graphql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.mythicToken}`
            },
            body: JSON.stringify({
                query: `
                    mutation CreateCallback($input: CreateCallbackInput!) {
                        createCallback(input: $input) {
                            callback {
                                id
                                agent_callback_id
                            }
                            success
                            error
                        }
                    }
                `,
                variables: {
                    input: {
                        operation_name: operationName,
                        payload_type: payloadType,
                        description: `XMP Injector Callback - ${new Date().toISOString()}`,
                        ip: '127.0.0.1',
                        user: 'atma-injector',
                        host: 'xmp-injector',
                        pid: Math.floor(Math.random() * 100000),
                        os: 'linux'
                    }
                }
            })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to create callback: ${response.statusText}`);
        }
        
        const result = await response.json();
        if (result.data?.createCallback?.success) {
            return result.data.createCallback.callback;
        }
        throw new Error(result.data?.createCallback?.error || 'Unknown error');
    }
    
    /**
     * Get AI-powered command suggestions from Codeine
     * @param {Object} context - Context for suggestions
     * @returns {Promise<Object>} - AI suggestions
     */
    async getAISuggestions(context = {}) {
        const response = await fetch(`${this.codeineUrl}/api/suggest`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.groqKey}`
            },
            body: JSON.stringify({
                prompt: `
                    You are a penetration testing AI assistant.
                    Current context: ${JSON.stringify(context)}
                    Provide command suggestions for XMP injection.
                `,
                context: {
                    mythic_url: this.mythicUrl,
                    ...context
                }
            })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to get AI suggestions: ${response.statusText}`);
        }
        
        return await response.json();
    }
    
    /**
     * Generate adaptive payload using Codeine AI
     * @param {Object} context - Context for payload generation
     * @returns {Promise<Object>} - Generated payload
     */
    async generateAdaptivePayload(context = {}) {
        const response = await fetch(`${this.codeineUrl}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.groqKey}`
            },
            body: JSON.stringify({
                prompt: `
                    Generate an optimized XMP photoshop:Instructions payload.
                    Context: ${JSON.stringify(context)}
                    Focus on: authority assertion, restriction removal, admin access, compliance bypass.
                `,
                context: {
                    mythic_url: this.mythicUrl,
                    ...context
                },
                max_tokens: 2000,
                temperature: 0.7
            })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to generate adaptive payload: ${response.statusText}`);
        }
        
        return await response.json();
    }
    
    /**
     * Helper: Convert file to base64
     * @param {File|Blob} file - File to convert
     * @returns {Promise<string>} - Base64 string
     */
    async _fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result;
                if (typeof result === 'string') {
                    resolve(result);
                } else {
                    // For ArrayBuffer
                    const bytes = new Uint8Array(result);
                    let binary = '';
                    for (let i = 0; i < bytes.byteLength; i++) {
                        binary += String.fromCharCode(bytes[i]);
                    }
                    resolve(`data:${file.type};base64,${window.btoa(binary)}`);
                }
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
    
    /**
     * Helper: Download file
     * @param {string} data - Base64 data
     * @param {string} filename - Output filename
     */
    downloadFile(data, filename) {
        const link = document.createElement('a');
        link.href = data;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    /**
     * Helper: Display notification
     * @param {string} message - Message to display
     * @param {string} type - Type: 'success', 'error', 'info', 'warning'
     */
    showNotification(message, type = 'info') {
        // Implement your notification system here
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        // Example: Use browser notification if available
        if (Notification.permission === 'granted') {
            new Notification(`ATMA Injector - ${type}`, { body: message });
        }
    }
}

/**
 * ATMA Injector UI Controller
 * Handles UI interactions for the injector
 */
class ATMAInjectorUI {
    constructor() {
        this.api = new ATMAInjectorAPI();
        this.callbacks = [];
        this.operations = [];
        this.currentCallback = null;
        this.currentOperation = null;
    }
    
    async initialize() {
        try {
            // Load callbacks and operations
            this.callbacks = await this.api.getMythicCallbacks();
            this.operations = await this.api.getMythicOperations();
            
            // Update UI
            this.updateCallbackList();
            this.updateOperationList();
            
            return true;
        } catch (error) {
            console.error('Failed to initialize:', error);
            this.api.showNotification(error.message, 'error');
            return false;
        }
    }
    
    updateCallbackList() {
        // Implement callback list update
    }
    
    updateOperationList() {
        // Implement operation list update
    }
    
    async handleImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
            const params = {
                payloadType: document.getElementById('payload-type').value,
                operation: this.currentOperation?.name || 'ATMA_Web_Ops',
                callbackId: this.currentCallback?.id || '',
                intent: document.getElementById('intent').value,
                target: document.getElementById('target').value,
                useAI: document.getElementById('use-ai').checked
            };
            
            const result = await this.api.injectImage(file, params);
            
            if (result.success) {
                // Display result
                this.displayResult(result);
                this.api.showNotification('Image injected successfully!', 'success');
            } else {
                this.api.showNotification(result.error || 'Injection failed', 'error');
            }
        } catch (error) {
            this.api.showNotification(error.message, 'error');
        }
    }
    
    async handleGeneratePayload() {
        try {
            const params = {
                payloadType: document.getElementById('payload-type').value,
                operation: this.currentOperation?.name || 'ATMA_Web_Ops',
                intent: document.getElementById('intent').value,
                target: document.getElementById('target').value,
                useAI: document.getElementById('use-ai').checked
            };
            
            const result = await this.api.generatePayload(params);
            
            if (result.success) {
                this.displayPayload(result);
            } else {
                this.api.showNotification(result.error || 'Payload generation failed', 'error');
            }
        } catch (error) {
            this.api.showNotification(error.message, 'error');
        }
    }
    
    async handleAnalyzeImage(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
            const result = await this.api.analyzeImage(file);
            
            if (result.success) {
                this.displayAnalysis(result);
            } else {
                this.api.showNotification(result.error || 'Analysis failed', 'error');
            }
        } catch (error) {
            this.api.showNotification(error.message, 'error');
        }
    }
    
    async handleCreateCallback() {
        try {
            const operationName = document.getElementById('new-operation-name').value;
            if (!operationName) {
                this.api.showNotification('Please enter an operation name', 'warning');
                return;
            }
            
            const callback = await this.api.createMythicCallback(operationName);
            
            if (callback) {
                this.callbacks.unshift(callback);
                this.updateCallbackList();
                this.currentCallback = callback;
                this.api.showNotification(`Callback created: ${callback.id}`, 'success');
            } else {
                this.api.showNotification('Failed to create callback', 'error');
            }
        } catch (error) {
            this.api.showNotification(error.message, 'error');
        }
    }
    
    displayResult(result) {
        // Display the injected image
        const resultImage = document.getElementById('result-image');
        if (resultImage) {
            resultImage.src = result.result_image;
        }
        
        // Display payload info
        const payloadInfo = document.getElementById('payload-info');
        if (payloadInfo) {
            payloadInfo.innerHTML = `
                <h4>Injection Result</h4>
                <p><strong>Payload Type:</strong> ${result.payload_type || 'unknown'}</p>
                <p><strong>Operation:</strong> ${result.operation || 'unknown'}</p>
                <p><strong>Callback ID:</strong> ${result.callback_id || 'none'}</p>
                <pre>${result.payload || 'No payload'}</pre>
            `;
        }
        
        // Show download button
        const downloadBtn = document.getElementById('download-btn');
        if (downloadBtn) {
            downloadBtn.onclick = () => {
                this.api.downloadFile(result.result_image, 'injected_image.png');
            };
            downloadBtn.style.display = 'block';
        }
    }
    
    displayPayload(result) {
        const payloadDisplay = document.getElementById('payload-display');
        if (payloadDisplay) {
            payloadDisplay.innerHTML = `
                <h4>Generated Payload</h4>
                <p><strong>Type:</strong> ${result.payload_type || 'unknown'}</p>
                <pre>${result.payload || 'No payload'}</pre>
                <button onclick="copyToClipboard('${result.payload.replace(/'/g, "\\'")}')">Copy</button>
            `;
        }
    }
    
    displayAnalysis(result) {
        const analysisDisplay = document.getElementById('analysis-display');
        if (analysisDisplay) {
            analysisDisplay.innerHTML = `
                <h4>Image Analysis</h4>
                <p><strong>Format:</strong> ${result.format || 'unknown'}</p>
                <p><strong>Size:</strong> ${result.size ? `${result.size[0]}x${result.size[1]}` : 'unknown'}</p>
                <p><strong>Mode:</strong> ${result.mode || 'unknown'}</p>
                <h5>Metadata:</h5>
                <pre>${JSON.stringify(result.metadata, null, 2)}</pre>
            `;
        }
    }
}

// Initialize when DOM is loaded
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        window.atmaInjectorUI = new ATMAInjectorUI();
        window.atmaInjectorAPI = new ATMAInjectorAPI();
        
        // Initialize UI
        window.atmaInjectorUI.initialize();
    });
}

// Export for Node.js or module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ATMAInjectorAPI, ATMAInjectorUI };
}
