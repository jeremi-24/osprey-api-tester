import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

export interface DbConfig {
    type: 'postgres' | 'mysql' | 'unknown';
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    database?: string;
}

export class EnvParser {
    public static getDbConfig(rootPath: string): DbConfig | null {
        try {
            const envPath = path.join(rootPath, '.env');
            if (!fs.existsSync(envPath)) {
                return null;
            }

            const envConfig = dotenv.parse(fs.readFileSync(envPath));

            // Common patterns for NestJS/TypeORM
            const host = envConfig['DB_HOST'] || envConfig['POSTGRES_HOST'] || envConfig['DATABASE_HOST'];
            const port = parseInt(envConfig['DB_PORT'] || envConfig['POSTGRES_PORT'] || '5432');
            const username = envConfig['DB_USER'] || envConfig['DB_USERNAME'] || envConfig['POSTGRES_USER'];
            const password = envConfig['DB_PASS'] || envConfig['DB_PASSWORD'] || envConfig['POSTGRES_PASSWORD'];
            const database = envConfig['DB_NAME'] || envConfig['DB_DATABASE'] || envConfig['POSTGRES_DB'];

            if (host && username && database) {
                return {
                    type: 'postgres', // Default assumption for now, or detect based on vars
                    host,
                    port,
                    username,
                    password,
                    database
                };
            }
            return null;

        } catch (error) {
            console.error('Error parsing .env:', error);
            return null;
        }
    }
}
