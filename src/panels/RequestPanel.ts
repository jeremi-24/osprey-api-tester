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
    }

    public static createOrShow(extensionUri: vscode.Uri, data: any) {
        if (RequestPanel.currentPanel) {
            RequestPanel.currentPanel._panel.reveal(vscode.ViewColumn.Two);
            RequestPanel.currentPanel.update(data);
            return;
        }
        const panel = vscode.window.createWebviewPanel('apiTester', `Osprey: ${data.method}`, vscode.ViewColumn.Two, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        RequestPanel.currentPanel = new RequestPanel(panel, extensionUri);
        RequestPanel.currentPanel.update(data);
    }

    public update(data: any) {
        this._panel.webview.html = this._getHtmlForWebview(data);
        this._setWebviewMessageListener();
    }

    private _setWebviewMessageListener() {
        this._panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'sendRequest': await this._handleSendRequest(message); break;
                case 'openInEditor':
                    const doc = await vscode.workspace.openTextDocument({ content: message.content, language: 'json' });
                    await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
                    break;
                case 'info': vscode.window.showInformationMessage(message.text); break;
            }
        }, null, this._disposables);
    }

    private async _handleSendRequest(message: any) {
        try {
            const startTime = Date.now();
            const response = await axios({
                method: message.method,
                url: message.url,
                data: message.body ? JSON.parse(message.body) : undefined,
                headers: message.headers,
                validateStatus: () => true
            });
            const duration = Date.now() - startTime;
            const size = Buffer.byteLength(JSON.stringify(response.data)) / 1024;

            this._panel.webview.postMessage({
                command: 'response',
                success: true,
                status: response.status,
                data: JSON.stringify(response.data, null, 2),
                time: duration,
                size: size.toFixed(2) + ' KB'
            });
        } catch (error: any) {
            this._panel.webview.postMessage({ command: 'response', success: false, data: error.message });
        }
    }

    private dispose() {
        RequestPanel.currentPanel = undefined;
        this._panel.dispose();
    }

    private _getHtmlForWebview(data: any) {
        const defaultTab = data.defaultTab || 'body';
        const hasParams = data.pathParams && data.pathParams.length > 0;
        const hasQueryParams = data.queryParams && data.queryParams.length > 0;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://microsoft.github.io/vscode-codicons/dist/codicon.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.min.js"></script>
    <style>
        :root {
            --input-bg: var(--vscode-input-background);
            --input-fg: var(--vscode-input-foreground);
            --input-border: var(--vscode-input-border, transparent);
            --button-bg: var(--vscode-button-background);
            --button-fg: var(--vscode-button-foreground);
            --button-hover: var(--vscode-button-hoverBackground);
            --bg-primary: var(--vscode-editor-background);
            --bg-secondary: var(--vscode-sideBar-background);
            --border-color: var(--vscode-panel-border);
            --text-primary: var(--vscode-editor-foreground);
            --text-secondary: var(--vscode-descriptionForeground);
            --focus-border: var(--vscode-focusBorder);
            --accent: var(--vscode-textLink-activeForeground);
            --radius-sm: 3px;
            --radius-md: 5px;
        }

        body { 
            font-family: var(--vscode-font-family); 
            background: var(--bg-primary); 
            color: var(--text-primary); 
            margin: 0; padding: 0;
            display: flex; flex-direction: column; height: 100vh;
            font-size: var(--vscode-font-size);
        }

        /* HEADER */
        .app-header {
            display: flex; justify-content: space-between; align-items: center;
            padding: 12px 20px;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-color);
        }
        .logo-section { display: flex; align-items: center; gap: 10px; }
        .logo-text { font-size: 16px; font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 8px; }
        .logo-icon { color: var(--button-bg); }
        .subtitle { font-size: 11px; color: var(--text-secondary); margin-left: 8px; padding-left: 8px; border-left: 1px solid var(--border-color); }
        
        .header-actions { display: flex; gap: 10px; align-items: center; }

        .send-btn { 
            background: var(--button-bg); color: var(--button-fg); border: none; 
            padding: 6px 16px; border-radius: 2px; cursor: pointer; 
            font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 6px;
            transition: background 0.2s;
        }
        .send-btn:hover { background: var(--button-hover); }

        /* CONFIG AREA */
        .config-container {
            padding: 20px;
            display: flex; gap: 15px; flex-wrap: wrap;
            border-bottom: 1px solid var(--border-color);
        }
        
        .field-group { display: flex; flex-direction: column; gap: 6px; min-width: 150px; flex: 1; }
        .field-group.method-group { flex: 0 0 auto; min-width: 100px; }
        
        .label { font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }
        
        .method-badge {
            background: var(--input-bg);
            color: var(--button-bg);
            font-weight: 700;
            display: flex; align-items: center; justify-content: center;
            height: 32px; border-radius: 2px; border: 1px solid var(--border-color);
            font-size: 13px;
        }
        
        .input-box {
            background: var(--input-bg); border: 1px solid var(--input-border);
            color: var(--input-fg);
            height: 32px; display: flex; align-items: center; padding: 0 8px;
            border-radius: 2px;
        }
        .input-box:focus-within { border-color: var(--focus-border); }
        .input-box input, .input-box select {
            background: transparent; border: none; color: inherit; 
            font-family: inherit; font-size: 13px; width: 100%; outline: none;
        }
        .input-box select option { background: var(--input-bg); }
        
        /* TABS */
        .tabs { 
            display: flex; gap: 2px; padding: 0 20px; 
            margin-top: 10px; border-bottom: 1px solid var(--border-color);
        }
        .tab { 
            padding: 8px 16px; cursor: pointer; font-size: 12px; 
            color: var(--text-secondary); 
            display: flex; align-items: center; gap: 6px; 
            border-bottom: 2px solid transparent;
            transition: color 0.2s;
        }
        .tab:hover { color: var(--text-primary); }
        .tab.active { 
            color: var(--text-primary); 
            border-bottom-color: var(--button-bg); 
        }
        .tab-badge { 
            background: var(--button-bg); color: var(--button-fg); 
            padding: 1px 5px; border-radius: 10px; font-size: 10px; font-weight: bold; 
        }

        /* MAIN LAYOUT */
        .container { display: flex; flex: 1; overflow: hidden; }
        
        .main-content { 
            flex: 1; display: flex; flex-direction: column; 
            background: var(--bg-primary); 
            overflow-y: auto;
        }
        
        .tab-pane { display: none; padding: 0; height: 100%; flex-direction: column; }
        .tab-pane.active { display: flex; }

        /* EDITOR AREAS */
        .editor-header {
            display: flex; justify-content: space-between; align-items: center;
            padding: 8px 20px; font-size: 11px; color: var(--text-secondary);
            background: var(--bg-secondary); border-bottom: 1px solid var(--border-color);
        }
        .action-link { 
            cursor: pointer; display: flex; align-items: center; gap: 5px; 
            transition: color 0.2s;
        }
        .action-link:hover { color: var(--text-primary); }

        /* RESPONSE SECTION */
        .response-section {
            height: 40%; 
            display: flex; flex-direction: column;
            border-top: 1px solid var(--border-color);
        }

        /* DATA TABLES (Headers, Params) */
        .param-table-container { padding: 20px; }
        .param-table { width: 100%; border-collapse: collapse; }
        .param-table tr { border-bottom: 1px solid var(--border-color); }
        .param-table td { padding: 12px 8px; }
        .param-key { font-family: 'Courier New', monospace; color: var(--button-bg); width: 140px; }

        /* AUTH SECTION */
        .auth-container { padding: 20px; display: flex; flex-direction: column; gap: 20px; }
        .auth-header { font-size: 13px; font-weight: 600; margin-bottom: 10px; }

        /* FOOTER */
        .footer {
            height: 28px; background: var(--button-bg); color: var(--button-fg);
            display: flex; justify-content: space-between; align-items: center; padding: 0 15px;
            font-size: 11px; font-weight: 500;
        }
        .footer-left { display: flex; gap: 15px; }

    </style>
