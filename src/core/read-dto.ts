import { Project, PropertyDeclaration, Type } from "ts-morph";

export interface DtoField {
  name: string;
  type: string;
  isArray: boolean;
  isClass: boolean;
  relatedDtoPath?: string;
  relatedDtoName?: string;
}

export function readDto(project: Project, filePath: string, className: string): DtoField[] {
  // On utilise le projet existant au lieu d'en créer un nouveau
  const sourceFile = project.getSourceFile(filePath) || project.addSourceFileAtPath(filePath);
  const classDecl = sourceFile.getClass(className);

  if (!classDecl) {
    console.warn(`Classe ${className} introuvable dans ${filePath}`);
    return [];
  }

  return classDecl.getProperties().map((p) => {
    return analyzeProperty(p);
  });
}

function analyzeProperty(p: PropertyDeclaration): DtoField {
  const name = p.getName();
  const typeObj = p.getType();
  const typeText = typeObj.getText();

  // Détection tableau
  const isArray = typeObj.isArray();

  const baseType = isArray ? typeObj.getArrayElementType()! : typeObj;

  const isPrimitive = isPrimitiveType(baseType);

  let relatedDtoPath: string | undefined;
  let relatedDtoName: string | undefined;

  if (!isPrimitive) {
    const symbol = baseType.getSymbol() || baseType.getAliasSymbol();
    if (symbol) {
      const declarations = symbol.getDeclarations();
      if (declarations.length > 0) {
        const sourceFile = declarations[0].getSourceFile();
        // On vérifie que ce n'est pas une lib node_modules (ex: Date, Promise)
        if (!sourceFile.getFilePath().includes("node_modules")) {
          relatedDtoPath = sourceFile.getFilePath();
          relatedDtoName = symbol.getName();
        }
      }
    }
  }

  return {
    name,
    type: typeText,
    isArray,
    isClass: !!relatedDtoPath,
    relatedDtoPath,
    relatedDtoName
  };
}

function isPrimitiveType(type: Type): boolean {
  return (
    type.isString() ||
    type.isNumber() ||
    type.isBoolean() ||
    type.isEnum() ||
    type.getText().includes("Date") ||
    type.getText() === "any"
  );
}