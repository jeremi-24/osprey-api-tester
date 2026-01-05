import * as vscode from 'vscode';
import * as path from 'path';
import { Project } from "ts-morph"; // Import direct de Project
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
    return element;
  }

  async getChildren(element?: TreeItemType): Promise<TreeItemType[]> {
    
    if (!element) {
      // 1. Retour du cache si disponible
      if (this.controllersCache.length > 0) {
        return this.controllersCache;
      }

      if (this.isLoading) {
        return [];
      }

      try {
        this.isLoading = true;

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
          vscode.window.showWarningMessage('Veuillez ouvrir un dossier de projet.');
          this.isLoading = false;
          return [];
        }

        // 2. Recherche des fichiers
        const controllerFiles = await vscode.workspace.findFiles(
          '**/*.controller.ts', 
          '**/node_modules/**'
        );
        
        if (controllerFiles.length === 0) {
          vscode.window.showInformationMessage('Aucun fichier *.controller.ts trouvé.');
          this.isLoading = false;
          return [];
        }

        // 3. Barre de progression + Initialisation Singleton Project
        return await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: "Osprey: Analyse des APIs...",
          cancellable: false
        }, async (progress) => {
          
          console.log('[ApiTreeProvider] Initialisation du Project ts-morph...');
          
          // INSTANCE UNIQUE DU PROJET (Performance x10)
          const project = new Project({
            skipAddingFilesFromTsConfig: true,
            compilerOptions: {
              experimentalDecorators: true,
              emitDecoratorMetadata: true
            }
          });

          const increment = 100 / controllerFiles.length;

          for (let i = 0; i < controllerFiles.length; i++) {
            const file = controllerFiles[i];
            
            // Mise à jour de la barre de notif
            progress.report({ 
                message: `(${i + 1}/${controllerFiles.length}) ${path.basename(file.fsPath)}`, 
                increment: increment 
            });

            try {
              // Ajout du fichier au projet existant
              const sourceFile = project.addSourceFileAtPath(file.fsPath);
              
              // Analyse rapide
              const endpoints = readController(sourceFile);
              
              if (endpoints.length > 0) {
                const fileName = path.basename(file.fsPath);
                const baseName = fileName.replace('.controller.ts', '');
                const controllerName = baseName.charAt(0).toUpperCase() + baseName.slice(1) + ' Controller';

                this.controllersCache.push(new ControllerItem(
                  controllerName, 
                  endpoints, 
                  file.fsPath
                ));
              }

              // IMPORTANT: Libérer la mémoire immédiatement après lecture
              sourceFile.forget();

            } catch (e) {
              console.error(`[ApiTreeProvider] Erreur lecture ${file.fsPath}:`, e);
            }

            // IMPORTANT: Anti-Freeze (rend la main à l'UI tous les 5 fichiers)
            if (i % 5 === 0) {
              await new Promise(resolve => setTimeout(resolve, 10));
            }
          }

          // Tri alphabétique
          this.controllersCache.sort((a, b) => 
            a.label!.toString().localeCompare(b.label!.toString())
          );

          console.log(`[ApiTreeProvider] Terminé. ${this.controllersCache.length} controllers.`);
          
          if (this.controllersCache.length === 0) {
            vscode.window.showInformationMessage('Aucun endpoint trouvé.');
          }

          this.isLoading = false;
          return this.controllersCache;
        });
        
      } catch (error) {
        console.error('[ApiTreeProvider] Erreur critique:', error);
        vscode.window.showErrorMessage('Erreur lors de l\'analyse: ' + error);
        this.isLoading = false;
        return [];
      }
    }

    // Affichage des enfants (Endpoints)
    else if (element instanceof ControllerItem) {
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
 * Node: Controller
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
 * Node: Endpoint
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
      case 'GET': return new vscode.ThemeIcon('arrow-small-right', new vscode.ThemeColor('charts.green'));
      case 'POST': return new vscode.ThemeIcon('add', new vscode.ThemeColor('charts.orange'));
      case 'DELETE': return new vscode.ThemeIcon('trash', new vscode.ThemeColor('charts.red'));
      case 'PUT': return new vscode.ThemeIcon('edit', new vscode.ThemeColor('charts.blue'));
      case 'PATCH': return new vscode.ThemeIcon('git-merge', new vscode.ThemeColor('charts.purple'));
      default: return new vscode.ThemeIcon('symbol-method');
    }
  }
}