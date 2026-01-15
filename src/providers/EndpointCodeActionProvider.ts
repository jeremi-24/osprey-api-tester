import * as vscode from 'vscode';

export class EndpointCodeActionProvider implements vscode.CodeActionProvider {

    private methodRegex = /@(Get|Post|Put|Delete|Patch|Options|Head)\s*\(/;

    public provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection
    ): vscode.ProviderResult<(vscode.Command | vscode.CodeAction)[]> {
        
        const line = document.lineAt(range.start.line);

        if (!this.methodRegex.test(line.text)) {
            return [];
        }

        const action = new vscode.CodeAction(' Test this Endpoint', vscode.CodeActionKind.QuickFix);
        
        action.command = {
            command: 'api-tester.openPanel',
            title: 'Test this Endpoint',
            arguments: [document.fileName, range.start.line]
        };

        return [action];
    }
}