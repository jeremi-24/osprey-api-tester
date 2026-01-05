import * as vscode from 'vscode';
import { EndpointCodeLensProvider } from './providers/EndpointCodeLensProvider';
import { EndpointCodeActionProvider } from './providers/EndpointCodeActionProvider';
import { RequestPanel } from './panels/RequestPanel';
import { analyzeCurrentFile } from './core/api-analyzer';
import { readController } from './core/read-controller';
import { readDto } from './core/read-dto';
import { generateSkeletonPayload } from './core/generate-payload';
import { ApiTreeProvider } from './providers/ApiTreeProvider'; // Import du nouveau provider

export function activate(context: vscode.ExtensionContext) {

    const treeProvider = new ApiTreeProvider();
    vscode.window.registerTreeDataProvider('api-routes', treeProvider);
    
    context.subscriptions.push(
        vscode.commands.registerCommand('api-tester.refreshEntry', () => treeProvider.refresh())
    );

    // 2. CodeLens (Texte au-dessus des méthodes)
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { language: 'typescript', scheme: 'file' },
            new EndpointCodeLensProvider()
        )
    );

    // 3. CodeActions (Ampoule jaune)
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            { language: 'typescript', scheme: 'file' },
            new EndpointCodeActionProvider()
        )
    );

    // 4. Commande Principale : Ouvrir le Panel
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'api-tester.openPanel',
            async (argFileName?: string, argLineNumber?: number) => {

                const editor = vscode.window.activeTextEditor;
                let fileName = argFileName;
                let lineNumber = argLineNumber;
                let fileTextContent: string | undefined;

                // Cas A: Appel depuis la Sidebar (On a le fileName et le lineNumber via les arguments)
                if (fileName && lineNumber !== undefined) {
                    // Si le fichier n'est pas ouvert, on le lit du disque ? 
                    // readController gère ça via ts-morph, on a juste besoin du path.
                }
                // Cas B: Appel depuis l'éditeur (Raccourci clavier)
                else if (editor) {
                    fileName = editor.document.fileName;
                    lineNumber = editor.selection.active.line;
                    fileTextContent = editor.document.getText();
                } 
                else {
                    vscode.window.showErrorMessage('Aucun fichier ouvert.');
                    return;
                }

                // Analyse
                let endpoints;
                try {
                    endpoints = readController(fileName!, fileTextContent);
                } catch (e) {
                    vscode.window.showErrorMessage('Erreur lors de la lecture du Controller.');
                    return;
                }

                // Trouver l'endpoint
                const targetEndpoint = endpoints.find(e => {
                    const onDecorator = Math.abs(lineNumber! - e.line) <= 1;
                    const insideMethod = lineNumber! >= e.startLine && lineNumber! <= e.endLine;
                    return onDecorator || insideMethod;
                });

                if (!targetEndpoint) {
                    // Si on vient de la sidebar, c'est rare d'échouer ici sauf si le fichier a changé sans refresh
                    vscode.window.showErrorMessage(`Endpoint introuvable (Ligne ${lineNumber! + 1})`);
                    return;
                }

                // Génération Payload
                let generatedPayload = {};
                if (['POST', 'PUT', 'PATCH'].includes(targetEndpoint.httpMethod) && targetEndpoint.dtoPath && targetEndpoint.dtoClass) {
                    try {
                        const fields = readDto(targetEndpoint.dtoPath, targetEndpoint.dtoClass);
                        generatedPayload = generateSkeletonPayload(fields);
                    } catch (e) {
                        console.error('Erreur lecture DTO', e);
                    }
                }

                // Ouverture Panel
                RequestPanel.createOrShow(context.extensionUri, {
                    method: targetEndpoint.httpMethod,
                    route: targetEndpoint.route,
                    payload: generatedPayload,
                    queryParams: targetEndpoint.queryParams.map(q => ({ key: q, value: '' }))
                });
            }
        )
    );

    // 5. Commande de Debug (Analyse globale)
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