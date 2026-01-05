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
            RequestPanel.currentPanel.update(data);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'apiTester',
            `Osprey: ${data.method} ${data.route}`,
            column,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        RequestPanel.currentPanel = new RequestPanel(panel, extensionUri);
        RequestPanel.currentPanel.update(data);
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
                }
            },
            null,
            this._disposables
        );
    }

    private async _handleSendRequest(message: any) {
        try {
            const headers: any = {};
            if (message.body && message.body.trim() !== '' && message.method !== 'GET') {
                headers['Content-Type'] = 'application/json';
            }
            if (message.headers) {
                message.headers.forEach((header: any) => {
                    if (header.key && header.key.trim() && header.enabled !== false) {
                        headers[header.key] = header.value || '';
                    }
                });
            }

            let url = message.url;
            // Gestion basique des query params
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
                    data = message.body;
                }
            }

            const startTime = Date.now();
            const response = await axios({
                method: message.method,
                url: url,
                data: data,
                headers: headers,
                validateStatus: () => true
            });
            const endTime = Date.now();

            let responseBody = response.data;
            if (typeof responseBody === 'object') {
                responseBody = JSON.stringify(responseBody, null, 2);
            }

            this._panel.webview.postMessage({
                command: 'response',
                status: response.status,
                statusText: response.statusText,
                data: responseBody,
                headers: this._formatHeaders(response.headers),
                time: endTime - startTime,
                size: this._formatSize(JSON.stringify(response.data || '').length)
            });
        } catch (error: any) {
            this._panel.webview.postMessage({
                command: 'error',
                message: error.message,
                data: error.response?.data ? JSON.stringify(error.response.data, null, 2) : ''
            });
        }
    }

    private _formatHeaders(headers: any): Array<{key: string, value: string}> {
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
            baseUrl: 'http://localhost:3000', // Tu peux rendre ça dynamique via config
            defaultBody: data.payload ? JSON.stringify(data.payload, null, 2) : '{}',
            queryParams: data.queryParams || []
        };

        // Combine base URL + route cleaning
        const fullUrl = `${endpointData.baseUrl}${endpointData.route}`.replace(/([^:]\/)\/+/g, "$1");

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Osprey API Tester</title>
    <link rel="stylesheet" href="https://microsoft.github.io/vscode-codicons/dist/codicon.css">
    <style>
        :root {
            --tc-header-bg: var(--vscode-editor-background);
            --tc-border: var(--vscode-panel-border);
            --tc-input-bg: var(--vscode-input-background);
            --tc-blue: #007acc; 
            --tc-green: #4ade80;
            --tc-red: #f87171;
            --tc-tab-active-border: var(--tc-blue);
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: var(--vscode-font-family);
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        /* --- HEADER (URL Bar) --- */
        .header {
            display: flex;
            padding: 10px;
            background: var(--vscode-editor-background);
            border-bottom: 1px solid var(--tc-border);
            gap: 0;
            height: 50px;
        }

        .url-group {
            display: flex;
            flex: 1;
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            overflow: hidden;
        }

        .method-select {
            background: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: none;
            border-right: 1px solid var(--vscode-input-border);
            padding: 0 12px;
            height: 100%;
            font-weight: 600;
            outline: none;
            cursor: pointer;
            appearance: none; 
            min-width: 80px;
            text-align: center;
        }

        .url-input {
            flex: 1;
            background: var(--tc-input-bg);
            color: var(--vscode-input-foreground);
            border: none;
            padding: 0 12px;
            outline: none;
            font-family: 'Consolas', monospace;
            font-size: 13px;
        }

        .send-btn {
            background: var(--tc-blue);
            color: white;
            border: none;
            padding: 0 20px;
            font-weight: 600;
            cursor: pointer;
            margin-left: 10px;
            border-radius: 2px;
        }
        .send-btn:hover { opacity: 0.9; }

        /* --- TABS --- */
        .tabs {
            display: flex;
            border-bottom: 1px solid var(--tc-border);
            padding: 0 10px;
            background: var(--vscode-editor-background);
        }
        .tab {
            padding: 10px 16px;
            cursor: pointer;
            font-size: 12px;
            opacity: 0.8;
            border-bottom: 2px solid transparent;
            text-transform: capitalize;
        }
        .tab:hover { opacity: 1; }
        .tab.active {
            opacity: 1;
            border-bottom-color: var(--tc-tab-active-border);
            color: var(--tc-tab-active-border);
        }

        /* --- MAIN CONTENT LAYOUT --- */
        .split-view {
            display: flex;
            flex-direction: column;
            flex: 1;
            overflow: hidden;
        }

        .request-section {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            border-bottom: 4px solid var(--tc-border); /* Resizer simulation */
        }

        .response-section {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            background: var(--vscode-editor-background);
        }

        /* --- CONTENT AREAS --- */
        .tab-content { display: none; flex: 1; flex-direction: column; overflow: hidden; }
        .tab-content.active { display: flex; }

        /* Sub-tabs for Body (JSON, XML...) */
        .sub-tabs {
            display: flex;
            gap: 10px;
            padding: 6px 10px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            border-bottom: 1px solid var(--tc-border);
        }
        .sub-tab { cursor: pointer; opacity: 0.6; font-weight: bold; }
        .sub-tab.active { opacity: 1; color: var(--tc-blue); }

        /* --- EDITORS --- */
        .editor-wrapper {
            position: relative;
            flex: 1;
            display: flex;
            background: var(--vscode-editor-background);
            overflow: hidden;
        }

        .line-numbers {
            width: 40px;
            background: var(--vscode-editor-background);
            color: var(--vscode-editorLineNumber-foreground);
            text-align: right;
            padding: 10px 5px;
            font-family: 'Consolas', monospace;
            font-size: 13px;
            line-height: 1.5;
            border-right: 1px solid var(--tc-border);
            user-select: none;
        }

        .code-editor {
            flex: 1;
            background: transparent;
            color: var(--vscode-editor-foreground);
            border: none;
            resize: none;
            padding: 10px;
            font-family: 'Consolas', monospace;
            font-size: 13px;
            line-height: 1.5;
            outline: none;
            white-space: pre;
            overflow: auto;
        }

        /* Readonly response editor specific */
        .response-view {
            flex: 1;
            padding: 10px;
            font-family: 'Consolas', monospace;
            font-size: 13px;
            line-height: 1.5;
            overflow: auto;
            white-space: pre;
            color: #CE9178; /* Simple JSON coloring sim */
        }
        .key { color: #9CDCFE; }
        .string { color: #CE9178; }
        .number { color: #B5CEA8; }
        .boolean { color: #569CD6; }
        .null { color: #569CD6; }

        /* --- RESPONSE STATUS BAR --- */
        .status-bar {
            display: flex;
            align-items: center;
            padding: 6px 15px;
            border-bottom: 1px solid var(--tc-border);
            font-size: 12px;
            font-family: var(--vscode-font-family);
            background: var(--vscode-editor-background);
        }

        .status-item {
            margin-right: 20px;
            display: flex;
            gap: 5px;
        }

        .status-val { font-weight: bold; }
        .status-val.success { color: var(--tc-green); }
        .status-val.error { color: var(--tc-red); }
        .label { color: var(--vscode-descriptionForeground); }

        /* --- TABLE STYLES (Headers/Query) --- */
        .param-table { width: 100%; border-collapse: collapse; }
        .param-table th { 
            text-align: left; padding: 6px 10px; 
            font-size: 11px; color: var(--vscode-descriptionForeground); 
            border-bottom: 1px solid var(--tc-border);
        }
        .param-table td { padding: 4px 10px; border-bottom: 1px solid var(--tc-border); }
        .param-input {
            width: 100%; background: transparent; border: none;
            color: var(--vscode-input-foreground); outline: none;
            font-family: 'Consolas', monospace;
        }
        .param-check { cursor: pointer; }

    </style>
</head>
<body>

    <!-- HEADER -->
    <div class="header">
        <div class="url-group">
            <select class="method-select" id="methodSelect">
                <option value="GET" ${endpointData.method === 'GET' ? 'selected' : ''}>GET</option>
                <option value="POST" ${endpointData.method === 'POST' ? 'selected' : ''}>POST</option>
                <option value="PUT" ${endpointData.method === 'PUT' ? 'selected' : ''}>PUT</option>
                <option value="DELETE" ${endpointData.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
                <option value="PATCH" ${endpointData.method === 'PATCH' ? 'selected' : ''}>PATCH</option>
            </select>
            <input type="text" class="url-input" id="urlInput" value="${fullUrl}">
        </div>
        <button class="send-btn" onclick="sendRequest()">Send</button>
    </div>

    <!-- MAIN SPLIT VIEW -->
    <div class="split-view">
        
        <!-- REQUEST SECTION -->
        <div class="request-section">
            <div class="tabs">
                <div class="tab" onclick="switchTab('query')">Query</div>
                <div class="tab" onclick="switchTab('headers')">Headers</div>
                <div class="tab" onclick="switchTab('auth')">Auth</div>
                <div class="tab active" onclick="switchTab('body')">Body</div>
            </div>

            <!-- QUERY PARAMS -->
            <div id="query-tab" class="tab-content">
                <table class="param-table">
                    <thead><tr><th width="30"></th><th>KEY</th><th>VALUE</th></tr></thead>
                    <tbody id="query-rows">
                         ${endpointData.queryParams.map((p: any) => `
                            <tr>
                                <td><input type="checkbox" class="param-check" checked></td>
                                <td><input type="text" class="param-input key" value="${p.key}"></td>
                                <td><input type="text" class="param-input value" value="${p.value}"></td>
                            </tr>
                        `).join('')}
                        <tr>
                            <td><input type="checkbox" class="param-check" checked></td>
                            <td><input type="text" class="param-input key" placeholder="New param"></td>
                            <td><input type="text" class="param-input value"></td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- HEADERS -->
            <div id="headers-tab" class="tab-content">
                <table class="param-table">
                    <thead><tr><th width="30"></th><th>KEY</th><th>VALUE</th></tr></thead>
                    <tbody id="header-rows">
                        <tr>
                            <td><input type="checkbox" class="param-check" checked></td>
                            <td><input type="text" class="param-input key" value="Content-Type"></td>
                            <td><input type="text" class="param-input value" value="application/json"></td>
                        </tr>
                    </tbody>
                </table>
            </div>

             <!-- AUTH (Placeholder) -->
            <div id="auth-tab" class="tab-content" style="padding: 20px; color: var(--vscode-descriptionForeground);">
                Basic / Bearer Auth coming soon. Use Headers for now.
            </div>

            <!-- BODY -->
            <div id="body-tab" class="tab-content active">
                <div class="sub-tabs">
                    <div class="sub-tab active">JSON</div>
                    <div class="sub-tab">XML</div>
                    <div class="sub-tab">Text</div>
                    <div class="sub-tab">Form</div>
                </div>
                <div class="editor-wrapper">
                    <div class="line-numbers" id="bodyLineNumbers">1</div>
                    <textarea class="code-editor" id="bodyInput" spellcheck="false" oninput="updateLineNumbers('bodyInput', 'bodyLineNumbers')">${endpointData.defaultBody}</textarea>
                </div>
            </div>
        </div>

        <!-- RESPONSE SECTION -->
        <div class="response-section">
            <div class="status-bar">
                <div class="status-item">
                    <span class="label">Status:</span>
                    <span class="status-val" id="statusVal">-</span>
                </div>
                <div class="status-item">
                    <span class="label">Time:</span>
                    <span class="status-val" id="timeVal">-</span>
                </div>
                <div class="status-item">
                    <span class="label">Size:</span>
                    <span class="status-val" id="sizeVal">-</span>
                </div>
            </div>
            
            <div class="editor-wrapper">
                <div class="response-view" id="responseOutput"></div>
            </div>
        </div>

    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // --- TAB SWITCHING ---
        function switchTab(tabName) {
            // UI Update
            document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
            event.target.classList.add('active');

            // Content Update
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            const target = document.getElementById(tabName + '-tab');
            if(target) target.classList.add('active');
        }

        // --- LINE NUMBERS SYNC ---
        function updateLineNumbers(textareaId, numbersId) {
            const textarea = document.getElementById(textareaId);
            const lines = textarea.value.split('\\n').length;
            document.getElementById(numbersId).innerHTML = Array(lines).fill(0).map((_, i) => i + 1).join('<br>');
        }

        // Init line numbers
        updateLineNumbers('bodyInput', 'bodyLineNumbers');

        // --- SEND REQUEST ---
        function sendRequest() {
            const method = document.getElementById('methodSelect').value;
            const url = document.getElementById('urlInput').value;
            const body = document.getElementById('bodyInput').value;
            
            // Collect Query Params
            const queryParams = [];
            document.querySelectorAll('#query-rows tr').forEach(row => {
                const check = row.querySelector('.param-check');
                const key = row.querySelector('.key').value;
                const val = row.querySelector('.value').value;
                if(check && check.checked && key) {
                    queryParams.push({ key, value: val, enabled: true });
                }
            });

            // Collect Headers
            const headers = [];
            document.querySelectorAll('#header-rows tr').forEach(row => {
                const check = row.querySelector('.param-check');
                const key = row.querySelector('.key').value;
                const val = row.querySelector('.value').value;
                if(check && check.checked && key) {
                    headers.push({ key, value: val, enabled: true });
                }
            });

            document.getElementById('responseOutput').innerHTML = '<span style="color:var(--vscode-descriptionForeground)">Sending request...</span>';

            vscode.postMessage({
                command: 'sendRequest',
                method, url, body, queryParams, headers
            });
        }

        // --- HANDLE RESPONSE ---
        window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.command === 'response') {
                // Update Status Bar
                const statusEl = document.getElementById('statusVal');
                statusEl.textContent = msg.status + ' ' + msg.statusText;
                statusEl.className = 'status-val ' + (msg.status >= 200 && msg.status < 300 ? 'success' : 'error');

                document.getElementById('timeVal').textContent = msg.time + ' ms';
                document.getElementById('sizeVal').textContent = msg.size;

                // Syntax Highlight JSON
                try {
                    const json = JSON.parse(msg.data); // Ensure it's valid JSON
                    const html = syntaxHighlight(json);
                    document.getElementById('responseOutput').innerHTML = html;
                } catch(e) {
                    document.getElementById('responseOutput').textContent = msg.data;
                }
            }
            else if (msg.command === 'error') {
                 document.getElementById('statusVal').textContent = 'Error';
                 document.getElementById('statusVal').className = 'status-val error';
                 document.getElementById('responseOutput').textContent = msg.message + '\\n' + msg.data;
            }
        });

        // Simple JSON Syntax Highlighter
        function syntaxHighlight(json) {
            if (typeof json != 'string') {
                 json = JSON.stringify(json, undefined, 2);
            }
            json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\\\[^u]|[^\\\\"])*"(\\s*:)?|\\b(true|false|null)\\b|-?\\d+(?:\\.\\d*)?(?:[eE][+\\-]?\\d+)?)/g, function (match) {
                var cls = 'number';
                if (/^"/.test(match)) {
                    if (/:$/.test(match)) {
                        cls = 'key';
                    } else {
                        cls = 'string';
                    }
                } else if (/true|false/.test(match)) {
                    cls = 'boolean';
                } else if (/null/.test(match)) {
                    cls = 'null';
                }
                return '<span class="' + cls + '">' + match + '</span>';
            });
        }
    </script>
</body>
</html>`;
    }
}