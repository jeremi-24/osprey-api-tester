import * as path from "path";
import * as dotenv from "dotenv";
import { Project } from "ts-morph"; // <--- AJOUTER L'IMPORT
import { readController } from "./read-controller";
import { readDto } from "./read-dto";

type Logger = (msg: string) => void;

export async function analyzeCurrentFile(
  filePath: string,
  workspaceRoot: string,
  logger: Logger
) {
  if (workspaceRoot) {
    const envPath = path.join(workspaceRoot, ".env");
    dotenv.config({ path: envPath });
    logger(`Environnement chargé : ${envPath}`);
  } else {
    logger("Aucun workspace détecté (.env ignoré)");
  }

  logger(`Analyse du fichier : ${path.basename(filePath)}`);

  let endpoints;
  // Initialize project outside try-catch to reuse it later
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { experimentalDecorators: true }
  });

  try {
    const sourceFile = project.addSourceFileAtPath(filePath);
    endpoints = readController(sourceFile); // On passe le sourceFile, pas le path
  } catch (err) {
    logger(`Erreur lecture controller : ${(err as Error).message}`);
    return;
  }

  if (!endpoints.length) {
    logger("Aucun endpoint NestJS trouvé.");
    return;
  }

  for (const ep of endpoints) {
    logger("----------------------------------------");
    logger(`[${ep.httpMethod}] ${ep.route} (ligne ${ep.line + 1})`);

    if (ep.dtoClass && ep.dtoPath) {
      try {
        const fields = readDto(project, ep.dtoPath, ep.dtoClass);
        logger(`DTO détecté : ${ep.dtoClass}`);
        logger(
          `Champs : ${fields.map(f => `${f.name}:${f.type}`).join(", ")}`
        );
      } catch (e) {
        logger(`Erreur DTO : ${(e as Error).message}`);
      }
    }
  }

  logger("Analyse terminée.");
}