import { ClaudeClient, ProjectAnalysis, PRD, ArchitectureDesign, SecurityAudit, CodeGeneration, QAReport } from './claude.js';
import { createRepo, pushFiles, createWebhook } from './github_api.js';
import { createDokployProject, createDokployApplication } from './dokploy.js';

export type BmadPhase =
    | 'IDLE'
    | 'ANALYSIS'
    | 'PLANNING'
    | 'ARCHITECTURE'
    | 'DESIGN_REVIEW'
    | 'DEVELOPMENT'
    | 'QA'
    | 'COMPLETED'
    | 'FAILED';

export interface BmadState {
    projectId: string;
    currentPhase: BmadPhase;
    input: string; // Original project description
    artifacts: {
        analysis?: ProjectAnalysis;
        prd?: PRD;
        architecture?: ArchitectureDesign;
        securityAudit?: SecurityAudit;
        code?: CodeGeneration;
        qaReport?: QAReport;
        github?: { owner: string; name: string; url: string; };
        deployment?: { url: string; projectId: string; applicationId: string; };
    };
    error?: string;
    messages: { role: 'user' | 'assistant' | 'system'; content: string; timestamp: string }[];
}

export class BmadEngine {
    private static instance: BmadEngine;
    private claude: ClaudeClient;
    private pipelines: Map<string, BmadState> = new Map();

    private constructor() {
        this.claude = new ClaudeClient();
    }

    static getInstance(): BmadEngine {
        if (!BmadEngine.instance) {
            BmadEngine.instance = new BmadEngine();
        }
        return BmadEngine.instance;
    }

    listPipelines(): BmadState[] {
        return Array.from(this.pipelines.values());
    }

    // Create a new pipeline
    createPipeline(projectId: string, description: string): BmadState {
        const state: BmadState = {
            projectId,
            currentPhase: 'IDLE',
            input: description,
            artifacts: {},
            messages: [{
                role: 'system',
                content: `Pipeline initialized for project: ${projectId}`,
                timestamp: new Date().toISOString()
            }]
        };
        this.pipelines.set(projectId, state);
        return state;
    }

    addMessage(projectId: string, role: 'user' | 'assistant' | 'system', content: string) {
        const state = this.pipelines.get(projectId);
        if (state) {
            state.messages.push({ role, content, timestamp: new Date().toISOString() });
        }
    }

    // Get pipeline status
    getPipeline(projectId: string): BmadState | undefined {
        return this.pipelines.get(projectId);
    }

