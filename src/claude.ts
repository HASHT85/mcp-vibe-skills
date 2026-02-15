import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
dotenv.config();

// Types for BMAD Artifacts
export interface ProjectAnalysis {
    summary: string;
    features: string[];
    targetAudience: string;
    technicalConstraints: string[];
}

export interface PRD {
    title: string;
    overview: string;
    userStories: {
        story: string;
        acceptanceCriteria: string[];
        priority: "High" | "Medium" | "Low";
    }[];
    functionalRequirements: string[];
    nonFunctionalRequirements: string[];
}

export interface ArchitectureDesign {
    stack: {
        frontend: string;
        backend: string;
        database: string;
        deployment: string;
    };
    skills: {
        name: string;
        reason: string;
    }[];
    fileStructure: {
        path: string;
        description: string;
    }[];
}

export interface SecurityAudit {
    risks: {
        severity: "Critical" | "High" | "Medium" | "Low";
        description: string;
        mitigation: string;
    }[];
    approved: boolean;
}

export interface CodeGeneration {
    files: {
        path: string;
        content: string;
    }[];
    instructions: string;
}

export interface QAReport {
    passed: boolean;
    issues: string[];
    suggestions: string[];
}

export class ClaudeClient {
    private anthropic: Anthropic;

    constructor() {
        if (!process.env.ANTHROPIC_API_KEY) {
            throw new Error("ANTHROPIC_API_KEY is missing via .env");
        }
        this.anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
        });
    }

    private async callClaude(systemPrompt: string, userContent: string): Promise<string> {
        const models = [
            "claude-3-5-sonnet-20241022",
            "claude-3-5-sonnet-20240620",
            "claude-3-opus-20240229",
            "claude-3-sonnet-20240229",
            "claude-3-haiku-20240307"
        ];

        let lastError: any;

        for (const model of models) {
            try {
                console.log(`Trying Claude model: ${model}...`);
                const msg = await this.anthropic.messages.create({
                    model,
                    max_tokens: 4096,
                    temperature: 0.2, // Low temp for more deterministic outputs
                    system: systemPrompt,
                    messages: [
                        { role: "user", content: userContent }
                    ],
                });

                const content = msg.content[0];
                if (content.type === 'text') {
                    console.log(`Success with model: ${model}`);
                    return content.text;
                }
                throw new Error("Unexpected response type from Claude");
            } catch (error: any) {
                console.warn(`Failed with model ${model}:`, error.status || error.message);
                lastError = error;
                // If 401 (Auth) or 402 (Payment), strictly break as retrying won't help
                if (error.status === 401 || error.status === 402) break;
                // Otherwise (404, 500, 429), continue to next model
            }
        }

        console.error("All Claude models failed.");
        throw lastError;
    }

    // 1. Agent Analyst
    async analyzeProject(description: string): Promise<ProjectAnalysis> {
        const system = `You are an Expert Business Analyst. 
    Analyze the user's project description and extract structured requirements.
    Output MUST be valid JSON matching this schema.
    Do not include any explanations or conversational text. Output ONLY the JSON object.
    {
      "summary": "string",
      "features": ["string"],
      "targetAudience": "string",
      "technicalConstraints": ["string"]
    }`;

        const response = await this.callClaude(system, description);
        return JSON.parse(this.extractJson(response));
    }

    // 2. Agent PM
    async generatePRD(analysis: ProjectAnalysis): Promise<PRD> {
        const system = `You are an Expert Product Manager.
    Write a detailed Product Requirements Document (PRD) based on the analysis.
    Output MUST be valid JSON matching this schema.
    Do not include any explanations or conversational text. Output ONLY the JSON object.
    {
      "title": "string",
      "overview": "string",
      "userStories": [{ "story": "string", "acceptanceCriteria": ["string"], "priority": "High|Medium|Low" }],
      "functionalRequirements": ["string"],
      "nonFunctionalRequirements": ["string"]
    }`;

        const response = await this.callClaude(system, JSON.stringify(analysis));
        return JSON.parse(this.extractJson(response));
    }

    // 3. Agent Architect
    async designArchitecture(prd: PRD): Promise<ArchitectureDesign> {
        const system = `You are an Expert Software Architect.
    Design the system architecture based on the PRD.
    Output MUST be valid JSON matching this schema.
    Do not include any explanations or conversational text. Output ONLY the JSON object.
    {
      "stack": { "frontend": "string", "backend": "string", "database": "string", "deployment": "string" },
      "skills": [{ "name": "string", "reason": "string" }],
      "fileStructure": [{ "path": "string", "description": "string" }]
    }`;

        const response = await this.callClaude(system, JSON.stringify(prd));
        return JSON.parse(this.extractJson(response));
    }

    // 4. Agent SecOps
    async securityReview(architecture: ArchitectureDesign): Promise<SecurityAudit> {
        const system = `You are an Expert Security Engineer.
    Perform a security audit of the proposed architecture.
    Output MUST be valid JSON matching this schema.
    Do not include any explanations or conversational text. Output ONLY the JSON object.
    {
      "risks": [{ "severity": "Critical|High|Medium|Low", "description": "string", "mitigation": "string" }],
      "approved": boolean
    }`;

        const response = await this.callClaude(system, JSON.stringify(architecture));
        return JSON.parse(this.extractJson(response));
    }

    // 5. Agent Developer (Coding)
    async generateCode(architecture: ArchitectureDesign, prd: PRD): Promise<CodeGeneration> {
        const system = `You are an Expert Full Stack Developer.
    Generate the initial code structure and key files based on the architecture and PRD.
    
    Output MUST be in XML format as follows:
    <code_generation>
        <instructions>Setup instructions here...</instructions>
        <file path="relative/path/to/file.ext">
            <![CDATA[
                ... file content here ...
            ]]>
        </file>
        ... more files ...
    </code_generation>

    IMPORTANT: 
    1. Use <![CDATA[ ]]> tags for file content to handle special characters safely.
    2. Provide ONLY the essential code files to get the app running.
    3. Do not include any conversational text outside the XML tags.
    `;

        const prompt = `PRD: ${JSON.stringify(prd)}\nArchitecture: ${JSON.stringify(architecture)}`;
        const response = await this.callClaude(system, prompt);

        try {
            return this.parseXmlCodeResponse(response);
        } catch (e) {
            console.error("XML Parse Error. Raw response length:", response.length);
            console.error("Raw response snippet:", response.substring(response.length - 200));
            throw e;
        }
    }

    private parseXmlCodeResponse(text: string): CodeGeneration {
        const files: { path: string, content: string }[] = [];
        let instructions = "";

        // Extract instructions
        const instrMatch = text.match(/<instructions>([\s\S]*?)<\/instructions>/);
        if (instrMatch && instrMatch[1]) {
            instructions = instrMatch[1].trim();
        }

        // Extract files
        // Regex to capture file path and content (handling CDATA)
        const fileRegex = /<file path="(.*?)">([\s\S]*?)<\/file>/g;
        let match;

        while ((match = fileRegex.exec(text)) !== null) {
            const path = match[1];
            let content = match[2].trim();

            // Strip CDATA if present
            const cdataMatch = content.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
            if (cdataMatch && cdataMatch[1]) {
                content = cdataMatch[1];
            }

            files.push({ path, content });
        }

        // Fallback: if no files found via XML, try legacy JSON extraction just in case the model ignored instructions
        if (files.length === 0) {
            try {
                const legacyJson = JSON.parse(this.extractJson(text));
                if (legacyJson.files) return legacyJson;
            } catch (e) {
                // Ignore JSON error, throw XML error
            }
            throw new Error("No files found in XML response");
        }

        return { files, instructions };
    }

    // 6. Agent Debugger (Fix Code)
    async fixCode(currentCode: CodeGeneration, errorLogs: string): Promise<{ code: CodeGeneration, summary: string }> {
        const system = `You are an Expert Software Debugger.
    Analyze the provided code and the error logs to identify the root cause of the failure.
    Applying necessary fixes to the code files.
    
    Output MUST be in XML format as follows:
    <fix_response>
        <summary>Brief description of the fix</summary>
        <code_generation>
            <instructions>Keep or update instructions...</instructions>
            <file path="relative/path/to/file.ext">
                <![CDATA[
                    ... file content here ...
                ]]>
            </file>
            ... more files (include ALL files, even unchanged ones, or just changed ones? 
            BETTER: Return ALL files to replace the state completely) ...
        </code_generation>
    </fix_response>

    IMPORTANT: 
    1. Return the FULL set of files for the application (including unchanged ones) to ensure consistency.
    2. Use <![CDATA[ ]]> tags for file content.
    `;

        // We need to construct a prompt with code and errors
        // To avoid token limits with huge codebases, we might need to be smart, 
        // but for this MVP we send the whole file structure.
        const codeContext = currentCode.files.map(f => `File: ${f.path}\nContent:\n${f.content}`).join("\n\n");
        const prompt = `Current Code:\n${codeContext}\n\nError Logs:\n${errorLogs}`;

        const response = await this.callClaude(system, prompt);

        // Parse XML response
        let summary = "Auto-fix applied";
        let newCode: CodeGeneration = currentCode;

        try {
            const summaryMatch = response.match(/<summary>([\s\S]*?)<\/summary>/);
            if (summaryMatch && summaryMatch[1]) summary = summaryMatch[1].trim();

            const codeGenMatch = response.match(/<code_generation>([\s\S]*?)<\/code_generation>/);
            if (codeGenMatch && codeGenMatch[0]) {
                newCode = this.parseXmlCodeResponse(codeGenMatch[0]);
            }
        } catch (e) {
            console.error("Error parsing fix response:", e);
            throw new Error("Failed to parse fix response from Claude");
        }

        return { code: newCode, summary };
    }

    // 7. Agent QA
    async qaReview(code: CodeGeneration): Promise<QAReport> {
        const system = `You are an Expert QA Engineer.
    Review the generated code for syntax errors, logical bugs, and missing requirements.
    Output MUST be valid JSON matching this schema.
    Do not include any explanations or conversational text. Output ONLY the JSON object.
    {
      "passed": boolean,
      "issues": ["string"],
      "suggestions": ["string"]
    }`;

        const response = await this.callClaude(system, JSON.stringify(code));
        return JSON.parse(this.extractJson(response));
    }

    // Helper to handle potential markdown code blocks in response
    private extractJson(text: string): string {
        let cleanText = text.trim();

        // 1. Try to find content within ```json ... ``` blocks
        const jsonBlockMatch = cleanText.match(/```json([\s\S]*?)```/);
        if (jsonBlockMatch && jsonBlockMatch[1]) {
            return jsonBlockMatch[1].trim();
        }

        // 2. Try to find content within generic ``` ... ``` blocks
        const genericBlockMatch = cleanText.match(/```([\s\S]*?)```/);
        if (genericBlockMatch && genericBlockMatch[1]) {
            return genericBlockMatch[1].trim();
        }

        // 3. Fallback: Find the first { and last }
        const start = cleanText.indexOf('{');
        const end = cleanText.lastIndexOf('}');

        if (start !== -1 && end !== -1 && end > start) {
            // Check if it looks like there is garbage after the last }
            // Sometimes models add "Hope this helps!" after the JSON
            const candidate = cleanText.substring(start, end + 1);

            // Basic validation - check if it parses. If not, maybe it's truncated?
            // But if we found a closing }, it's likely complete.
            return candidate;
        }

        // 4. Truncation handling (Last resort)
        // If we found a start { but no end }, it might be truncated.
        // In this case, we can't easily "fix" it into valid JSON reliably without potentially corrupting data.
        // It is better to fail and let the retry mechanism (if any) or user know.
        // However, for "unterminated string", it usually means the response stopped mid-string.

        return cleanText;
    }
}
