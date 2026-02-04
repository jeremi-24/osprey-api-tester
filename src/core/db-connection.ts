import { Client } from 'pg';
import { DbConfig } from './env-parser';

export class DatabaseService {
    private client: Client | null = null;
    private isConnected = false;

    constructor(private config: DbConfig) { }

    async connect(): Promise<boolean> {
        try {
            if (this.config.type !== 'postgres') {
                throw new Error(`Unsupported database type: ${this.config.type}`);
            }

            this.client = new Client({
                host: this.config.host,
                port: this.config.port,
                user: this.config.username,
                password: this.config.password,
                database: this.config.database,
                connectionTimeoutMillis: 5000 // 5s timeout
            });

            await this.client.connect();
            this.isConnected = true;
            return true;
        } catch (error) {
            console.error('Failed to connect to database:', error);
            return false;
        }
    }

    async executeQuery(query: string): Promise<any[]> {
        if (!this.client || !this.isConnected) {
            throw new Error('Database not connected');
        }
        try {
            const res = await this.client.query(query);
            return res.rows;
        } catch (error) {
            console.error('Query execution failed:', error);
            throw error;
        }
    }

    async disconnect() {
        if (this.client && this.isConnected) {
            await this.client.end();
            this.isConnected = false;
        }
    }

    /**
     * Executes a basic SELECT * with a limit to preview data.
     */
    async previewTable(tableName: string, limit: number = 20): Promise<any[]> {
        // Sanitize table name to prevent basic injection (though not perfect, it's a local dev tool)
        const safeTableName = tableName.replace(/[^a-zA-Z0-9_.]/g, '');
        return this.executeQuery(`SELECT * FROM ${safeTableName} LIMIT ${limit}`);
    }
}