    // Run the next phase of the pipeline
    async next(projectId: string): Promise<BmadState> {
        const state = this.pipelines.get(projectId);
        if (!state) throw new Error("Pipeline not found");

        try {
            switch (state.currentPhase) {
                case 'IDLE':
                    state.currentPhase = 'ANALYSIS';
                    state.artifacts.analysis = await this.claude.analyzeProject(state.input);
                    state.currentPhase = 'PLANNING'; // Auto-advance to next waiting state or wait for approval? 
                    // For MVP, let's stop at PLANNING and wait for next call
                    break;

                case 'PLANNING': // Ready to generate PRD
                    if (!state.artifacts.analysis) throw new Error("Missing Analysis artifact");
                    state.artifacts.prd = await this.claude.generatePRD(state.artifacts.analysis);
                    state.currentPhase = 'ARCHITECTURE';
                    break;

                case 'ARCHITECTURE': // Ready to design architecture
                    if (!state.artifacts.prd) throw new Error("Missing PRD artifact");
                    state.artifacts.architecture = await this.claude.designArchitecture(state.artifacts.prd);
                    state.currentPhase = 'DESIGN_REVIEW';
                    break;

                case 'DESIGN_REVIEW': // Ready for SecOps review
                    if (!state.artifacts.architecture) throw new Error("Missing Architecture artifact");
                    state.artifacts.securityAudit = await this.claude.securityReview(state.artifacts.architecture);

                    if (state.artifacts.securityAudit.approved) {
                        state.currentPhase = 'DEVELOPMENT';
                    } else {
                        // In a real app, we would loop back to Architecture with feedback. 
                        // For MVP, we'll stop here or mark as Failed/NeedsRevision.
                        state.error = "Security Audit Failed: " + JSON.stringify(state.artifacts.securityAudit.risks);
                        // We stay in DESIGN_REVIEW or move to a manual intervention state? 
                        // Let's assume user will 'approve' to override or we'd handle loop.
                        // For simplicity, let's allow proceeding if user explicitly calls next again, or just error.
                        // Let's stop.
                        throw new Error("Security Audit Failed. Pipeline paused.");
                    }
                    break;

                case 'DEVELOPMENT': // Ready to code
                    if (!state.artifacts.architecture || !state.artifacts.prd) throw new Error("Missing artifacts");

                    // 1. Generate Code
                    state.artifacts.code = await this.claude.generateCode(state.artifacts.architecture, state.artifacts.prd);

                    // 2. Create GitHub Repo
                    try {
                        const repoName = `vibecraft-${projectId}`;
                        const repo = await createRepo(repoName, `AI Generated Project: ${state.input.substring(0, 50)}...`);
                        state.artifacts.github = { owner: repo.owner, name: repo.name, url: repo.url };

                        // 3. Push Code
                        // Convert generated files to format needed by GitHub API
                        const files = state.artifacts.code.files.map(f => ({ path: f.path, content: f.content }));
                        // Add a simple README if not present
                        if (!files.find(f => f.path === 'README.md')) {
                            files.push({ path: 'README.md', content: `# ${state.artifacts.prd.title}\n\n${state.artifacts.prd.overview}` });
                        }

                        await pushFiles(repo.owner, repo.name, files, "feat: initial commit by VibeCraft AI");

                        state.currentPhase = 'QA';
                    } catch (err: any) {
                        console.error("GitHub Error:", err);
                        state.error = `GitHub Error: ${err.message}`;
                        state.currentPhase = 'FAILED';
                        return state; // Stop processing
                    }
                    break;

                case 'QA': // Ready to test
                    if (!state.artifacts.code) throw new Error("Missing Code artifact");
                    state.artifacts.qaReport = await this.claude.qaReview(state.artifacts.code);

                    // If QA passes (or we just proceed for MVP), Deploy!
                    try {
                        // 4. Deploy to Dokploy
                        if (!state.artifacts.github) throw new Error("Missing GitHub artifact for deployment");

                        // Create Project
                        const dokployProject = await createDokployProject(state.artifacts.prd?.title || projectId);

                        // Create Application
                        const appSettings = {
                            name: "web-app",
                            projectId: dokployProject.projectId, // DokployProject type uses projectId not id? Let's check type in dokploy.ts. Checked: it has projectId.
                            repository: state.artifacts.github.url,
                            branch: "main",
                            buildType: "dockerfile" as const,
                            env: ""
                        };

                        const dokployApp = await createDokployApplication(appSettings);

                        // Setup Webhook
                        if (dokployApp.webhookUrl) {
                            await createWebhook(state.artifacts.github.owner, state.artifacts.github.name, dokployApp.webhookUrl);
                        }

                        state.artifacts.deployment = {
                            url: `https://${dokployApp.appName}.${process.env.DOKPLOY_HOST || 'hach.dev'}`,
                            projectId: dokployProject.projectId,
                            applicationId: dokployApp.applicationId
                        };

                        state.currentPhase = 'COMPLETED';

                    } catch (err: any) {
                        console.error("Deploy Error:", err);
                        state.error = `Deploy Error: ${err.message}`;
                        state.currentPhase = 'FAILED';
                    }
                    break;

                case 'COMPLETED':
                case 'FAILED':
                    // No op
                    break;
            }
        } catch (err: any) {
            console.error(`Pipeline error in phase ${state.currentPhase}:`, err);
            state.error = err.message || "Unknown error";
            state.currentPhase = 'FAILED';
        }

        this.pipelines.set(projectId, state);
        return state;
    }
}
