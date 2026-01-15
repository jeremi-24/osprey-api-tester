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
 * Lit un controller NestJS et retourne tous les endpoints
 */
export function readController(sourceFile: SourceFile): EndpointDef[] {

  const classes = sourceFile.getClasses();
  let controllerClass: ClassDeclaration | undefined;

  for (const classDecl of classes) {
    if (classDecl.getDecorator("Controller")) {
      controllerClass = classDecl;
      break;
    }
  }

  if (!controllerClass) {
    for (const classDecl of classes) {
      const className = classDecl.getName() || "";
      if (className.includes("Controller") && classDecl.isExported()) {
        controllerClass = classDecl;
        break;
      }
    }
  }

  if (!controllerClass) {
    const exportedClasses = classes.filter(c => c.isExported());
    if (exportedClasses.length > 0) {
      controllerClass = exportedClasses[exportedClasses.length - 1];
    }
  }

  if (!controllerClass) return [];

  const controllerDecorator = controllerClass.getDecorator("Controller");
  let baseRoute = "";
  if (controllerDecorator) {
    const args = controllerDecorator.getArguments();
    if (args.length > 0) {
      baseRoute = args[0].getText().replace(/['"]/g, "").trim();
    }
  }

  const endpoints: EndpointDef[] = [];

  controllerClass.getMethods().forEach(method => {
    const httpDecorator = method.getDecorators().find(d => {
      const name = d.getName();
      return ["Post", "Get", "Put", "Delete", "Patch", "Options", "Head", "All"].includes(name);
    });
    if (!httpDecorator) return;

    const line = httpDecorator.getStartLineNumber() - 1;
    const startLine = method.getStartLineNumber() - 1;
    const endLine = method.getEndLineNumber() - 1;
    const httpMethod = httpDecorator.getName().toUpperCase();

    let subRoute = "";
    const decoratorArgs = httpDecorator.getArguments();
    if (decoratorArgs.length > 0) subRoute = decoratorArgs[0].getText().replace(/['"]/g, "").trim();

    let fullRoute = baseRoute ? `/${baseRoute}/${subRoute}` : `/${subRoute}`;
    fullRoute = fullRoute.replace(/\/+/g, "/").replace(/\/$/, "");

    let dtoClass, dtoPath;
    const bodyParam = method.getParameters().find(p => p.getDecorators().some(d => d.getName() === "Body"));
    if (bodyParam) {
      const paramType = bodyParam.getType();
      dtoClass = paramType.getSymbol()?.getName();
      const declaration = paramType.getSymbol()?.getDeclarations()[0];
      if (declaration) dtoPath = declaration.getSourceFile().getFilePath();
    }

    let entityClass, entityPath, tableName;
    const returnType = method.getReturnType();
    const returnSymbol = returnType.getSymbol();
    if (returnSymbol) {
      entityClass = returnSymbol.getName();
      const declarations = returnSymbol.getDeclarations();
      if (declarations.length > 0) {
        entityPath = declarations[0].getSourceFile().getFilePath();
        if (entityPath.includes(".entity.")) {
          const foundTable = getTableNameFromEntity(entityPath, entityClass || '');
          if (foundTable) tableName = foundTable;
        }
      }
    }

    const params = method.getParameters()
      .filter(p => p.getDecorators().some(d => d.getName() === "Param"))
      .map(p => p.getName());

    const queryParams = method.getParameters()
      .filter(p => p.getDecorators().some(d => d.getName() === "Query"))
      .map(p => {
        const decorator = p.getDecorators().find(d => d.getName() === "Query");
        if (decorator) {
          const args = decorator.getArguments();
          if (args.length > 0) {
            return args[0].getText().replace(/['"]/g, "").trim();
          }
        }
        return p.getName();
      });

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