</head>
<body>
    <div class="app-header">
        <div class="logo-section">
            <i class="codicon codicon-rocket logo-icon"></i>
            <div class="logo-text">Osprey</div>
            <div class="subtitle">API CLIENT</div>
        </div>
        <div class="header-actions">
            <!-- Synced badge removed -->
            <button class="send-btn" onclick="sendRequest()"><i class="codicon codicon-play"></i> Send Request</button>
        </div>
    </div>

    <div class="config-container">
        <div class="field-group method-group">
            <div class="label">Method</div>
            <div class="method-badge">${data.method}</div>
        </div>
        <div class="field-group">
            <div class="label">Base URL</div>
            <div class="input-box">
                <input type="text" id="baseUrl" value="${data.baseUrl}">
                <i class="codicon codicon-lock" title="Configured in settings"></i>
            </div>
        </div>
        <div class="field-group">
            <div class="label">Route</div>
            <div class="input-box">
                <!-- Cleaned route path: removing :label params from display -->
                <input type="text" id="routePath" value="${data.route.replace(/\/:[^/]+/g, '/')}" readonly>
            </div>
        </div>
    </div>

    <div class="tabs">
        <div class="tab ${defaultTab === 'path' ? 'active' : ''}" onclick="switchTab('path')">
            Params ${hasParams ? '<span class="tab-badge">!</span>' : ''}
        </div>
        <div class="tab ${defaultTab === 'query' ? 'active' : ''}" onclick="switchTab('query')">
            Query ${hasQueryParams ? '<span class="tab-badge">!</span>' : ''}
        </div>
        <div class="tab" onclick="switchTab('headers')">Headers</div>
        <div class="tab" onclick="switchTab('auth')">Auth</div>
        <div class="tab ${defaultTab === 'body' ? 'active' : ''}" onclick="switchTab('body')">Body</div>
    </div>

    <div class="main-content">
        <!-- PATH PARAMS -->
        <div id="pane-path" class="tab-pane ${defaultTab === 'path' ? 'active' : ''}">
            <div class="param-table-container">
                <table class="param-table" id="pathParamsTable">
                    ${data.pathParams.map((p: any) => `
                        <tr>
                            <td class="param-key">:${p.key}</td>
                            <td>
                                <div class="input-box">
                                    <input type="text" data-key="${p.key}" placeholder="Value">
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </table>
                ${!hasParams ? '<div style="padding: 20px; color: var(--text-secondary); font-style: italic;">No path parameters detected.</div>' : ''}
            </div>
        </div>
        
        <!-- HEADERS -->
        <div id="pane-headers" class="tab-pane">
             <div class="param-table-container">
                <table class="param-table" id="headersTable">
                    <tr>
                        <td>
                            <div class="input-box">
                                <input type="text" class="header-key" value="Content-Type" placeholder="Key">
                            </div>
                        </td>
                         <td>
                            <div class="input-box">
                                <input type="text" class="header-val" value="application/json" placeholder="Value">
                            </div>
                        </td>
                         <td style="width: 30px; text-align: center;">
                            <i class="codicon codicon-close" style="cursor: pointer;" onclick="this.closest('tr').remove()"></i>
                        </td>
                    </tr>
                    <!-- Dynamic rows can be added here -->
                </table>
                <div style="margin-top: 10px;">
                    <button class="action-link" style="background:none; border:none; color: var(--accent);" onclick="addHeaderRow()">
                        <i class="codicon codicon-add"></i> Add Header
                    </button>
                </div>
            </div>
        </div>

        <!-- AUTH -->
        <div id="pane-auth" class="tab-pane">
            <div class="auth-container">
                <div class="field-group">
                    <div class="label">Authorization Type</div>
                    <div class="input-box" style="width: 200px;">
                        <select id="authType" onchange="toggleAuthFields()">
                            <option value="none">No Auth</option>
                            <option value="bearer">Bearer Token</option>
                            <option value="basic">Basic Auth</option>
                        </select>
                    </div>
                </div>

                <div id="auth-bearer" style="display: none;" class="field-group">
                    <div class="label">Token</div>
                    <div class="input-box">
                        <input type="text" id="authToken" placeholder="e.g. eyJhbGciOiJIUzI1Ni...">
                    </div>
                </div>

                <div id="auth-basic" style="display: none; gap: 15px; flex-direction: row;">
                    <div class="field-group" style="flex: 1;">
                         <div class="label">Username</div>
                         <div class="input-box"><input type="text" id="authUser"></div>
                    </div>
                     <div class="field-group" style="flex: 1;">
                         <div class="label">Password</div>
                         <div class="input-box"><input type="password" id="authPass"></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- QUERY (Placeholder for now as logic wasn't fully requested but UI needs consistency) -->
        <div id="pane-query" class="tab-pane ${defaultTab === 'query' ? 'active' : ''}">
             <div class="param-table-container">
                <table class="param-table" id="queryParamsTable">
                    ${data.queryParams && data.queryParams.length > 0 ? data.queryParams.map((q: any) => `
                        <tr>
                            <td class="param-key" style="color:var(--accent); width: 140px;">${q.key}</td>
                            <td>
                                <div class="input-box">
                                    <input type="text" class="query-input" data-key="${q.key}" placeholder="value">
                                </div>
                            </td>
                        </tr>
                    `).join('') : ''}
                </table>
                ${(!data.queryParams || data.queryParams.length === 0) ? '<div style="padding: 20px; color: var(--text-secondary); font-style: italic;">No query parameters detected.</div>' : ''}
            </div>
        </div>

        <!-- BODY EDITOR -->
        <div id="pane-body" class="tab-pane ${defaultTab === 'body' ? 'active' : ''}">
            <div class="editor-header">
                <div>application/json</div>
                <div style="display: flex; gap: 15px;">
                    <div class="action-link" onclick="format()"><i class="codicon codicon-wand"></i> Format</div>
                    <div class="action-link" onclick="copy()"><i class="codicon codicon-copy"></i> Copy</div>
                </div>
            </div>
            <div id="bodyEditor" style="flex: 1;"></div>
        </div>

        <!-- RESPONSE -->
        <div class="response-section" id="responseSection">
            <div class="editor-header" style="background: var(--bg-secondary); border-top: 1px solid var(--border-color);">
                <div id="resMeta" style="font-weight: bold;">RESPONSE</div>
                <div class="action-link" onclick="openRes()"><i class="codicon codicon-link-external"></i> Expand</div>
            </div>
            <div id="resEditor" style="flex: 1;"></div>
        </div>
    </div>

    <div class="footer">
        <div class="footer-left">
            <i class="codicon codicon-check-all"></i> Ready
        </div>
        <div style="display: flex; gap: 15px;">
             <span id="timeInfo"></span>
             <span id="sizeInfo"></span>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let bodyEditor, resEditor;
        
        // Use the route with placeholders for logic, but UI shows simplified
        const originalRoutePattern = '${data.route}';

        require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }});
        require(['vs/editor/editor.main'], function() {
            const isDark = document.body.dataset.vscodeThemeKind === 'vscode-light' ? false : true;
            
            monaco.editor.defineTheme('ospreyTheme', {
                base: 'vs-dark', 
                inherit: true,
                rules: [],
                colors: { 'editor.background': '#00000000' }
            });

            const commonOptions = {
                theme: 'ospreyTheme', 
                minimap: { enabled: false }, 
                automaticLayout: true,
                fontSize: 13,
                fontFamily: 'var(--vscode-editor-font-family)',
                scrollBeyondLastLine: false,
                overviewRulerBorder: false,
                hideCursorInOverviewRuler: true
            };

            bodyEditor = monaco.editor.create(document.getElementById('bodyEditor'), {
                ...commonOptions,
                value: ${JSON.stringify(data.payload ? JSON.stringify(data.payload, null, 2) : '{}')},
                language: 'json',
            });
            
            resEditor = monaco.editor.create(document.getElementById('resEditor'), {
                ...commonOptions,
                value: '', 
                language: 'json', 
                readOnly: true,
                lineNumbers: 'off',
                folding: true
            });
        });

        window.addEventListener('resize', () => {
            if(bodyEditor) bodyEditor.layout();
            if(resEditor) resEditor.layout();
        });

        function switchTab(id) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            
            const targetTab = Array.from(document.querySelectorAll('.tab')).find(t => t.innerText.toLowerCase().includes(id));
            if(targetTab) targetTab.classList.add('active');
            
            const targetPane = document.getElementById('pane-' + id);
            if(targetPane) targetPane.classList.add('active');
            
            if(id === 'body' && bodyEditor) bodyEditor.layout();
        }
        
        function toggleAuthFields() {
            const type = document.getElementById('authType').value;
            document.getElementById('auth-bearer').style.display = type === 'bearer' ? 'block' : 'none';
            document.getElementById('auth-basic').style.display = type === 'basic' ? 'flex' : 'none';
        }

        function addHeaderRow() {
            const table = document.getElementById('headersTable');
            const row = table.insertRow();
            row.innerHTML = \`
                <td><div class="input-box"><input type="text" class="header-key" placeholder="Key"></div></td>
                <td><div class="input-box"><input type="text" class="header-val" placeholder="Value"></div></td>
                <td style="width: 30px; text-align: center;"><i class="codicon codicon-close" style="cursor: pointer;" onclick="this.closest('tr').remove()"></i></td>
            \`;
        }

        function sendRequest() {
            // Reconstruct logic url
            let fullUrl = document.getElementById('baseUrl').value + originalRoutePattern;
            
            // Handle Params
            document.querySelectorAll('#pathParamsTable input').forEach(input => {
                const val = input.value.trim();
                const key = input.dataset.key;
                if(val) fullUrl = fullUrl.replace(':' + key, val);
            });

            // Handle Query Params
            const queryParts = [];
            // On cible spécifiquement les inputs des Query Params
            document.querySelectorAll('#queryParamsTable .query-input').forEach(input => {
                const val = input.value.trim();
                const key = input.dataset.key;
                if(val) {
                    queryParts.push(encodeURIComponent(key) + '=' + encodeURIComponent(val));
                }
            });
            if(queryParts.length > 0) {
                fullUrl += (fullUrl.includes('?') ? '&' : '?') + queryParts.join('&');
            }
            
            // Handle Headers
            const headers = {};
            document.querySelectorAll('#headersTable tr').forEach(row => {
                const key = row.querySelector('.header-key')?.value.trim();
                const val = row.querySelector('.header-val')?.value.trim();
                if(key && val) headers[key] = val;
            });

            // Handle Auth
            const authType = document.getElementById('authType').value;
            if(authType === 'bearer') {
                const token = document.getElementById('authToken').value.trim();
                if(token) headers['Authorization'] = 'Bearer ' + token;
            } else if (authType === 'basic') {
                const u = document.getElementById('authUser').value.trim();
                const p = document.getElementById('authPass').value.trim();
                if(u && p) headers['Authorization'] = 'Basic ' + btoa(u + ':' + p);
            }

            const btn = document.querySelector('.send-btn');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="codicon codicon-loading codicon-modifier-spin"></i> Sending...';
            btn.disabled = true;

             vscode.postMessage({
                command: 'sendRequest',
                method: '${data.method}',
                url: fullUrl,
                headers: headers,
                body: bodyEditor ? bodyEditor.getValue() : '{}'
            });

            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }, 5000); 
        }

        function format() { bodyEditor.getAction('editor.action.formatDocument').run(); }
        function copy() { 
            navigator.clipboard.writeText(bodyEditor.getValue()); 
            vscode.postMessage({command:'info', text:'Copied to clipboard'}); 
        }
        function openRes() { vscode.postMessage({ command: 'openInEditor', content: resEditor.getValue() }); }

        window.addEventListener('message', e => {
            const m = e.data;
            if(m.command === 'response') {
                const btn = document.querySelector('.send-btn');
                btn.innerHTML = '<i class="codicon codicon-play"></i> Send Request';
                btn.disabled = false;

                if(resEditor) resEditor.setValue(m.data);
                
                const meta = document.getElementById('resMeta');
                meta.innerHTML = \`<span style\="color: \${m.success ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-testing-iconFailed)'}">\${m.status}</span> \` + (m.success ? 'OK' : 'ERROR');

                document.getElementById('timeInfo').innerText = m.time + 'ms';
                document.getElementById('sizeInfo').innerText = m.size;
            }
        });
    </script>
</body>
</html>`;
    }
}