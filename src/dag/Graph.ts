// @ts-ignore
import { EventEmitter } from "node:events";
import type { DagNode, NodeContext } from "./Node.js";

export class GraphManager extends (EventEmitter as any) {
    private nodes: Map<string, DagNode> = new Map();
    private context: NodeContext;
    private running = false;
    private error: Error | null = null;

    constructor(context: NodeContext) {
        super();
        this.context = context;
    }

    addNode(node: DagNode) {
        this.nodes.set(node.id, node);
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
                                    this.emit("node-feedback", { node, target: res.targetId, feedback: res.feedback });

                                    // Reset target node
                                    const targetNode = this.nodes.get(res.targetId);
                                    if (targetNode) {
                                        targetNode.reset();
                                        // Inject feedback into the target node's context or result so it knows what to fix.
                                        // For simplicity, we can pass it via a special property on the node itself, or let the target node read memory.
                                        // The chosen approach: we store the feedback on the target node.
                                        (targetNode as any).supervisorFeedback = res.feedback;
                                    }

                                    // Reset all nodes that depend on the target node, including THIS supervisor node
                                    this.resetDependents(res.targetId);

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

    private isTransitiveDependent(nodeId: string, targetId: string): boolean {
        const node = this.nodes.get(nodeId);
        if (!node) return false;
        if (node.dependencies.includes(targetId)) return true;
        for (const dep of node.dependencies) {
            if (this.isTransitiveDependent(dep, targetId)) return true;
        }
        return false;
    }
}
