// QUAL-27: Clean import (no @ts-ignore needed)
import { EventEmitter } from "node:events";
import type { DagNode, NodeContext } from "./Node.js";

export class GraphManager extends (EventEmitter as any) {
    private nodes: Map<string, DagNode> = new Map();
    private context: NodeContext;
    private running = false;
    private error: Error | null = null;
    private rejectionCounts: Map<string, number> = new Map();
    private static readonly MAX_REJECTIONS = 2;

    constructor(context: NodeContext) {
        super();
        this.context = context;
    }

    addNode(node: DagNode) {
        this.nodes.set(node.id, node);
    }

    /** Pre-mark a node as completed (for resume/retry — skips execution) */
    markCompleted(nodeId: string) {
        const node = this.nodes.get(nodeId);
        if (node) {
            node.status = "COMPLETED";
        }
    }

    async executeAll(): Promise<void> {
        this.running = true;
        // Generic concurrent executor
        return new Promise<void>((resolve, reject) => {
            const checkExecution = () => {
                if (this.context.checkAbort() || this.error) {
                    this.running = false;
                    return reject(this.error || new Error("Pipeline Aborted"));
                }

                const allDone = Array.from(this.nodes.values()).every(n => n.status === "COMPLETED" || n.status === "SKIPPED");
                if (allDone) {
                    this.running = false;
                    return resolve();
                }

                const failed = Array.from(this.nodes.values()).find(n => n.status === "FAILED");
                if (failed) {
                    this.running = false;
                    return reject(failed.error);
                }

                // Find runnable nodes
                for (const [id, node] of this.nodes) {
                    if (node.status === "PENDING") {
                        const canRun = node.dependencies.every(depId => {
                            const dep = this.nodes.get(depId);
                            return dep && (dep.status === "COMPLETED" || dep.status === "SKIPPED");
                        });
                        if (canRun) {
                            node.status = "RUNNING";
                            this.emit("node-start", node);

                            node.execute(this.context).then(res => {
                                // Support for feedback loops (Supervisor -> Node)
                                if (res && res._action === "RESET_NODE" && res.targetId) {
                                    // Track rejection count per target node
                                    const count = (this.rejectionCounts.get(res.targetId) || 0) + 1;
                                    this.rejectionCounts.set(res.targetId, count);

                                    if (count >= GraphManager.MAX_REJECTIONS) {
                                        // Max rejections reached — auto-accept to prevent token waste
                                        console.log(`[Graph] Max rejections (${GraphManager.MAX_REJECTIONS}) reached for ${res.targetId}, auto-accepting`);
                                        node.status = "COMPLETED";
                                        node.result = { status: "VALID", note: "Auto-accepted after max rejections" };
                                        this.emit("node-complete", { node, result: node.result });
                                        checkExecution();
                                        return;
                                    }

                                    this.emit("node-feedback", { node, target: res.targetId, feedback: res.feedback });

                                    // Reset target node
                                    const targetNode = this.nodes.get(res.targetId);
                                    if (targetNode) {
                                        targetNode.reset();
                                        (targetNode as any).supervisorFeedback = res.feedback;
                                    }

                                    // Reset all nodes that depend on the target node, including THIS supervisor node
                                    this.resetDependents(res.targetId);

                                    checkExecution();
                                    return;
                                }

                                // Phase 3: Support for eval feedback loop (Eval → AutoFix → QA → Deploy → Eval)
                                if (res && res._action === "FIX_AND_REEVAL" && res.report) {
                                    const evalCycle = res.report.cycle || 1;

                                    this.emit("node-feedback", {
                                        node,
                                        target: "autofix",
                                        feedback: `Eval cycle ${evalCycle}: score ${res.report.score}/100`
                                    });

                                    // Mark eval as completed (it produced a result)
                                    node.status = "COMPLETED";
                                    node.result = res.report;

                                    // Reset the fix chain: autofix → qa → deploy → eval
                                    for (const resetId of ["autofix", "qa", "deploy", "eval"]) {
                                        const resetNode = this.nodes.get(resetId);
                                        if (resetNode && resetId !== node.id) {
                                            resetNode.reset();
                                        }
                                    }
                                    // Reset eval itself (so it re-runs after deploy)
                                    node.reset();

                                    checkExecution();
                                    return;
                                }

                                node.status = "COMPLETED";
                                node.result = res;
                                this.emit("node-complete", { node, result: res });
                                checkExecution();
                            }).catch(err => {
                                node.status = "FAILED";
                                node.error = err;
                                this.error = err;
                                this.emit("node-fail", { node, error: err });
                                checkExecution();
                            });
                        }
                    }
                }

                // LOGIC-03: Deadlock detection — if no node is RUNNING and no node is runnable,
                // but we haven't resolved/rejected yet, then we have a deadlock (orphaned dependency).
                const anyRunning = Array.from(this.nodes.values()).some(n => n.status === "RUNNING");
                if (!anyRunning) {
                    const pendingNodes = Array.from(this.nodes.values()).filter(n => n.status === "PENDING");
                    if (pendingNodes.length > 0) {
                        this.running = false;
                        const stuck = pendingNodes.map(n => `${n.id}(deps: ${n.dependencies.join(',')})`).join(', ');
                        return reject(new Error(`Pipeline deadlock: nodes stuck in PENDING with unresolvable dependencies: ${stuck}`));
                    }
                }
            };

            checkExecution();
        });
    }

    private resetDependents(targetId: string) {
        for (const [id, node] of this.nodes) {
            if (node.dependencies.includes(targetId) || this.isTransitiveDependent(id, targetId)) {
                node.reset();
            }
        }
    }

    private isTransitiveDependent(nodeId: string, targetId: string, visited: Set<string> = new Set()): boolean {
        if (visited.has(nodeId)) return false; // Guard against circular deps
        visited.add(nodeId);
        const node = this.nodes.get(nodeId);
        if (!node) return false;
        if (node.dependencies.includes(targetId)) return true;
        for (const dep of node.dependencies) {
            if (this.isTransitiveDependent(dep, targetId, visited)) return true;
        }
        return false;
    }
}
