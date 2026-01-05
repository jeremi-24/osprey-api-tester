import { Project } from "ts-morph";

export function getTableNameFromEntity(filePath: string, className: string): string | null {
  const project = new Project();
  
  try {
    const sourceFile = project.addSourceFileAtPath(filePath);
    const classDecl = sourceFile.getClass(className);

    if (!classDecl) return null;

    const entityDecorator = classDecl.getDecorator("Entity");
    if (!entityDecorator) return null; 

   
    const args = entityDecorator.getArguments();
    if (args.length > 0) {
      
      return args[0].getText().replace(/['"]/g, "");
    }

    return className;
    
  } catch (error) {
    console.error(`Erreur lecture entité ${filePath}:`, error);
    return null;
  }
}