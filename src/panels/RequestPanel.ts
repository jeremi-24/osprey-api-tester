import * as vscode from 'vscode';
import axios from 'axios';

export class RequestPanel {
    public static currentPanel: RequestPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _extensionUri: vscode.Uri;

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [extensionUri]
        };
    }

    public static createOrShow(extensionUri: vscode.Uri, data: any) {
        const column = vscode.ViewColumn.Two;
        if (RequestPanel.currentPanel) {
            RequestPanel.currentPanel._panel.reveal(column);
            // On update avec les nouvelles données de base (route, method, etc)
            RequestPanel.currentPanel.update(data);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'apiTester',
            `Osprey: ${data.method} ${data.route}`,
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        RequestPanel.currentPanel = new RequestPanel(panel, extensionUri);
        RequestPanel.currentPanel.update(data);
    }


    public static updatePayload(payload: any) {
        if (RequestPanel.currentPanel) {
            const jsonString = JSON.stringify(payload, null, 2);
            RequestPanel.currentPanel._panel.webview.postMessage({
                command: 'updateBody',
                body: jsonString
            });
        }
    }

    public update(data: any) {
        this._panel.webview.html = this._getHtmlForWebview(data);
        this._setWebviewMessageListener();
    }

    private _setWebviewMessageListener() {
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'sendRequest':
                        await this._handleSendRequest(message);
                        break;
                    case 'alert':
                        vscode.window.showErrorMessage(message.text);
                        break;
                    case 'info':
                        vscode.window.showInformationMessage(message.text);
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    private async _handleSendRequest(message: any) {
        try {
            const headers: any = {};

            // 1. Content-Type automatique
            if (message.body && message.body.trim() !== '' && message.method !== 'GET' && message.method !== 'DELETE') {
                headers['Content-Type'] = 'application/json';
            }

            // 2. Auth Logic
            if (message.auth) {
                if (message.auth.type === 'basic' && message.auth.user) {
                    const b64 = Buffer.from(`${message.auth.user}:${message.auth.pass || ''}`).toString('base64');
                    headers['Authorization'] = `Basic ${b64}`;
                } else if (message.auth.type === 'bearer' && message.auth.token) {
                    headers['Authorization'] = `Bearer ${message.auth.token}`;
                }
            }

            // 3. Custom Headers
            if (message.headers) {
                message.headers.forEach((header: any) => {
                    if (header.key && header.key.trim() && header.enabled !== false) {
                        headers[header.key] = header.value || '';
                    }
                });
            }

            let url = message.url;
            const queryParams = message.queryParams
                ?.filter((p: any) => p.enabled !== false && p.key && p.key.trim())
                .map((p: any) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value || '')}`)
                .join('&');

            if (queryParams) {
                url += (url.includes('?') ? '&' : '?') + queryParams;
            }

            let data: any = undefined;
            if (message.body && message.body.trim() !== '' && ['POST', 'PUT', 'PATCH'].includes(message.method)) {
                try {
                    data = JSON.parse(message.body);
                } catch {
                    // Si le JSON est invalide, on envoie tel quel
                    data = message.body;
                }
            }

            const startTime = Date.now();
            const timeout = 10000;

            const response = await axios({
                method: message.method,
                url: url,
                data: data,
                headers: headers,
                timeout: timeout,
                validateStatus: () => true
            });
            const endTime = Date.now();

            let responseBody = response.data;
            if (typeof responseBody === 'object') {
                responseBody = JSON.stringify(responseBody, null, 2);
            } else if (typeof responseBody !== 'string') {
                responseBody = String(responseBody);
            }

            this._panel.webview.postMessage({
                command: 'response',
                success: true,
                status: response.status,
                statusText: response.statusText,
                data: responseBody,
                headers: this._formatHeaders(response.headers),
                time: endTime - startTime,
                size: this._formatSize(JSON.stringify(response.data || '').length)
            });
        } catch (error: any) {
            let errorMsg = error.message;
            let errorData = '';

            if (error.code === 'ECONNABORTED') {
                errorMsg = `Timeout (${error.timeout}ms) exceeded`;
            } else if (error.response) {
                errorData = JSON.stringify(error.response.data, null, 2);
            }

            this._panel.webview.postMessage({
                command: 'response',
                success: false,
                status: error.response?.status || 0,
                statusText: 'Error',
                data: errorData,
                message: errorMsg,
                time: 0,
                size: '0 B'
            });
        }
    }

    private _formatHeaders(headers: any): Array<{ key: string, value: string }> {
        return Object.entries(headers).map(([key, value]) => ({ key, value: String(value) }));
    }

    private _formatSize(bytes: number): string {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    private dispose() {
        RequestPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private _getHtmlForWebview(data: any) {
        const endpointData = {
            method: data.method || 'GET',
            route: data.route || '',
            baseUrl: 'http://localhost:3000',
            // Ici, on s'assure que data.payload (calculé avant) est utilisé
            defaultBody: data.payload ? JSON.stringify(data.payload, null, 2) : '{}',
            queryParams: data.queryParams || []
        };

        const fullUrl = `${endpointData.baseUrl}${endpointData.route}`.replace(/([^:]\/)\/+/g, "$1");
        const iconUri = this._panel.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'icon.png'));

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this._panel.webview.cspSource} https:; script-src 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com; style-src 'unsafe-inline' https://microsoft.github.io https://cdnjs.cloudflare.com; font-src https://microsoft.github.io https://cdnjs.cloudflare.com;">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Osprey API Tester</title>
    <link rel="stylesheet" href="https://microsoft.github.io/vscode-codicons/dist/codicon.css">
    
    <!-- LOAD MONACO EDITOR via CDN -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.min.js"></script>

    <style>
        :root {
            --tc-header-bg: var(--vscode-editor-background);
            --tc-border: var(--vscode-panel-border);
            --tc-input-bg: var(--vscode-input-background);
            --tc-blue: #007acc; 
            --tc-green: #4ade80;
            --tc-orange: #fb923c;
            --tc-red: #f87171;
            --tc-purple: #c084fc;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: var(--vscode-font-family);
            font-size: 13px;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        /* --- LAYOUT UTILS --- */
        .hidden { display: none !important; }
        .flex-col { display: flex; flex-direction: column; }
        .flex-1 { flex: 1; overflow: hidden; }

        /* --- HEADER --- */
        .header {
            display: flex;
            align-items: center;
            padding: 10px 16px;
            background: var(--vscode-editor-background);
            border-bottom: 1px solid var(--tc-border);
            gap: 10px;
            height: 60px;
        }
        .app-icon { width: 28px; height: 28px; object-fit: contain; }

        .url-group {
            display: flex;
            flex: 1;
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            height: 36px;
            background: var(--tc-input-bg);
            align-items: center;
        }

        /* METHOD SELECTOR */
        .custom-select { position: relative; height: 100%; min-width: 90px; cursor: pointer; border-right: 1px solid var(--vscode-input-border); }
        .select-trigger { height: 100%; display: flex; align-items: center; justify-content: space-between; padding: 0 10px; font-weight: 700; font-size: 13px; }
        .select-options { display: none; position: absolute; top: 100%; left: 0; width: 100%; background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-input-border); z-index: 100; }
        .select-options.open { display: block; }
        .option { padding: 8px 10px; font-weight: 600; cursor: pointer; }
        .option:hover { background: var(--vscode-list-hoverBackground); }
        .GET { color: var(--tc-green); } .POST { color: var(--tc-orange); } .PUT { color: var(--tc-blue); } .DELETE { color: var(--tc-red); }

        .url-input { flex: 1; background: transparent; border: none; padding: 0 12px; outline: none; font-family: 'Consolas', monospace; color: var(--vscode-input-foreground); }

        .send-btn {
            background: var(--tc-yellow); color: black; border: none; padding: 0 20px;
            font-weight: 600; cursor: pointer; border-radius: 4px; height: 36px;
            display: flex; align-items: center; gap: 6px;
        }
        .send-btn:hover { opacity: 0.9; }
        .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .menu-btn {
            background: transparent; color: var(--vscode-foreground); border: 1px solid var(--vscode-input-border);
            width: 36px; height: 36px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center;
        }
        .menu-btn:hover { background: var(--vscode-list-hoverBackground); }
        .menu-btn.active { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }

        /* --- TABS --- */
        .tabs { display: flex; border-bottom: 1px solid var(--tc-border); padding: 0 16px; }
        .tab { padding: 10px 16px; cursor: pointer; opacity: 0.7; border-bottom: 2px solid transparent; font-weight: 500; }
        .tab:hover { opacity: 1; }
        .tab.active { opacity: 1; border-bottom-color: var(--tc-blue); color: var(--tc-blue); }

        /* --- MONACO EDITOR CONTAINER --- */
        .monaco-wrapper { flex: 1; position: relative; overflow: hidden; padding-top: 5px; }
        #bodyEditorContainer, #responseEditorContainer { width: 100%; height: 100%; }

        /* --- TABLE & FORMS --- */
        .param-table { width: 100%; border-collapse: collapse; }
        .param-table th { text-align: left; padding: 6px 10px; font-size: 11px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--tc-border); }
        .param-table td { padding: 4px 10px; border-bottom: 1px solid var(--tc-border); }
        .param-input { width: 100%; background: transparent; border: none; color: var(--vscode-input-foreground); outline: none; font-family: 'Consolas', monospace; }

        /* --- HISTORY SIDEBAR --- */
        .history-panel {
            width: 250px; border-right: 1px solid var(--tc-border); background: var(--vscode-sideBar-background);
            display: none; flex-direction: column; overflow: hidden;
        }
        .history-panel.visible { display: flex; }
        .history-header { padding: 10px; font-weight: bold; border-bottom: 1px solid var(--tc-border); font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
        .history-list { flex: 1; overflow-y: auto; }
        .history-item {
            padding: 8px 10px; border-bottom: 1px solid var(--tc-border); cursor: pointer;
            display: flex; flex-direction: column; gap: 4px;
        }
        .history-item:hover { background: var(--vscode-list-hoverBackground); }
        .h-method { font-size: 10px; font-weight: bold; }
        .h-url { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.8; }
        .h-time { font-size: 10px; opacity: 0.5; text-align: right; }

        /* --- STATUS BAR --- */
        .status-bar { display: flex; padding: 6px 16px; border-bottom: 1px solid var(--tc-border); font-size: 12px; gap: 15px; }
        .status-val { font-weight: bold; }
        .status-val.success { color: var(--tc-green); }
        .status-val.error { color: var(--tc-red); }

        /* --- LOADER OVERLAY --- */
        .loader-overlay {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.3); z-index: 999; display: none;
            align-items: center; justify-content: center;
        }
        .loader-overlay.visible { display: flex; }
        .spinner {
            width: 30px; height: 30px; border: 3px solid rgba(255,255,255,0.3);
            border-radius: 50%; border-top-color: var(--tc-blue);
            animation: spin 1s ease-in-out infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

    </style>
</head>
<body>

    <!-- HISTORY PANEL -->
    <div style="display:flex; height:100vh; width:100vw;">
        
        <div class="history-panel" id="historyPanel">
            <div class="history-header">History (Last 20)</div>
            <div class="history-list" id="historyList">
                <!-- Items injected here -->
            </div>
        </div>

        <div style="flex:1; display:flex; flex-direction:column; min-width:0;">
            <!-- HEADER -->
            <div class="header">
                <img src="${iconUri}" alt="Osprey" class="app-icon">
                
                <div class="url-group">
                    <div class="custom-select" id="methodSelect" tabindex="0">
                        <div class="select-trigger" id="methodTrigger">
                            <span id="methodLabel" class="${endpointData.method}">${endpointData.method}</span>
                            <i class="codicon codicon-chevron-down"></i>
                        </div>
                        <div class="select-options" id="methodOptions">
                            <div class="option GET" onclick="setMethod('GET')">GET</div>
                            <div class="option POST" onclick="setMethod('POST')">POST</div>
                            <div class="option PUT" onclick="setMethod('PUT')">PUT</div>
                            <div class="option PATCH" onclick="setMethod('PATCH')">PATCH</div>
                            <div class="option DELETE" onclick="setMethod('DELETE')">DELETE</div>
                        </div>
                    </div>
                    <input type="text" class="url-input" id="urlInput" value="${fullUrl}" placeholder="http://...">
                </div>
                
                <button class="send-btn" id="sendBtn" onclick="sendRequest()">
                    <i class="codicon codicon-play"></i> Send
                </button>
                <button class="menu-btn" onclick="toggleHistory()" title="Toggle History">
                    <i class="codicon codicon-history"></i>
                </button>
            </div>

            <!-- MAIN CONTENT -->
            <div class="flex-1 flex-col" style="position:relative;">
                
                <!-- LOADER -->
                <div class="loader-overlay" id="loader">
                    <div class="spinner"></div>
                </div>

                <!-- REQUEST SECTION -->
                <div style="flex: 1; display: flex; flex-direction: column; border-bottom: 1px solid var(--tc-border);">
                    <div class="tabs">
                        <div class="tab" onclick="switchTab('query')">Query</div>
                        <div class="tab" onclick="switchTab('headers')">Headers</div>
                        <div class="tab" onclick="switchTab('auth')">Auth</div>
                        <div class="tab active" onclick="switchTab('body')">Body</div>
                    </div>

                    <div id="query-tab" class="tab-content hidden flex-1">
                        <!-- Query Params Table -->
                        <div style="overflow:auto; padding:10px;">
                            <table class="param-table">
                                <thead><tr><th width="30"></th><th>KEY</th><th>VALUE</th></tr></thead>
                                <tbody id="query-rows">
                                    ${endpointData.queryParams.map((p: any) => `
                                    <tr>
                                        <td><input type="checkbox" class="param-check" checked></td>
                                        <td><input type="text" class="param-input key" value="${p.key}"></td>
                                        <td><input type="text" class="param-input value" value="${p.value}"></td>
                                    </tr>`).join('')}
                                    <tr>
                                        <td><input type="checkbox" class="param-check" checked></td>
                                        <td><input type="text" class="param-input key" placeholder="New param"></td>
                                        <td><input type="text" class="param-input value"></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div id="headers-tab" class="tab-content hidden flex-1">
                        <div style="overflow:auto; padding:10px;">
                             <table class="param-table">
                                <thead><tr><th width="30"></th><th>KEY</th><th>VALUE</th></tr></thead>
                                <tbody id="header-rows">
                                    <tr>
                                        <td><input type="checkbox" class="param-check" checked></td>
                                        <td><input type="text" class="param-input key" value="Content-Type"></td>
                                        <td><input type="text" class="param-input value" value="application/json"></td>
                                    </tr>
                                    <tr>
                                        <td><input type="checkbox" class="param-check" checked></td>
                                        <td><input type="text" class="param-input key" placeholder="New header"></td>
                                        <td><input type="text" class="param-input value"></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div id="auth-tab" class="tab-content hidden flex-1" style="padding:20px;">
                        <div style="display:flex; gap:15px; margin-bottom:15px;">
                            <label><input type="radio" name="authType" value="none" checked onchange="toggleAuth()"> None</label>
                            <label><input type="radio" name="authType" value="basic" onchange="toggleAuth()"> Basic</label>
                            <label><input type="radio" name="authType" value="bearer" onchange="toggleAuth()"> Bearer</label>
                        </div>
                        <div id="basic-fields" class="hidden">
                            <input type="text" id="auth-user" class="param-input" placeholder="Username" style="border:1px solid var(--tc-border); padding:8px; margin-bottom:10px;">
                            <input type="password" id="auth-pass" class="param-input" placeholder="Password" style="border:1px solid var(--tc-border); padding:8px;">
                        </div>
                        <div id="bearer-fields" class="hidden">
                             <input type="text" id="auth-token" class="param-input" placeholder="Token (ey...)" style="border:1px solid var(--tc-border); padding:8px;">
                        </div>
                    </div>

                    <div id="body-tab" class="tab-content flex-1 flex-col">
                        <div class="monaco-wrapper">
                            <div id="bodyEditorContainer"></div>
                        </div>
                    </div>
                </div>

                <!-- RESPONSE SECTION -->
                <div style="height: 50%; display: flex; flex-direction: column;">
                     <div class="status-bar">
                        <div style="flex:1; display:flex; gap:15px;">
                            <span>Status: <span id="statusVal" class="status-val">-</span></span>
                            <span>Time: <span id="timeVal">-</span></span>
                            <span>Size: <span id="sizeVal">-</span></span>
                        </div>
                    </div>
                    <div class="monaco-wrapper">
                         <div id="responseEditorContainer"></div>
                    </div>
                </div>

            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let bodyEditor, responseEditor;
        let currentMethod = '${endpointData.method}';
        
        // --- 1. INITIALIZE MONACO EDITOR ---
        require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }});
        require(['vs/editor/editor.main'], function() {
            
            // Editor Options for VSCode feel
            const commonOptions = {
                theme: 'vs-dark',
                automaticLayout: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 13,
                fontFamily: 'Consolas, monospace',
                lineNumbersMinChars: 3,
            };

            // Body Editor (Editable)
            bodyEditor = monaco.editor.create(document.getElementById('bodyEditorContainer'), {
                value: ${JSON.stringify(endpointData.defaultBody)},
                language: 'json',
                ...commonOptions
            });

            // Response Editor (Read Only)
            responseEditor = monaco.editor.create(document.getElementById('responseEditorContainer'), {
                value: '// Response will appear here...',
                language: 'json',
                readOnly: true,
                ...commonOptions
            });

            // Format Body on Load
            setTimeout(() => {
                bodyEditor.getAction('editor.action.formatDocument').run();
            }, 500);
        });

        // --- 2. TABS & UI ---
        function switchTab(tab) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            
            event.target.classList.add('active');
            const content = document.getElementById(tab + '-tab');
            content.classList.remove('hidden');
            
            if (tab === 'body' && bodyEditor) bodyEditor.layout();
        }

        // Method Selector
        const methodSelect = document.getElementById('methodSelect');
        const methodOptions = document.getElementById('methodOptions');
        const methodLabel = document.getElementById('methodLabel');
        
        methodSelect.addEventListener('click', () => methodOptions.classList.toggle('open'));
        document.addEventListener('click', (e) => { if (!methodSelect.contains(e.target)) methodOptions.classList.remove('open'); });
        
        function setMethod(m) {
            currentMethod = m;
            methodLabel.textContent = m;
            methodLabel.className = m;
        }

        function toggleAuth() {
            const type = document.querySelector('input[name="authType"]:checked').value;
            document.getElementById('basic-fields').classList.toggle('hidden', type !== 'basic');
            document.getElementById('bearer-fields').classList.toggle('hidden', type !== 'bearer');
        }

        function toggleHistory() {
            document.getElementById('historyPanel').classList.toggle('visible');
            document.querySelector('.menu-btn').classList.toggle('active');
            if (bodyEditor) setTimeout(() => bodyEditor.layout(), 200);
        }

        // --- 3. SEND REQUEST LOGIC ---
        function sendRequest() {
            const url = document.getElementById('urlInput').value;
            const body = bodyEditor ? bodyEditor.getValue() : '';
            
            // Build Params & Headers (Scraping DOM)
            const queryParams = [];
            document.querySelectorAll('#query-rows tr').forEach(row => {
                const k = row.querySelector('.key').value;
                const v = row.querySelector('.value').value;
                const c = row.querySelector('.param-check');
                if (c && c.checked && k) queryParams.push({ key: k, value: v, enabled: true });
            });

            const headers = [];
            document.querySelectorAll('#header-rows tr').forEach(row => {
                const k = row.querySelector('.key').value;
                const v = row.querySelector('.value').value;
                const c = row.querySelector('.param-check');
                if (c && c.checked && k) headers.push({ key: k, value: v, enabled: true });
            });

            const authType = document.querySelector('input[name="authType"]:checked').value;
            let auth = null;
            if (authType === 'basic') auth = { type: 'basic', user: document.getElementById('auth-user').value, pass: document.getElementById('auth-pass').value };
            if (authType === 'bearer') auth = { type: 'bearer', token: document.getElementById('auth-token').value };

            // UI Feedback
            document.getElementById('loader').classList.add('visible');
            document.getElementById('sendBtn').disabled = true;

            // Save History
            addToHistory(currentMethod, url);

            vscode.postMessage({
                command: 'sendRequest',
                method: currentMethod,
                url, body, queryParams, headers, auth
            });
        }

        // --- 4. HISTORY MANAGEMENT (LocalStorage) ---
        function loadHistory() {
            const hist = JSON.parse(localStorage.getItem('osprey_history') || '[]');
            const list = document.getElementById('historyList');
            list.innerHTML = '';
            
            hist.forEach(item => {
                const el = document.createElement('div');
                el.className = 'history-item';
                el.innerHTML = \`<span class="h-method \${item.method}">\${item.method}</span><span class="h-url">\${item.url}</span><span class="h-time">\${new Date(item.date).toLocaleTimeString()}</span>\`;
                el.onclick = () => {
                    document.getElementById('urlInput').value = item.url;
                    setMethod(item.method);
                    // On ne restaure pas le body complet ici par simplicité, mais on pourrait
                };
                list.appendChild(el);
            });
        }

        function addToHistory(method, url) {
            const hist = JSON.parse(localStorage.getItem('osprey_history') || '[]');
            hist.unshift({ method, url, date: Date.now() });
            if (hist.length > 20) hist.pop();
            localStorage.setItem('osprey_history', JSON.stringify(hist));
            loadHistory();
        }

        // Init History
        loadHistory();

        // --- 5. RESPONSE HANDLER & DYNAMIC UPDATES ---
        window.addEventListener('message', event => {
            const msg = event.data;
            
            // --- UPDATE BODY PAYLOAD (NEW) ---
            if (msg.command === 'updateBody') {
                if (bodyEditor) {
                    bodyEditor.setValue(msg.body);
                    // Auto-format
                    setTimeout(() => {
                        bodyEditor.getAction('editor.action.formatDocument').run();
                    }, 100);
                }
                return; // Stop processing other types
            }

            // Stop Loader
            document.getElementById('loader').classList.remove('visible');
            document.getElementById('sendBtn').disabled = false;

            if (msg.command === 'response') {
                const statusEl = document.getElementById('statusVal');
                statusEl.textContent = msg.status + ' ' + msg.statusText;
                statusEl.className = 'status-val ' + (msg.success ? 'success' : 'error');
                
                document.getElementById('timeVal').textContent = msg.time + ' ms';
                document.getElementById('sizeVal').textContent = msg.size;

                if (responseEditor) {
                    responseEditor.setValue(msg.data);
                    // Auto-format response
                    setTimeout(() => {
                        responseEditor.getAction('editor.action.formatDocument').run();
                    }, 100);
                }
            }
        });

        // --- 6. SHORTCUTS ---
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                sendRequest();
            }
        });

    </script>
</body>
</html>`;
    }
}