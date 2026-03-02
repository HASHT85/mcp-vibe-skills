import { AgentNode } from "./AgentNode.js";
import { type NodeContext } from "../Node.js";
import { tryParseJson } from "../../utils/project_helpers.js";

export class SupervisorNode extends AgentNode {
    private targetNodeId: string;

    constructor(targetNodeId: string, dependencies: string[] = []) {
        super({
            id: `supervisor_for_${targetNodeId}`,
            name: `Revue de code (${targetNodeId})`,
            role: "Supervisor",
            emoji: "👁️",
            dependencies,
            allowedTools: ["bash", "read_file", "list_dir", "read_memory", "write_memory"],
            maxTurns: 10
        });
        this.targetNodeId = targetNodeId;
    }

    protected getPrompt(context: NodeContext): string {
        return `
            L'agent responsable de l'étape "${this.targetNodeId}" vient de terminer son travail.
            Ton rôle est de réviser rigoureusement ce qu'il a fait dans le répertoire actuel.
            
            1. Vérifie le code source, s'il compile, ou si les fichiers requis sont bien là.
            2. Si tu détectes une erreur bloquante ou un travail manifestement incomplet, tu DOIS retourner un signal de REJET avec des instructions claires sur ce qu'il faut corriger.
            3. Si tout semble correct, retourne un signal de VALIDATION.

            Format de réponse OBLIGATOIRE (en texte brut format JSON) :
            {
                "decision": "VALID" | "REJECT",
                "feedback": "Si decision=REJECT, explique de façon très technique ce qui ne va pas et ce que l'agent précédent doit corriger."
            }
        `;
    }

    protected getSystemPrompt(context: NodeContext): string {
        return "Tu es un Tech Lead impitoyable. Ton seul but est d'inspecter unitairement le rendu. Rends uniquement un objet JSON contenant 'decision' et 'feedback'.";
    }

    protected processResult(output: string, context: NodeContext): any {
        const jsonMatch = tryParseJson(output);

        if (jsonMatch && jsonMatch.decision === "REJECT") {
            context.updateAgentStatus("Supervisor", "done", `Rejeté: retour à ${this.targetNodeId}`);
            // Special control flow signal to GraphManager
            return {
                _action: "RESET_NODE",
                targetId: this.targetNodeId,
                feedback: jsonMatch.feedback || "Travail incorrect."
            };
        }

        context.updateAgentStatus("Supervisor", "done", "Code approuvé.");
        return jsonMatch || { status: "VALID" };
    }
}
