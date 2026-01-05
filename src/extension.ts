import * as vscode from 'vscode';
import { Project } from 'ts-morph'; 
import { EndpointCodeLensProvider } from './providers/EndpointCodeLensProvider';
import { EndpointCodeActionProvider } from './providers/EndpointCodeActionProvider';
import { RequestPanel } from './panels/RequestPanel';
import { readController } from './core/read-controller';
import { readDto } from './core/read-dto';
import { generateSkeletonPayload } from './core/generate-payload';
import { ApiTreeProvider } from './providers/ApiTreeProvider';
import { analyzeCurrentFile } from './core/api-analyzer';

export function activate(context: vscode.ExtensionContext) {

    const treeProvider = new ApiTreeProvider();
    vscode.window.registerTreeDataProvider('api-routes', treeProvider);
    
    context.subscriptions.push(
        vscode.commands.registerCommand('api-tester.refreshEntry', () => treeProvider.refresh())
    );

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

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'api-tester.openPanel',
            async (argFileName?: string, argLineNumber?: number) => {

                const editor = vscode.window.activeTextEditor;
                let fileName = argFileName;
                let lineNumber = argLineNumber;
                let fileTextContent: string | undefined;

                if (fileName && lineNumber !== undefined) {
                    // Argument fourni par la Sidebar ou CodeLens
                }
                else if (editor) {
                    fileName = editor.document.fileName;
                    lineNumber = editor.selection.active.line;
                    fileTextContent = editor.document.getText();
                } 
                else {
                    vscode.window.showErrorMessage('Aucun fichier ouvert.');
                    return;
                }

                // --- MODIFICATION ICI ---
                let endpoints;
                try {
                    // On prépare ts-morph
                    const project = new Project({
                        skipAddingFilesFromTsConfig: true,
                        compilerOptions: { experimentalDecorators: true }
                    });

                    let sourceFile;
                    
                    // Si on a le contenu texte (fichier ouvert non sauvegardé), on l'utilise
                    if (fileTextContent) {
                        sourceFile = project.createSourceFile(fileName!, fileTextContent, { overwrite: true });
                    } else {
                        sourceFile = project.addSourceFileAtPath(fileName!);
                    }

                    // On appelle la fonction avec le SourceFile
                    endpoints = readController(sourceFile);

                } catch (e) {
                    console.error(e);
                    vscode.window.showErrorMessage('Erreur lors de la lecture du Controller.');
                    return;
                }
                // ------------------------

                const targetEndpoint = endpoints.find(e => {
                    const onDecorator = Math.abs(lineNumber! - e.line) <= 1;
                    const insideMethod = lineNumber! >= e.startLine && lineNumber! <= e.endLine;
                    return onDecorator || insideMethod;
                });

                if (!targetEndpoint) {
                    vscode.window.showErrorMessage(`Endpoint introuvable (Ligne ${lineNumber! + 1})`);
                    return;
                }

                let generatedPayload = {};
                if (['POST', 'PUT', 'PATCH'].includes(targetEndpoint.httpMethod) && targetEndpoint.dtoPath && targetEndpoint.dtoClass) {
                    try {
                        const fields = readDto(targetEndpoint.dtoPath, targetEndpoint.dtoClass);
                        generatedPayload = generateSkeletonPayload(fields);
                    } catch (e) {
                        console.error('Erreur lecture DTO', e);
                    }
                }

                RequestPanel.createOrShow(context.extensionUri, {
                    method: targetEndpoint.httpMethod,
                    route: targetEndpoint.route,
                    payload: generatedPayload,
                    queryParams: targetEndpoint.queryParams.map(q => ({ key: q, value: '' }))
                });
            }
        )
    );

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

export function deactivate() {}