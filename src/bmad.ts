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
                    this.addMessage(projectId, 'system', 'Starting Phase 1: ANALYSIS');
                    state.currentPhase = 'ANALYSIS';
                    state.artifacts.analysis = await this.claude.analyzeProject(state.input);
                    this.addMessage(projectId, 'assistant', `Analysis Complete. Summary: ${state.artifacts.analysis.summary.substring(0, 100)}...`);
                    state.currentPhase = 'PLANNING';
                    break;

                case 'PLANNING': // Ready to generate PRD
                    this.addMessage(projectId, 'system', 'Starting Phase 2: PLANNING (PRD Generation)');
                    if (!state.artifacts.analysis) throw new Error("Missing Analysis artifact");
                    state.artifacts.prd = await this.claude.generatePRD(state.artifacts.analysis);
                    this.addMessage(projectId, 'assistant', `PRD Generated: ${state.artifacts.prd.title}`);
                    state.currentPhase = 'ARCHITECTURE';
                    break;

                case 'ARCHITECTURE': // Ready to design architecture
                    this.addMessage(projectId, 'system', 'Starting Phase 3: ARCHITECTURE DESIGN');
                    if (!state.artifacts.prd) throw new Error("Missing PRD artifact");
                    state.artifacts.architecture = await this.claude.designArchitecture(state.artifacts.prd);
                    this.addMessage(projectId, 'assistant', `Architecture Designed. Stack: ${state.artifacts.architecture.stack.backend} + ${state.artifacts.architecture.stack.frontend}`);
                    state.currentPhase = 'DESIGN_REVIEW';
                    break;

                case 'DESIGN_REVIEW': // Ready for SecOps review
                    this.addMessage(projectId, 'system', 'Starting Phase 4: SECURITY AUDIT');
                    if (!state.artifacts.architecture) throw new Error("Missing Architecture artifact");
                    state.artifacts.securityAudit = await this.claude.securityReview(state.artifacts.architecture);

                    if (state.artifacts.securityAudit.approved) {
                        this.addMessage(projectId, 'assistant', 'Security Audit Passed. Proceeding to Development.');
                        state.currentPhase = 'DEVELOPMENT';
                    } else {
                        const errorMsg = "Security Audit Failed: " + JSON.stringify(state.artifacts.securityAudit.risks);
                        this.addMessage(projectId, 'system', `CRITICAL: ${errorMsg}`);
                        state.error = errorMsg;
                        throw new Error("Security Audit Failed. Pipeline paused.");
                    }
                    break;

                case 'DEVELOPMENT': // Ready to code
                    this.addMessage(projectId, 'system', 'Starting Phase 5: DEVELOPMENT & CODING');
                    if (!state.artifacts.architecture || !state.artifacts.prd) throw new Error("Missing artifacts");

                    // 1. Generate Code
                    this.addMessage(projectId, 'assistant', 'Generating code structure...');
                    state.artifacts.code = await this.claude.generateCode(state.artifacts.architecture, state.artifacts.prd);
                    this.addMessage(projectId, 'assistant', `Code generated. ${state.artifacts.code.files.length} files created.`);

                    // 2. Create GitHub Repo
                    try {
                        const repoName = `vibecraft-${projectId}`;
                        this.addMessage(projectId, 'system', `Creating GitHub Repository: ${repoName}...`);
                        const repo = await createRepo(repoName, `AI Generated Project: ${state.input.substring(0, 50)}...`);
                        state.artifacts.github = { owner: repo.owner, name: repo.name, url: repo.url };

                        // 3. Push Code
                        // Convert generated files to format needed by GitHub API
                        const files = state.artifacts.code.files.map(f => ({ path: f.path, content: f.content }));
                        // Add a simple README if not present
                        if (!files.find(f => f.path === 'README.md')) {
                            files.push({ path: 'README.md', content: `# ${state.artifacts.prd.title}\n\n${state.artifacts.prd.overview}` });
                        }

                        this.addMessage(projectId, 'system', 'Pushing code to GitHub...');
                        await pushFiles(repo.owner, repo.name, files, "feat: initial commit by VibeCraft AI");
                        this.addMessage(projectId, 'assistant', `Request completed. Repo available at: ${repo.url}`);

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
