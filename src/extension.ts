import * as vscode from 'vscode';
import { Project, SourceFile } from 'ts-morph';
import { EndpointCodeLensProvider } from './providers/EndpointCodeLensProvider';
import { EndpointCodeActionProvider } from './providers/EndpointCodeActionProvider';
import { RequestPanel } from './panels/RequestPanel';
import { readController, EndpointDef } from './core/read-controller';
import { readDto } from './core/read-dto';
import { generateSkeletonPayload } from './core/generate-payload';
import { ApiTreeProvider } from './providers/ApiTreeProvider';
import { analyzeCurrentFile } from './core/api-analyzer';

export function activate(context: vscode.ExtensionContext) {

    // ----------------- TS-MORPH GLOBAL PROJECT -----------------


    // ----------------- ENDPOINT CACHE -----------------
    const endpointsCache = new Map<string, EndpointDef[]>();

    function getEndpoints(sourceFile: SourceFile) {
        const path = sourceFile.getFilePath();
        if (endpointsCache.has(path)) return endpointsCache.get(path)!;

        const endpoints = readController(sourceFile);
        endpointsCache.set(path, endpoints);
        return endpoints;
    }

    // ----------------- TREE PROVIDER -----------------
    const treeProvider = new ApiTreeProvider();
    vscode.window.registerTreeDataProvider('api-routes', treeProvider);

    // Start discovery in background (non-blocking)
    treeProvider.startDiscovery();

    context.subscriptions.push(
        vscode.commands.registerCommand('api-tester.refreshEntry', () => treeProvider.refresh())
    );

    // ----------------- CODELENS & CODEACTION -----------------
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { language: 'typescript', scheme: 'file' },
            new EndpointCodeLensProvider()
        )
    );

    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            { language: 'typescript', scheme: 'file' },
            new EndpointCodeActionProvider()
        )
    );

    // --- OPEN PANEL COMMAND ---
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'api-tester.openPanel',
            async (argFileName?: string, argLineNumber?: number) => {
                const editor = vscode.window.activeTextEditor;
                let fileName = argFileName || editor?.document.fileName;
                let lineNumber = argLineNumber !== undefined ? argLineNumber : editor?.selection.active.line;

                if (!fileName || lineNumber === undefined) return;

                const project = treeProvider.getProject();
                const sourceFile = project.getSourceFile(fileName) || project.addSourceFileAtPath(fileName);
                await sourceFile.refreshFromFileSystem();

                const endpoints = getEndpoints(sourceFile);
                const targetEndpoint = endpoints.find(e => {
                    const onDecorator = Math.abs(lineNumber! - e.line) <= 1;
                    const insideMethod = lineNumber! >= e.startLine && lineNumber! <= e.endLine;
                    return onDecorator || insideMethod;
                });

                if (!targetEndpoint) return;

                // 1. Détection dynamique des paramètres de route (:id)
                const pathParams = targetEndpoint.route.match(/:[a-zA-Z0-9_]+/g) || [];
                const pathParamsData = pathParams.map(p => ({ key: p.replace(':', ''), value: '' }));

                // 2. Récupération de la configuration Base URL
                const config = vscode.workspace.getConfiguration('nestjsApiTester');
                const baseUrl = config.get<string>('baseUrl') || 'http://localhost:3000';

                // 3. Génération du Payload
                let initialPayload = {};
                if (['POST', 'PUT', 'PATCH'].includes(targetEndpoint.httpMethod) && targetEndpoint.dtoPath && targetEndpoint.dtoClass) {
                    try {
                        const fields = readDto(project, targetEndpoint.dtoPath, targetEndpoint.dtoClass);
                        initialPayload = generateSkeletonPayload(project, fields);
                    } catch (e) { console.error(e); }
                }

                // 4. Intelligence de focus (Tab par défaut)
                const isBodyMethod = ['POST', 'PUT', 'PATCH'].includes(targetEndpoint.httpMethod);
                const defaultTab = isBodyMethod ? 'body' : (pathParamsData.length > 0 ? 'path' : 'query');

                RequestPanel.createOrShow(context, {
                    method: targetEndpoint.httpMethod,
                    route: targetEndpoint.route,
                    baseUrl: baseUrl,
                    pathParams: pathParamsData,
                    payload: initialPayload,
                    queryParams: targetEndpoint.queryParams.map(q => ({ key: q, value: '' })),
                    defaultTab: defaultTab,
                    bodyType: targetEndpoint.isMultipart ? 'form-data' : 'json',
                    entityPath: targetEndpoint.entityPath,
                    sourceFilePath: fileName
                });
            }
        )
    );

    // ----------------- ANALYZE COMMAND -----------------
    const outputChannel = vscode.window.createOutputChannel('NestJS Tester');
    context.subscriptions.push(
        vscode.commands.registerCommand('api-tester.analyze', async () => {
            outputChannel.show(true);
            outputChannel.clear();
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath || '';
                await analyzeCurrentFile(
                    editor.document.fileName,
                    rootPath,
                    msg => outputChannel.appendLine(msg)
                );
            }
        })
    );
}

export function deactivate() { }
