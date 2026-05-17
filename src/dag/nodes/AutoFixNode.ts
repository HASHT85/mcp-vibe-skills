/**
 * AutoFixNode — Phase 3: Self-Healing Corrections
 * 
 * Activated only when EvalNode emits FIX_AND_REEVAL.
 * Receives the evaluation report and surgically fixes identified issues.
 * After fixing, the pipeline re-runs QA → Deploy → Eval.
 */

import { AgentNode } from "./AgentNode.js";
import type { NodeContext } from "../Node.js";
import type { EvalReport } from "../../types.js";

export class AutoFixNode extends AgentNode {
    constructor(model?: string) {
        super({
            id: "autofix",
            name: "Auto-correction des problèmes",
            role: "AutoFixer",
            emoji: "🔧",
            model,
            dependencies: ["eval"],
            maxTurns: 25,
            allowedTools: [
                "read_file", "write_file", "replace_in_file", 
                "bash", "list_dir", "read_memory", "write_memory"
            ],
        });
    }

    protected getPrompt(context: NodeContext): string {
        const report = context.pipeline.artifacts.evalReport as EvalReport | undefined;
        
        if (!report) {
            return `Vérifie que le projet build correctement avec "npm run build" et corrige les erreurs éventuelles.`;
        }

        const failedChecks = report.checks.filter(c => !c.pass);
        const passedChecks = report.checks.filter(c => c.pass);

        return `L'auto-évaluation du déploiement a détecté des problèmes dans le projet.

📊 SCORE: ${report.score}/100 (minimum requis: 70)
🔄 CYCLE: ${report.cycle}/3

✅ CHECKS RÉUSSIS:
${passedChecks.length > 0 ? passedChecks.map(c => `  ✓ ${c.name} (${c.weight}pts): ${c.detail}`).join('\n') : '  Aucun'}

❌ CHECKS ÉCHOUÉS:
${failedChecks.map(c => `  ✗ ${c.name} (${c.weight}pts): ${c.detail}`).join('\n')}

${report.fixInstructions ? `\n📋 INSTRUCTIONS DE CORRECTION:\n${report.fixInstructions}` : ''}

=== WORKFLOW DE CORRECTION ===

1. Lis d'abord les fichiers concernés par les erreurs (list_dir, read_file)
2. Identifie la cause racine de chaque check échoué
3. Applique des corrections CHIRURGICALES (replace_in_file quand possible)
4. Si le check "http_200" a échoué :
   - Vérifie le Dockerfile (ports exposés, CMD correct)
   - Vérifie le docker-compose.prod.yml (labels Traefik, réseau web)
   - Vérifie que le build produit un output dans dist/ ou build/
5. Si le check "no_console_errors" a échoué :
   - Lis les logs container pour identifier l'erreur exacte
   - Corrige les fichiers source qui causent l'erreur
6. Après toutes les corrections : lance "npm run build" pour vérifier

⚠️ RÈGLES CRITIQUES:
- NE RÉÉCRIS PAS tout le projet, corrige uniquement les problèmes
- NE CHANGE PAS la stack technologique
- NE SUPPRIME PAS de fonctionnalités
- Utilise replace_in_file pour les petites corrections, pas write_file`;
    }

    protected getSystemPrompt(context: NodeContext): string {
        return `Tu es un expert en debugging et correction de bugs. Tu reçois un rapport d'évaluation automatique avec des checks qui ont échoué.

TON OBJECTIF: Corriger les problèmes identifiés de manière MINIMALE et PRÉCISE.

PRIORITÉS (par poids):
1. http_200 (40pts) — Le site doit être accessible. Vérifie Dockerfile, ports, Traefik labels.
2. no_console_errors (30pts) — Pas de crashs. Corrige les TypeError, imports manquants, etc.
3. build_artifacts (20pts) — Le build doit produire un output. Vérifie les scripts npm.
4. file_structure (10pts) — Les fichiers essentiels doivent exister.

APPROCHE:
- Lis AVANT de modifier
- Corrections chirurgicales (replace_in_file > write_file)
- Teste avec "npm run build" après les corrections
- Économise les turns: regroupe les petites corrections`;
    }
}
