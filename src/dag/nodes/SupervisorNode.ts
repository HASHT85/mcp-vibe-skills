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
            Ton rôle est de vérifier RAPIDEMENT le résultat.
            
            1. Liste les fichiers du répertoire courant et vérifie que les fichiers essentiels existent (package.json, src/, etc.)
            2. REJETTE UNIQUEMENT si une de ces conditions est vraie:
               - Aucun fichier source n'a été créé
               - Il manque le fichier d'entrée principal (App.tsx/main.tsx pour React, index.js pour Node)
               - Le package.json est absent ou invalide
            3. VALIDE dans tous les autres cas, même si le code n'est pas parfait. Le QA corrigera les erreurs de build.

            NE REJETTE PAS pour:
            - Des erreurs de style ou de qualité de code
            - Des fonctionnalités manquantes mineures
            - Des warnings TypeScript
            - L'absence de tests

            Format de réponse OBLIGATOIRE (JSON) :
            {
                "decision": "VALID" | "REJECT",
                "feedback": "Si REJECT, explique brièvement le problème bloquant."
            }
        `;
    }

    protected getSystemPrompt(context: NodeContext): string {
        return "Tu es un Tech Lead pragmatique. Vérifie RAPIDEMENT que les fichiers essentiels existent. Accepte le travail sauf s'il est fondamentalement cassé (aucun code créé, fichiers d'entrée manquants). Rends uniquement un objet JSON contenant 'decision' et 'feedback'. Économise les turns: ne lis pas chaque fichier, vérifie juste la structure.";
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
