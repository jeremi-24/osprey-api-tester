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
    const tsProject = new Project({
        skipAddingFilesFromTsConfig: true,
        compilerOptions: { experimentalDecorators: true }
    });

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

    // ----------------- OPEN PANEL COMMAND -----------------
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'api-tester.openPanel',
            async (argFileName?: string, argLineNumber?: number) => {

                const editor = vscode.window.activeTextEditor;
                let fileName = argFileName;
                let lineNumber = argLineNumber;
                let fileTextContent: string | undefined;

                if (fileName && lineNumber !== undefined) {
                    // Arguments fournis
                } else if (editor) {
                    fileName = editor.document.fileName;
                    lineNumber = editor.selection.active.line;
                    fileTextContent = editor.document.getText();
                } else {
                    vscode.window.showErrorMessage('Aucun fichier ouvert.');
                    return;
                }

                let sourceFile: SourceFile;
                try {
                    if (fileTextContent) {
                        sourceFile = tsProject.createSourceFile(fileName!, fileTextContent, { overwrite: true });
                    } else {
                        sourceFile = tsProject.getSourceFile(fileName!) || tsProject.addSourceFileAtPath(fileName!);
                    }
                } catch (e) {
                    console.error(e);
                    vscode.window.showErrorMessage('Erreur lors de l\'ouverture du fichier.');
                    return;
                }

                // ----------------- GET ENDPOINTS -----------------
                let endpoints: EndpointDef[];
                try {
                    endpoints = getEndpoints(sourceFile);
                } catch (e) {
                    console.error(e);
                    vscode.window.showErrorMessage('Erreur lors de la lecture du Controller.');
                    return;
                }

                // ----------------- FIND TARGET ENDPOINT -----------------
                const targetEndpoint = endpoints.find(e => {
                    const onDecorator = Math.abs(lineNumber! - e.line) <= 1;
                    const insideMethod = lineNumber! >= e.startLine && lineNumber! <= e.endLine;
                    return onDecorator || insideMethod;
                });

                if (!targetEndpoint) {
                    vscode.window.showErrorMessage(`Endpoint introuvable (Ligne ${lineNumber! + 1})`);
                    return;
                }

                // ----------------- SHOW PANEL -----------------
                RequestPanel.createOrShow(context.extensionUri, {
                    method: targetEndpoint.httpMethod,
                    route: targetEndpoint.route,
                    payload: {}, // initial empty
                    queryParams: targetEndpoint.queryParams.map(q => ({ key: q, value: '' }))
                });

                // ----------------- GENERATE PAYLOAD ASYNC -----------------
                if (['POST', 'PUT', 'PATCH'].includes(targetEndpoint.httpMethod)
                    && targetEndpoint.dtoPath && targetEndpoint.dtoClass) {
                    setTimeout(() => {
                        try {
                            const fields = readDto(targetEndpoint.dtoPath!, targetEndpoint.dtoClass!);
                            const generatedPayload = generateSkeletonPayload(fields);
                            RequestPanel.updatePayload(generatedPayload);
                        } catch (e) {
                            console.error('Erreur lecture DTO', e);
                        }
                    }, 10);
                }
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
