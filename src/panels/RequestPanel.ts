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
            `API Tester: ${data.route}`,
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
                    case 'saveRequest':
                        await this._handleSaveRequest(message);
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
            const queryParams = message.queryParams
                ?.filter((p: any) => p.enabled !== false && p.key && p.key.trim())
                .map((p: any) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value || '')}`)
                .join('&');
            if (queryParams) {
                url += (url.includes('?') ? '&' : '?') + queryParams;
            }

            let data: any = undefined;
            if (message.body && message.body.trim() !== '' && message.method !== 'GET') {
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

    private async _handleSaveRequest(message: any) {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('Please open a workspace folder to save.');
                return;
            }

            const requestsPath = vscode.Uri.joinPath(workspaceFolders[0].uri, '.vscode', 'api-requests.json');
            let allRequests: any[] = [];
            try {
                const fileData = await vscode.workspace.fs.readFile(requestsPath);
                allRequests = JSON.parse(fileData.toString());
            } catch {}

            allRequests.push({
                id: Date.now().toString(),
                name: message.name || `Request ${new Date().toLocaleString()}`,
                method: message.method,
                url: message.url,
                body: message.body,
                headers: message.headers,
                queryParams: message.queryParams,
                createdAt: new Date().toISOString()
            });

            await vscode.workspace.fs.writeFile(
                requestsPath,
                Buffer.from(JSON.stringify(allRequests, null, 2))
            );

            vscode.window.showInformationMessage('Request saved!');
        } catch (error: any) {
            vscode.window.showErrorMessage(`Save error: ${error.message}`);
        }
    }

    private _formatSize(bytes: number): string {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
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
            baseUrl: 'http://localhost:5000',
            defaultBody: data.payload ? JSON.stringify(data.payload, null, 2) : '{}',
            queryParams: data.queryParams || []
        };

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>API Tester</title>
    <link rel="stylesheet" href="https://microsoft.github.io/vscode-codicons/dist/codicon.css">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: 20px;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            overflow: hidden;
            height: 100vh;
        }

        .container {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }

        /* Header minimaliste */
        .header {
            padding: 12px 16px;
            background: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            gap: 8px;
            align-items: center;
        }

        .method-selector {
            position: relative;
        }

        .method-btn {
            padding: 6px 12px;
            background: transparent;
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-foreground);
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 13px;
            font-weight: 600;
            min-width: 90px;
        }

        .method-btn:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .method-dropdown {
            display: none;
            position: absolute;
            top: calc(100% + 4px);
            left: 0;
            background: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 1000;
            min-width: 100px;
        }

        .method-dropdown.active {
            display: block;
        }

        .method-option {
            padding: 8px 12px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
        }

        .method-option:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .method-option.GET { color: #4ade80; }
        .method-option.POST { color: #fbbf24; }
        .method-option.PUT { color: #60a5fa; }
        .method-option.DELETE { color: #f87171; }
        .method-option.PATCH { color: #c084fc; }

        .url-input {
            flex: 1;
            padding: 6px 12px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-input-foreground);
            font-size: 13px;
            font-family: var(--vscode-editor-font-family);
        }

        .url-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }

        .icon-btn {
            padding: 6px 12px;
            background: transparent;
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-foreground);
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 13px;
        }

        .icon-btn:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .icon-btn.primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-background);
        }

        .icon-btn.primary:hover {
            background: var(--vscode-button-hoverBackground);
        }

        /* Tabs */
        .tabs {
            display: flex;
            gap: 2px;
            padding: 0 16px;
            background: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .tab {
            padding: 8px 16px;
            background: transparent;
            border: none;
            color: var(--vscode-tab-inactiveForeground);
            cursor: pointer;
            font-size: 13px;
            border-bottom: 2px solid transparent;
        }

        .tab:hover {
            color: var(--vscode-tab-activeForeground);
        }

        .tab.active {
            color: var(--vscode-tab-activeForeground);
            border-bottom-color: var(--vscode-focusBorder);
        }

        /* Resizable container */
        .content-wrapper {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .request-section {
            overflow-y: auto;
            background: var(--vscode-editor-background);
        }

        .resizer {
            height: 4px;
            background: var(--vscode-panel-border);
            cursor: ns-resize;
            position: relative;
        }

        .resizer:hover {
            background: var(--vscode-focusBorder);
        }

        .response-section {
            overflow-y: auto;
            background: var(--vscode-editor-background);
            display: none;
        }

        .response-section.visible {
            display: flex;
            flex-direction: column;
        }

        /* Tab content */
        .tab-content {
            display: none;
            padding: 16px;
        }

        .tab-content.active {
            display: block;
        }

        /* Table simple */
        .param-table {
            width: 100%;
            border-collapse: collapse;
        }

        .param-table th {
            text-align: left;
            padding: 8px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            color: var(--vscode-descriptionForeground);
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .param-table td {
            padding: 4px 8px;
        }

        .param-input {
            width: 100%;
            padding: 4px 8px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-input-foreground);
            font-size: 13px;
            font-family: var(--vscode-editor-font-family);
        }

        .param-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }

        .param-checkbox {
            width: 16px;
            height: 16px;
            cursor: pointer;
        }

        .add-btn {
            margin-top: 8px;
            padding: 6px 12px;
            background: transparent;
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-foreground);
            cursor: pointer;
            font-size: 13px;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }

        .add-btn:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .body-textarea {
            width: 100%;
            min-height: 300px;
            padding: 12px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-input-foreground);
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
            resize: vertical;
        }

        .body-textarea:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }

        /* Response */
        .response-header {
            padding: 12px 16px;
            background: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .response-meta {
            display: flex;
            gap: 16px;
            align-items: center;
            font-size: 13px;
        }

        .status-badge {
            padding: 4px 8px;
            font-size: 12px;
            font-weight: 600;
        }

        .status-badge.success {
            color: #4ade80;
        }

        .status-badge.error {
            color: #f87171;
        }

        .response-body {
            padding: 16px;
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
            white-space: pre-wrap;
            word-wrap: break-word;
            line-height: 1.6;
        }

        .headers-list {
            padding: 16px;
        }

        .header-item {
            padding: 8px 0;
            display: flex;
            gap: 16px;
            font-size: 13px;
            font-family: var(--vscode-editor-font-family);
        }

        .header-key {
            color: var(--vscode-symbolIcon-variableForeground);
            font-weight: 600;
            min-width: 200px;
        }

        /* Empty state */
        .empty-state {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
        }

        .empty-state .codicon {
            font-size: 48px;
            margin-bottom: 12px;
            opacity: 0.5;
        }

        /* Spinner */
        .spinner {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid var(--vscode-descriptionForeground);
            border-top-color: var(--vscode-focusBorder);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .loading {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 16px;
            color: var(--vscode-descriptionForeground);
        }

        ::-webkit-scrollbar {
            width: 10px;
            height: 10px;
        }

        ::-webkit-scrollbar-track {
            background: var(--vscode-scrollbarSlider-background);
        }

        ::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-hoverBackground);
        }

        ::-webkit-scrollbar-thumb:hover {
            background: var(--vscode-scrollbarSlider-activeBackground);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="method-selector">
                <button class="method-btn" onclick="toggleMethodDropdown()">
                    <span id="currentMethod">${endpointData.method}</span>
                    <i class="codicon codicon-chevron-down"></i>
                </button>
                <div class="method-dropdown" id="methodDropdown">
                    <div class="method-option GET" onclick="selectMethod('GET')">GET</div>
                    <div class="method-option POST" onclick="selectMethod('POST')">POST</div>
                    <div class="method-option PUT" onclick="selectMethod('PUT')">PUT</div>
                    <div class="method-option DELETE" onclick="selectMethod('DELETE')">DELETE</div>
                    <div class="method-option PATCH" onclick="selectMethod('PATCH')">PATCH</div>
                </div>
            </div>
            <input type="text" class="url-input" id="urlInput" value="${endpointData.baseUrl}${endpointData.route}">
            <button class="icon-btn primary" onclick="sendRequest()">
                <i class="codicon codicon-play"></i>
                Send
            </button>
            <button class="icon-btn" onclick="saveRequest()">
                <i class="codicon codicon-save"></i>
            </button>
        </div>

        <div class="tabs">
            <button class="tab active" onclick="switchTab('params')">Params</button>
            <button class="tab" onclick="switchTab('body')">Body</button>
            <button class="tab" onclick="switchTab('headers')">Headers</button>
        </div>

        <div class="content-wrapper">
            <div class="request-section" id="requestSection">
                <div class="tab-content active" id="params-tab">
                    <table class="param-table">
                        <thead>
                            <tr>
                                <th style="width: 40px;"></th>
                                <th>Key</th>
                                <th>Value</th>
                            </tr>
                        </thead>
                        <tbody id="paramsBody">
                            ${endpointData.queryParams.map((param: string) => `
                                <tr>
                                    <td><input type="checkbox" class="param-checkbox" checked></td>
                                    <td><input type="text" class="param-input" value="${param}"></td>
                                    <td><input type="text" class="param-input"></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <button class="add-btn" onclick="addParamRow()">
                        <i class="codicon codicon-add"></i>
                        Add
                    </button>
                </div>

                <div class="tab-content" id="body-tab">
                    <textarea class="body-textarea" id="bodyInput">${endpointData.defaultBody}</textarea>
                </div>

                <div class="tab-content" id="headers-tab">
                    <table class="param-table">
                        <thead>
                            <tr>
                                <th style="width: 40px;"></th>
                                <th>Key</th>
                                <th>Value</th>
                            </tr>
                        </thead>
                        <tbody id="headersBody"></tbody>
                    </table>
                    <button class="add-btn" onclick="addHeaderRow()">
                        <i class="codicon codicon-add"></i>
                        Add
                    </button>
                </div>
            </div>

            <div class="resizer" id="resizer"></div>

            <div class="response-section" id="responseSection">
                <div class="response-header">
                    <div class="response-meta">
                        <span class="status-badge" id="statusBadge"></span>
                        <span id="responseTime"></span>
                        <span id="responseSize"></span>
                    </div>
                    <button class="icon-btn" onclick="copyResponse()">
                        <i class="codicon codicon-copy"></i>
                    </button>
                </div>
                <div class="tabs">
                    <button class="tab active" onclick="switchResponseTab('body')">Body</button>
                    <button class="tab" onclick="switchResponseTab('headers')">Headers</button>
                </div>
                <div id="responseBody" class="response-body"></div>
                <div id="responseHeaders" class="headers-list" style="display: none;"></div>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentResponseData = null;
        let isResizing = false;

        // Resizer
        const resizer = document.getElementById('resizer');
        const requestSection = document.getElementById('requestSection');
        const responseSection = document.getElementById('responseSection');

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            document.body.style.cursor = 'ns-resize';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            
            const container = document.querySelector('.content-wrapper');
            const containerRect = container.getBoundingClientRect();
            const newHeight = e.clientY - containerRect.top;
            const totalHeight = containerRect.height;
            
            if (newHeight > 100 && newHeight < totalHeight - 100) {
                requestSection.style.height = newHeight + 'px';
                responseSection.style.flex = '1';
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = '';
            }
        });

        function toggleMethodDropdown() {
            document.getElementById('methodDropdown').classList.toggle('active');
        }

        function selectMethod(method) {
            document.getElementById('currentMethod').textContent = method;
            toggleMethodDropdown();
        }

        function switchTab(tabName) {
            document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            event.target.classList.add('active');
            document.getElementById(tabName + '-tab').classList.add('active');
        }

        function switchResponseTab(tabName) {
            const tabs = document.querySelectorAll('.response-section .tab');
            tabs.forEach(t => t.classList.remove('active'));
            event.target.classList.add('active');
            
            if (tabName === 'body') {
                document.getElementById('responseBody').style.display = 'block';
                document.getElementById('responseHeaders').style.display = 'none';
            } else {
                document.getElementById('responseBody').style.display = 'none';
                document.getElementById('responseHeaders').style.display = 'block';
            }
        }

        function addParamRow() {
            const tbody = document.getElementById('paramsBody');
            const row = tbody.insertRow();
            row.innerHTML = \`
                <td><input type="checkbox" class="param-checkbox" checked></td>
                <td><input type="text" class="param-input"></td>
                <td><input type="text" class="param-input"></td>
            \`;
        }

        function addHeaderRow() {
            const tbody = document.getElementById('headersBody');
            const row = tbody.insertRow();
            row.innerHTML = \`
                <td><input type="checkbox" class="param-checkbox" checked></td>
                <td><input type="text" class="param-input"></td>
                <td><input type="text" class="param-input"></td>
            \`;
        }

        function getParams() {
            const rows = document.querySelectorAll('#paramsBody tr');
            const params = [];
            rows.forEach(row => {
                const checkbox = row.querySelector('input[type="checkbox"]');
                const inputs = row.querySelectorAll('.param-input');
                if (inputs[0].value.trim()) {
                    params.push({
                        key: inputs[0].value.trim(),
                        value: inputs[1].value.trim(),
                        enabled: checkbox.checked
                    });
                }
            });
            return params;
        }

        function getHeaders() {
            const rows = document.querySelectorAll('#headersBody tr');
            const headers = [];
            rows.forEach(row => {
                const checkbox = row.querySelector('input[type="checkbox"]');
                const inputs = row.querySelectorAll('.param-input');
                if (inputs[0].value.trim()) {
                    headers.push({
                        key: inputs[0].value.trim(),
                        value: inputs[1].value.trim(),
                        enabled: checkbox.checked
                    });
                }
            });
            return headers;
        }

        function sendRequest() {
            const method = document.getElementById('currentMethod').textContent;
            const url = document.getElementById('urlInput').value;
            const body = document.getElementById('bodyInput').value;
            const queryParams = getParams();
            const headers = getHeaders();

            responseSection.classList.add('visible');
            requestSection.style.height = '50%';
            
            document.getElementById('responseBody').innerHTML = '<div class="loading"><div class="spinner"></div> Sending request...</div>';

            vscode.postMessage({
                command: 'sendRequest',
                method: method,
                url: url,
                body: body,
                queryParams: queryParams,
                headers: headers
            });
        }

        function saveRequest() {
            const method = document.getElementById('currentMethod').textContent;
            const url = document.getElementById('urlInput').value;
            const body = document.getElementById('bodyInput').value;
            const queryParams = getParams();
            const headers = getHeaders();

            vscode.postMessage({
                command: 'saveRequest',
                method: method,
                url: url,
                body: body,
                queryParams: queryParams,
                headers: headers
            });
        }

        function copyResponse() {
            if (currentResponseData) {
                navigator.clipboard.writeText(currentResponseData);
            }
        }

        window.addEventListener('message', event => {
            const message = event.data;
            
            if (message.command === 'response') {
                currentResponseData = message.data;
                
                const statusBadge = document.getElementById('statusBadge');
                statusBadge.textContent = \`\${message.status} \${message.statusText}\`;
                statusBadge.className = 'status-badge ' + (message.status < 400 ? 'success' : 'error');
                
                document.getElementById('responseTime').textContent = \`\${message.time}ms\`;
                document.getElementById('responseSize').textContent = message.size;
                
                document.getElementById('responseBody').textContent = message.data;
                
                const headersHtml = message.headers.map(h => \`
                    <div class="header-item">
                        <span class="header-key">\${h.key}</span>
                        <span class="header-value">\${h.value}</span>
                    </div>
                \`).join('');
                document.getElementById('responseHeaders').innerHTML = headersHtml;
            }
            
            if (message.command === 'error') {
                document.getElementById('statusBadge').textContent = 'Error';
                document.getElementById('statusBadge').className = 'status-badge error';
                document.getElementById('responseBody').textContent = message.message + '\\n\\n' + (message.data || '');
            }
        });

        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('methodDropdown');
            const methodBtn = document.querySelector('.method-btn');
            if (!methodBtn.contains(e.target)) {
                dropdown.classList.remove('active');
            }
        });
    </script>
</body>
</html>`;
    }
}