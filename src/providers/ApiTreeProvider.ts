import * as vscode from 'vscode';
import * as path from 'path';
import { Project, SourceFile } from "ts-morph";
import { readController, EndpointDef } from '../core/read-controller';

type TreeItemType = ControllerItem | EndpointItem;

export class ApiTreeProvider implements vscode.TreeDataProvider<TreeItemType> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItemType | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

   private controllersCache: Map<string, { name: string, filePath: string, endpoints?: EndpointDef[] }> = new Map();
  private isLoading: boolean = false;
  
   private project: Project | undefined;

  constructor() {
    console.log('[Osprey] ApiTreeProvider initialisé');
    
       setTimeout(() => {
        this.startDiscovery();
    }, 1000);

    this.setupWatcher();
  }

  /**
   * Surveille les changements de fichiers pour maintenir le cache à jour
   */
  private setupWatcher() {
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.controller.ts');
    
       watcher.onDidChange(uri => {
      const entry = this.controllersCache.get(uri.fsPath);
      if (entry) {
        entry.endpoints = undefined; 
        this._onDidChangeTreeData.fire();
      }
    });

       watcher.onDidCreate(() => this.startDiscovery());
    watcher.onDidDelete(uri => {
      this.controllersCache.delete(uri.fsPath);
      this._onDidChangeTreeData.fire();
    });
  }

  /**
   * Scanne le projet pour trouver les fichiers contrôleurs (Opération légère)
   */
  public async startDiscovery() {
    if (this.isLoading) return;
    this.isLoading = true;

       const excludePattern = '{**/node_modules/**,**/dist/**,**/build/**,**/out/**}';
    
    try {
        const files = await vscode.workspace.findFiles('**/*.controller.ts', excludePattern);
        
               const newCache = new Map<string, { name: string, filePath: string, endpoints?: EndpointDef[] }>();
        
        for (const file of files) {
            const fileName = path.basename(file.fsPath);
            const baseName = fileName.replace('.controller.ts', '');
            const controllerName = baseName.charAt(0).toUpperCase() + baseName.slice(1) + ' Controller';
            
                       const existing = this.controllersCache.get(file.fsPath);
            
            newCache.set(file.fsPath, {
                name: controllerName,
                filePath: file.fsPath,
                endpoints: existing?.endpoints
            });
        }

        this.controllersCache = newCache;
        console.log(`[Osprey] Discovery terminé : ${this.controllersCache.size} contrôleurs trouvés.`);
    } catch (err) {
        console.error('[Osprey] Erreur discovery:', err);
    } finally {
        this.isLoading = false;
        this._onDidChangeTreeData.fire();
    }
  }

  /**
   * VS Code appelle cette méthode pour construire l'arbre
   */
  async getChildren(element?: TreeItemType): Promise<TreeItemType[]> {
       if (!element) {
      return Array.from(this.controllersCache.values())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(c => new ControllerItem(c.name, c.filePath, !!c.endpoints));
    }

       if (element instanceof ControllerItem) {
      const entry = this.controllersCache.get(element.filePath);
      if (!entry) return [];

           if (!entry.endpoints) {
               if (!this.project) {
            this.project = new Project({
                skipAddingFilesFromTsConfig: true,
                compilerOptions: { experimentalDecorators: true, emitDecoratorMetadata: true }
            });
        }

        try {
            const sourceFile = this.project.getSourceFile(element.filePath) || 
                               this.project.addSourceFileAtPath(element.filePath);
            
                       await sourceFile.refreshFromFileSystem(); 
            entry.endpoints = readController(sourceFile);
        } catch (e) {
            console.error(`[Osprey] Erreur parsing ${element.filePath}:`, e);
            return [];
        }
      }

      return entry.endpoints.map(ep => new EndpointItem(
        ep.httpMethod,
        ep.route,
        element.filePath,
        ep.line
      ));
    }

    return [];
  }

  getTreeItem(element: TreeItemType): vscode.TreeItem {
    return element;
  }
  
  refresh(): void {
    this.startDiscovery();
  }
}

/**
 * Représente un Contrôleur (Dossier dépliable)
 */
class ControllerItem extends vscode.TreeItem {
  constructor(
    public readonly name: string, 
    public readonly filePath: string,
    public readonly isAnalyzed: boolean
  ) {
    super(name, vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon('symbol-class');
    this.tooltip = filePath;
    this.contextValue = 'controller';
       this.description = isAnalyzed ? '✓' : ''; 
  }
}

/**
 * Représente un Endpoint (Lien cliquable)
 */
class EndpointItem extends vscode.TreeItem {
  constructor(
    public readonly method: string,
    public readonly route: string,
    public readonly filePath: string,
    public readonly line: number
  ) {
    super(`${method} ${route}`, vscode.TreeItemCollapsibleState.None);
    this.iconPath = this.getIcon(method);
    this.contextValue = 'endpoint';

       this.command = {
      command: 'api-tester.openPanel',
      title: 'Tester cet Endpoint',
      arguments: [filePath, line]
    };
  }

  private getIcon(method: string): vscode.ThemeIcon {
    const colors: { [key: string]: string } = {
      'GET': 'charts.green',
      'POST': 'charts.orange',
      'DELETE': 'charts.red',
      'PUT': 'charts.blue',
      'PATCH': 'charts.purple'
    };
    return new vscode.ThemeIcon('symbol-method', new vscode.ThemeColor(colors[method.toUpperCase()] || 'charts.foreground'));
  }
}