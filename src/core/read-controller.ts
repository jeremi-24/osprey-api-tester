import { SourceFile, ClassDeclaration } from "ts-morph";
import { getTableNameFromEntity } from "./read-entity";

export interface EndpointDef {
  httpMethod: string;
  route: string;
  dtoClass?: string;
  dtoPath?: string;
  entityClass?: string;
  entityPath?: string;
  tableName?: string;
  params: string[];
  queryParams: string[];
  line: number;      
  startLine: number; 
  endLine: number;   
}

/**
 * Version Optimisée : Prend un SourceFile déjà chargé par le Provider
 */
export function readController(sourceFile: SourceFile): EndpointDef[] {
  
  const classes = sourceFile.getClasses();
  let controllerClass: ClassDeclaration | undefined;
  
  // 1. Chercher le décorateur @Controller
  for (const classDecl of classes) {
    if (classDecl.getDecorator("Controller")) {
      controllerClass = classDecl;
      break;
    }
  }
  
  // 2. Fallback : Chercher par nom
  if (!controllerClass) {
    for (const classDecl of classes) {
      const className = classDecl.getName() || "";
      if (className.includes("Controller") && classDecl.isExported()) {
        controllerClass = classDecl;
        break;
      }
    }
  }
  
  // 3. Fallback : Prendre la dernière classe exportée
  if (!controllerClass) {
    const exportedClasses = classes.filter(c => c.isExported());
    if (exportedClasses.length > 0) {
      controllerClass = exportedClasses[exportedClasses.length - 1];
    }
  }
  
  if (!controllerClass) return [];

  // Route de base (ex: @Controller('users'))
  const controllerDecorator = controllerClass.getDecorator("Controller");
  let baseRoute = "";
  if (controllerDecorator) {
    const args = controllerDecorator.getArguments();
    if (args.length > 0) {
      baseRoute = args[0].getText().replace(/['"]/g, "").trim();
    }
  }

  // Analyser les méthodes
  const endpoints: EndpointDef[] = [];
  
  controllerClass.getMethods().forEach((method) => {
    // Chercher décorateur HTTP
    const httpDecorator = method.getDecorators().find(d => {
      const name = d.getName();
      return ["Post", "Get", "Put", "Delete", "Patch", "Options", "Head", "All"].includes(name);
    });
    
    if (!httpDecorator) return;
    
    // Positions
    const line = httpDecorator.getStartLineNumber() - 1;
    const startLine = method.getStartLineNumber() - 1;
    const endLine = method.getEndLineNumber() - 1;
    const httpMethod = httpDecorator.getName().toUpperCase();
    
    // Route
    let subRoute = "";
    const decoratorArgs = httpDecorator.getArguments();
    if (decoratorArgs.length > 0) {
      subRoute = decoratorArgs[0].getText().replace(/['"]/g, "").trim();
    }
    
    let fullRoute = baseRoute ? `/${baseRoute}/${subRoute}` : `/${subRoute}`;
    fullRoute = fullRoute.replace(/\/+/g, "/").replace(/\/$/, "");
    
    // DTO (@Body)
    let dtoClass, dtoPath;
    const bodyParam = method.getParameters().find((p) => 
      p.getDecorators().some((d) => d.getName() === "Body")
    );
    
    if (bodyParam) {
      const paramType = bodyParam.getType();
      dtoClass = paramType.getSymbol()?.getName();
      
      const declaration = paramType.getSymbol()?.getDeclarations()[0];
      if (declaration) {
        dtoPath = declaration.getSourceFile().getFilePath();
      }
    }
    
    // Entité (ReturnType)
    let entityClass, entityPath, tableName;
    const returnType = method.getReturnType();
    const returnSymbol = returnType.getSymbol();
    
    if (returnSymbol) {
      entityClass = returnSymbol.getName();
      const declarations = returnSymbol.getDeclarations();
      if (declarations.length > 0) {
        entityPath = declarations[0].getSourceFile().getFilePath();
        // Optimisation : On ne lit le fichier entité que si nécessaire
        if (entityPath.includes(".entity.")) {
          const foundTable = getTableNameFromEntity(entityPath, entityClass || '');
          if (foundTable) tableName = foundTable;
        }
      }
    }
    
    // Paramètres (@Param et @Query)
    const params = method.getParameters()
      .filter(p => p.getDecorators().some(d => d.getName() === "Param"))
      .map(p => p.getName());
    
    const queryParams = method.getParameters()
      .filter(p => p.getDecorators().some(d => d.getName() === "Query"))
      .map(p => p.getName());

    endpoints.push({
      httpMethod, 
      route: fullRoute, 
      dtoClass, 
      dtoPath, 
      entityClass, 
      entityPath, 
      tableName, 
      params, 
      queryParams, 
      line, 
      startLine, 
      endLine
    });
  });

  return endpoints;
}