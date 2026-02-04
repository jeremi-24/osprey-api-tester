import { GoogleGenerativeAI } from '@google/generative-ai';

export class AIService {
    private genAI: GoogleGenerativeAI;
    private model: any;

    constructor(apiKey: string) {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
    }

    async analyzeContextForDb(codeContext: string, dbType: string): Promise<{ tableName?: string, query?: string, reasoning?: string }> {
        const prompt = `
        You are an expert backend developer assistant.
        Analyze the following NestJS code context (Controller/Entity/Service) and determine the database table associated with it.
        
        Database Type: ${dbType}

        Your goal:
        1. Identify the main database table name used in this context.
        2. Generate a SAFE SELECT query to fetch a preview of records (limit 20).
        3. If you see relationships, you can include a JOIN if it helps identify the record, but keep it simple.

        Code Context:
        ${codeContext}

        Return strictly a JSON object with this structure (no markdown):
        {
            "tableName": "string",
            "query": "string (the SQL query)",
            "reasoning": "string (brief explanation)"
        }
        `;

        try {
            const result = await this.model.generateContent(prompt);
            const response = result.response;
            const text = response.text();

            // Clean up markdown code blocks if present
            const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

            return JSON.parse(cleanText);
        } catch (error) {
            console.error('AI Analysis failed:', error);
            throw new Error(`AI Analysis failed: ${error}`);
        }
    }
}
