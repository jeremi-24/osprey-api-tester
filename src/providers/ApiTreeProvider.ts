import * as vscode from 'vscode';
import * as path from 'path';
import { readController } from '../core/read-controller';

type TreeItemType = ControllerItem | EndpointItem;

export class ApiTreeProvider implements vscode.TreeDataProvider<TreeItemType> {
  
  private _onDidChangeTreeData: vscode.EventEmitter<TreeItemType | undefined | null | void> = 
    new vscode.EventEmitter<TreeItemType | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<TreeItemType | undefined | null | void> = 
    this._onDidChangeTreeData.event;

  private controllersCache: ControllerItem[] = [];
  private isLoading: boolean = false;

  constructor() {
    console.log('[ApiTreeProvider] Constructor appelé');
  }

  refresh(): void {
    console.log('[ApiTreeProvider] Refresh demandé');
    this.controllersCache = [];
    this.isLoading = false;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeItemType): vscode.TreeItem {
    console.log('[ApiTreeProvider] getTreeItem appelé pour:', element.label);
    return element;
  }

  async getChildren(element?: TreeItemType): Promise<TreeItemType[]> {
    console.log('[ApiTreeProvider] getChildren appelé, element:', element?.label || 'ROOT');
    
    if (!element) {
      if (this.controllersCache.length > 0) {
        console.log('[ApiTreeProvider] Retour du cache');
        return this.controllersCache;
      }

      if (this.isLoading) {
        console.log('[ApiTreeProvider] Chargement en cours...');
        return this.controllersCache;
      }

      try {
        this.isLoading = true;

        // Vérifier qu'un workspace est ouvert
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
          console.error('[ApiTreeProvider] Aucun workspace ouvert');
          vscode.window.showWarningMessage('Veuillez ouvrir un dossier de projet pour voir les routes API.');
          this.isLoading = false;
          return [];
        }

        console.log('[ApiTreeProvider] Recherche des fichiers *.controller.ts...');
        const controllerFiles = await vscode.workspace.findFiles(
          '**/*.controller.ts', 
          '**/node_modules/**'
        );
        
        console.log(`[ApiTreeProvider] ${controllerFiles.length} fichier(s) trouvé(s)`);
        
        if (controllerFiles.length === 0) {
          vscode.window.showInformationMessage('Aucun fichier *.controller.ts trouvé dans le projet.');
          this.isLoading = false;
          return [];
        }

        for (const file of controllerFiles) {
          try {
            console.log(`[ApiTreeProvider] Analyse de: ${file.fsPath}`);
            const endpoints = readController(file.fsPath);
            
            console.log(`[ApiTreeProvider] ${endpoints.length} endpoint(s) trouvé(s) dans ${path.basename(file.fsPath)}`);
            
            if (endpoints.length > 0) {
              const fileName = path.basename(file.fsPath);
              const baseName = fileName.replace('.controller.ts', '');
              const controllerName = baseName.charAt(0).toUpperCase() + baseName.slice(1) + ' Controller';

              // Ajouter au cache
              this.controllersCache.push(new ControllerItem(
                controllerName, 
                endpoints, 
                file.fsPath
              ));

              this.controllersCache.sort((a, b) => 
                a.label!.toString().localeCompare(b.label!.toString())
              );

              this._onDidChangeTreeData.fire();
            }
          } catch (e) {
            console.error(`[ApiTreeProvider] Erreur lecture controller ${file.fsPath}:`, e);
          
          }
        }

        console.log(`[ApiTreeProvider] Total: ${this.controllersCache.length} controller(s) valide(s)`);
        
        if (this.controllersCache.length === 0) {
          vscode.window.showInformationMessage('Aucun endpoint trouvé dans les controllers.');
        }

        this.isLoading = false;
        return this.controllersCache;
        
      } catch (error) {
        console.error('[ApiTreeProvider] Erreur dans getChildren (root):', error);
        vscode.window.showErrorMessage('Erreur lors de la lecture des controllers: ' + error);
        this.isLoading = false;
        return [];
      }
    }

    //  Liste des Endpoints d'un Controller
    else if (element instanceof ControllerItem) {
      console.log(`[ApiTreeProvider] Affichage des endpoints pour: ${element.name}`);
      return element.endpoints.map(ep => new EndpointItem(
        ep.httpMethod,
        ep.route,
        element.filePath,
        ep.line
      ));
    }

    return [];
  }
}

/**
 * Fichier Controller
 */
class ControllerItem extends vscode.TreeItem {
  constructor(
    public readonly name: string,
    public readonly endpoints: any[], 
    public readonly filePath: string
  ) {
    super(name, vscode.TreeItemCollapsibleState.Collapsed);
    
    this.tooltip = filePath;
    this.description = `(${endpoints.length})`;
    this.iconPath = new vscode.ThemeIcon('symbol-class');
    this.contextValue = 'controller';
  }
}

/**
 * Endpoint API
 */
class EndpointItem extends vscode.TreeItem {
  constructor(
    public readonly method: string,
    public readonly route: string,
    public readonly filePath: string,
    public readonly line: number
  ) {
    super(`${method} ${route}`, vscode.TreeItemCollapsibleState.None);
    
    this.tooltip = `Ligne ${line + 1} - Cliquez pour tester`;
    this.iconPath = this.getIcon(method);
    this.contextValue = 'endpoint';

    
    this.command = {
      command: 'api-tester.openPanel',
      title: 'Tester',
      arguments: [filePath, line]
    };
  }

  getIcon(method: string): vscode.ThemeIcon {
    switch (method.toUpperCase()) {
      case 'GET': 
        return new vscode.ThemeIcon('arrow-small-right', new vscode.ThemeColor('charts.green'));
      case 'POST': 
        return new vscode.ThemeIcon('add', new vscode.ThemeColor('charts.orange'));
      case 'DELETE': 
        return new vscode.ThemeIcon('trash', new vscode.ThemeColor('charts.red'));
      case 'PUT': 
        return new vscode.ThemeIcon('edit', new vscode.ThemeColor('charts.blue'));
      case 'PATCH': 
        return new vscode.ThemeIcon('git-merge', new vscode.ThemeColor('charts.purple'));
      default: 
        return new vscode.ThemeIcon('symbol-method');
    }
  }
}