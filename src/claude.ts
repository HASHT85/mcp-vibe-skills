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
    Output MUST be valid JSON matching this schema:
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
    Output MUST be valid JSON matching this schema:
    {
      "title": "string",
      "overview": "string",
      "userStories": [{ "story": "string", "acceptanceCriteria": ["string"], "priority": "High" }],
      "functionalRequirements": ["string"],
      "nonFunctionalRequirements": ["string"]
    }`;

        const response = await this.callClaude(system, JSON.stringify(analysis));
        return JSON.parse(this.extractJson(response));
    }

    // 3. Agent Architect (Combined with Skills.sh)
    async designArchitecture(prd: PRD): Promise<ArchitectureDesign> {
        const system = `You are an Expert Software Architect using the BMAD methodology.
    Design the technical architecture for this PRD.
    You MUST prioritize using standard "skills" (reusable modules) where possible.
    Common skills to consider: "stripe", "supabase", "auth0", "tailwind", "react", "node-express", "postgresql".
    
    Output MUST be valid JSON matching this schema:
    {
      "stack": { "frontend": "string", "backend": "string", "database": "string", "deployment": "Dokploy" },
      "skills": [{ "name": "string", "reason": "string" }],
      "fileStructure": [{ "path": "string", "description": "string" }]
    }`;

        const response = await this.callClaude(system, JSON.stringify(prd));
        return JSON.parse(this.extractJson(response));
    }

    // 4. Agent SecOps (Design Review)
    async securityReview(architecture: ArchitectureDesign): Promise<SecurityAudit> {
        const system = `You are an Expert Security Engineer (SecOps).
    Review this architecture for security risks (OWASP Top 10).
    Output MUST be valid JSON matching this schema:
    {
      "risks": [{ "severity": "High", "description": "string", "mitigation": "string" }],
      "approved": boolean
    }`;

        const response = await this.callClaude(system, JSON.stringify(architecture));
        return JSON.parse(this.extractJson(response));
    }

    // 5. Agent Developer
    async generateCode(architecture: ArchitectureDesign, prd: PRD): Promise<CodeGeneration> {
        const system = `You are an Expert Full-Stack Developer.
    Generate the initial codebase structure and key configuration files based on the architecture and PRD.
    Do not generate binary files. Focus on: package.json, Dockerfile, main configuration files, and key source files.
    
    Output MUST be valid JSON matching this schema:
    {
      "files": [{ "path": "string (relative)", "content": "string (file content)" }],
      "instructions": "string (setup instructions)"
    }`;

        const prompt = `PRD: ${JSON.stringify(prd)}\nArchitecture: ${JSON.stringify(architecture)}`;
        const response = await this.callClaude(system, prompt);
        return JSON.parse(this.extractJson(response));
    }

    // 6. Agent QA
    async qaReview(code: CodeGeneration): Promise<QAReport> {
        const system = `You are an Expert QA Engineer.
    Review the generated code for syntax errors, logical bugs, and missing requirements.
    Output MUST be valid JSON matching this schema:
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
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        return jsonMatch ? jsonMatch[0] : text;
    }
}
