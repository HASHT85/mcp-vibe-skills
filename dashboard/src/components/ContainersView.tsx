import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Play, Square, RotateCcw, Trash2, Terminal, ExternalLink, X } from 'lucide-react';
import { listContainers, stopContainer, startContainer, restartContainer, deleteContainer, getContainerLogs } from '../api/client';
import type { Container } from '../api/client';

export function ContainersView() {
    const [containers, setContainers] = useState<Container[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [logsModal, setLogsModal] = useState<{ name: string; logs: string } | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const data = await listContainers();
            setContainers(data.containers || []);
        } catch (err) {
            console.warn('Failed to load containers:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        const id = setInterval(load, 8000);
        return () => clearInterval(id);
    }, [load]);

    const doAction = async (name: string, action: () => Promise<any>) => {
        setActionLoading(name);
        try {
            await action();
            await load();
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    const showLogs = async (name: string) => {
        try {
            const data = await getContainerLogs(name, 150);
            setLogsModal({ name, logs: data.logs });
        } catch (err: any) {
            setLogsModal({ name, logs: `Error: ${err.message}` });
        }
    };

    const handleDelete = async (name: string) => {
        setConfirmDelete(null);
        await doAction(name, () => deleteContainer(name));
    };

    return (
        <motion.div
            className="view-container"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
        >
            <div className="view-header">
                <h2>🐳 Containers</h2>
                <button className="btn-icon" onClick={load} title="Refresh">
                    <RefreshCw size={16} />
                </button>
            </div>

            {loading ? (
                <div className="empty-state">Loading containers...</div>
            ) : containers.length === 0 ? (
                <div className="empty-state">
                    <p>No VibeCraft containers found.</p>
                    <p style={{ fontSize: '0.85rem', opacity: 0.6 }}>Launch a pipeline to deploy a container.</p>
                </div>
            ) : (
                <div className="containers-grid">
                    {containers.map((c) => (
                        <div key={c.id} className={`container-card ${c.state}`}>
                            <div className="container-card-header">
                                <span className={`state-dot ${c.state}`} />
                                <span className="container-name">{c.name}</span>
                                {c.url && (
                                    <a href={c.url} target="_blank" rel="noopener" className="container-url" title={c.url}>
                                        <ExternalLink size={14} />
                                    </a>
                                )}
                            </div>

                            <div className="container-info">
                                <span className="container-image">{c.image}</span>
                                <span className="container-status">{c.status}</span>
                            </div>

                            <div className="container-actions">
                                {c.state === 'running' ? (
                                    <>
                                        <button
                                            className="btn-sm btn-warning"
                                            onClick={() => doAction(c.name, () => stopContainer(c.name))}
                                            disabled={actionLoading === c.name}
                                            title="Stop"
                                        >
                                            <Square size={12} /> Stop
                                        </button>
                                        <button
                                            className="btn-sm btn-info"
                                            onClick={() => doAction(c.name, () => restartContainer(c.name))}
                                            disabled={actionLoading === c.name}
                                            title="Restart"
                                        >
                                            <RotateCcw size={12} /> Restart
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        className="btn-sm btn-success"
                                        onClick={() => doAction(c.name, () => startContainer(c.name))}
                                        disabled={actionLoading === c.name}
                                        title="Start"
                                    >
                                        <Play size={12} /> Start
                                    </button>
                                )}
                                <button
                                    className="btn-sm btn-neutral"
                                    onClick={() => showLogs(c.name)}
                                    title="Logs"
                                >
                                    <Terminal size={12} /> Logs
                                </button>
                                <button
                                    className="btn-sm btn-danger"
                                    onClick={() => setConfirmDelete(c.name)}
                                    disabled={actionLoading === c.name}
                                    title="Delete"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>

                            {actionLoading === c.name && (
                                <div className="container-loading">Processing...</div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Logs Modal */}
            {logsModal && (
                <div className="modal-overlay" onClick={() => setLogsModal(null)}>
                    <div className="modal-content logs-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>📋 Logs: {logsModal.name}</h3>
                            <button className="btn-icon" onClick={() => setLogsModal(null)}>
                                <X size={18} />
                            </button>
                        </div>
                        <pre className="logs-content">{logsModal.logs}</pre>
                        <div className="modal-footer">
                            <button className="btn-sm btn-neutral" onClick={() => showLogs(logsModal.name)}>
                                <RefreshCw size={12} /> Refresh
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm Delete */}
            {confirmDelete && (
                <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
                    <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
                        <h3>⚠️ Delete Container</h3>
                        <p>Delete <strong>{confirmDelete}</strong> and its image?</p>
                        <div className="confirm-actions">
                            <button className="btn-sm btn-neutral" onClick={() => setConfirmDelete(null)}>Cancel</button>
                            <button className="btn-sm btn-danger" onClick={() => handleDelete(confirmDelete!)}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </motion.div>
    );
}
