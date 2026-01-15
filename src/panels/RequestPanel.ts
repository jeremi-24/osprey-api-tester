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
        const panel = vscode.window.createWebviewPanel('apiTester', `Osprey: ${data.method}`, vscode.ViewColumn.Two, { enableScripts: true, retainContextWhenHidden: true });
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
            this._panel.webview.postMessage({
                command: 'response',
                success: true,
                status: response.status,
                data: JSON.stringify(response.data, null, 2),
                time: duration
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
        const iconUri = this._panel.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'icon.png'));
        const defaultTab = data.defaultTab || 'body';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <link rel="stylesheet" href="https://microsoft.github.io/vscode-codicons/dist/codicon.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.min.js"></script>
    <style>
        :root {
            --bg: var(--vscode-editor-background);
            --border: var(--vscode-panel-border);
            --input-bg: var(--vscode-input-background);
            --tc-blue: #007acc; --tc-orange: #fb923c;
        }
        body { font-family: var(--vscode-font-family); background: var(--bg); color: var(--vscode-foreground); margin: 0; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
        .header { padding: 10px; display: flex; gap: 8px; border-bottom: 1px solid var(--border); align-items: center; }
        .url-group { display: flex; flex: 1; background: var(--input-bg); border: 1px solid var(--border); border-radius: 4px; overflow: hidden; }
        .base-url-input { width: 180px; border: none; border-right: 1px solid var(--border); background: transparent; color: var(--vscode-input-foreground); padding: 5px; font-family: monospace; }
        .route-input { flex: 1; border: none; background: transparent; color: var(--vscode-input-foreground); padding: 5px; font-family: monospace; opacity: 0.7; }
        .tabs { display: flex; border-bottom: 1px solid var(--border); background: var(--vscode-editor-background); }
        .tab { padding: 8px 15px; cursor: pointer; border-bottom: 2px solid transparent; opacity: 0.7; font-size: 12px; }
        .tab.active { border-bottom-color: var(--tc-blue); opacity: 1; color: var(--tc-blue); }
        .tab.disabled { opacity: 0.2; cursor: not-allowed; }
        .content { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
        .tab-pane { display: none; flex: 1; }
        .tab-pane.active { display: flex; flex-direction: column; }
        .monaco-box { flex: 1; }
        .response-header { padding: 5px 10px; display: flex; justify-content: space-between; background: var(--vscode-panel-background); font-size: 11px; border-top: 1px solid var(--border); }
        .btn-icon { background: none; border: none; color: var(--vscode-foreground); cursor: pointer; padding: 2px 5px; }
        .btn-icon:hover { color: var(--tc-blue); }
        .send-btn { background: var(--tc-orange); color: white; border: none; padding: 5px 15px; border-radius: 4px; cursor: pointer; font-weight: bold; }
        .param-table { width: 100%; border-collapse: collapse; }
        .param-table td { padding: 5px; border-bottom: 1px solid var(--border); }
        .param-input { width: 100%; background: transparent; border: 1px solid var(--border); color: white; padding: 3px; }
    </style>
</head>
<body>
    <div class="header">
        <div class="url-group">
            <div style="padding: 5px; font-weight: bold; color: var(--tc-blue);">${data.method}</div>
            <input type="text" id="baseUrl" class="base-url-input" value="${data.baseUrl}">
            <input type="text" id="routePath" class="route-input" value="${data.route}" readonly>
        </div>
        <button class="send-btn" onclick="sendRequest()"><i class="codicon codicon-send"></i></button>
    </div>

    <div class="tabs">
        <div class="tab ${defaultTab === 'path' ? 'active' : ''}" onclick="switchTab('path')">Params (:id)</div>
        <div class="tab ${defaultTab === 'query' ? 'active' : ''}" onclick="switchTab('query')">Query</div>
        <div class="tab ${defaultTab === 'body' ? 'active' : ''} ${data.method === 'GET' ? 'disabled' : ''}" onclick="${data.method === 'GET' ? '' : "switchTab('body')"}">Body</div>
    </div>

    <div class="content">
        <div id="pane-path" class="tab-pane ${defaultTab === 'path' ? 'active' : ''}">
            <table class="param-table" id="pathParamsTable">
                ${data.pathParams.map((p: any) => `<tr><td style="color:var(--tc-orange)">:${p.key}</td><td><input type="text" class="param-input" data-key="${p.key}" placeholder="value"></td></tr>`).join('')}
            </table>
        </div>
        <div id="pane-query" class="tab-pane ${defaultTab === 'query' ? 'active' : ''}">
            <div style="padding:10px; font-style:italic; opacity:0.5;">Query parameters builder (Planned)</div>
        </div>
        <div id="pane-body" class="tab-pane ${defaultTab === 'body' ? 'active' : ''}">
            <div id="bodyEditor" class="monaco-box"></div>
        </div>
    </div>

    <div class="response-header">
        <div id="resMeta">Status: - | Time: -</div>
        <div>
            <button class="btn-icon" onclick="copyRes()" title="Copy Response"><i class="codicon codicon-copy"></i></button>
            <button class="btn-icon" onclick="openRes()" title="Open in Editor"><i class="codicon codicon-new-editor"></i></button>
        </div>
    </div>
    <div id="resEditor" style="height: 30%;"></div>

    <script>
        const vscode = acquireVsCodeApi();
        let bodyEditor, resEditor;

        require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }});
        require(['vs/editor/editor.main'], function() {
            bodyEditor = monaco.editor.create(document.getElementById('bodyEditor'), {
                value: ${JSON.stringify(data.payload ? JSON.stringify(data.payload, null, 2) : '{}')},
                language: 'json', theme: 'vs-dark', minimap: { enabled: false }, automaticLayout: true
            });
            resEditor = monaco.editor.create(document.getElementById('resEditor'), {
                value: '', language: 'json', theme: 'vs-dark', readOnly: true, minimap: { enabled: false }, automaticLayout: true
            });
        });

        function switchTab(id) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            event.target.classList.add('active');
            document.getElementById('pane-' + id).classList.add('active');
            if(id === 'body') bodyEditor.layout();
        }

        function sendRequest() {
            let fullUrl = document.getElementById('baseUrl').value + document.getElementById('routePath').value;
            // Replacement des :params
            document.querySelectorAll('#pathParamsTable input').forEach(input => {
                fullUrl = fullUrl.replace(':' + input.dataset.key, input.value || ':' + input.dataset.key);
            });

            vscode.postMessage({
                command: 'sendRequest',
                method: '${data.method}',
                url: fullUrl,
                body: bodyEditor.getValue()
            });
        }

        function copyRes() {
            navigator.clipboard.writeText(resEditor.getValue());
            vscode.postMessage({ command: 'info', text: 'Copié !' });
        }

        function openRes() {
            vscode.postMessage({ command: 'openInEditor', content: resEditor.getValue() });
        }

        window.addEventListener('message', e => {
            const m = e.data;
            if(m.command === 'response') {
                resEditor.setValue(m.data);
                document.getElementById('resMeta').innerText = 'Status: ' + m.status + ' | Time: ' + m.time + 'ms';
            }
        });
    </script>
</body>
</html>`;
    }
}