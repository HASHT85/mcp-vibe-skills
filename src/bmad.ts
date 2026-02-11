import { ClaudeClient, ProjectAnalysis, PRD, ArchitectureDesign, SecurityAudit, CodeGeneration, QAReport } from './claude.js';

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
    };
    error?: string;
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

    // Create a new pipeline
    createPipeline(projectId: string, description: string): BmadState {
        const state: BmadState = {
            projectId,
            currentPhase: 'IDLE',
            input: description,
            artifacts: {},
        };
        this.pipelines.set(projectId, state);
        return state;
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
                    state.artifacts.code = await this.claude.generateCode(state.artifacts.architecture, state.artifacts.prd);
                    state.currentPhase = 'QA';
                    break;

                case 'QA': // Ready to test
                    if (!state.artifacts.code) throw new Error("Missing Code artifact");
                    state.artifacts.qaReport = await this.claude.qaReview(state.artifacts.code);
                    state.currentPhase = 'COMPLETED';
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
