import * as vscode from 'vscode';

export class EndpointCodeLensProvider {

    private methodRegex = /@(Get|Post|Put|Delete|Patch|Options|Head)\s*\(/g;

    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {
        
        const codeLenses: vscode.CodeLens[] = [];
        const text = document.getText();

        let match;
        while ((match = this.methodRegex.exec(text)) !== null) {
            const line = document.lineAt(document.positionAt(match.index).line);
            
            const range = new vscode.Range(line.lineNumber, 0, line.lineNumber, 0);
            
            const command: vscode.Command = {
                title: "Tester cet Endpoint",
                tooltip: "Ouvrir le API tester pour cette route",
                command: "api-tester.openPanel",
                arguments: [document.fileName, line.lineNumber]
            };

            codeLenses.push(new vscode.CodeLens(range, command));
        }

        return codeLenses;
    }
}