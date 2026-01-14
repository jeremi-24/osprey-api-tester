import { Project } from "ts-morph";
import { DtoField, readDto } from "./read-dto";

/**
 * Génère un squelette JSON récursif.
 * @param fields Liste des champs du DTO actuel
 * @param depth Sécurité pour éviter les boucles infinies (ex: User -> Post -> User)
 */
export function generateSkeletonPayload(project: Project, fields: DtoField[], depth = 0): any {
  if (depth > 3) return {};

  const payload: any = {};

  fields.forEach(field => {
    if (field.isClass && field.relatedDtoPath && field.relatedDtoName) {
      try {
        // ON PASSE LE PROJET ICI AUSSI
        const subFields = readDto(project, field.relatedDtoPath, field.relatedDtoName);
        const subPayload = generateSkeletonPayload(project, subFields, depth + 1);

        if (field.isArray) {
          payload[field.name] = [subPayload];
        } else {
          payload[field.name] = subPayload;
        }
      } catch (e) {
        console.warn(`Impossible de lire le sous-DTO ${field.relatedDtoName}`, e);
        payload[field.name] = field.isArray ? [{}] : {};
      }
    }

    else {
      payload[field.name] = getPrimitiveValue(field.type, field.isArray);
    }
  });

  return payload;
}

function getPrimitiveValue(type: string, isArray: boolean): any {
  const typeLower = type.toLowerCase();
  let val: any = null;

  if (typeLower.includes('string')) val = "string";
  else if (typeLower.includes('number') || typeLower.includes('int')) val = 0;
  else if (typeLower.includes('boolean')) val = true;
  else if (typeLower.includes('date')) val = new Date().toISOString();
  else val = null;

  return isArray ? [val] : val;
}