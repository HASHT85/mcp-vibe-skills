import { motion } from 'framer-motion';
import { CheckCircle2, Circle, Loader2, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

type PhaseStatus = 'pending' | 'running' | 'completed' | 'error';

interface PhaseProps {
    label: string;
    status: PhaseStatus;
    isLast?: boolean;
}

const phases = [
    { id: 'analysis', label: 'Analysis' },
    { id: 'planning', label: 'Planning (PM)' },
    { id: 'architecture', label: 'Architecture' },
    { id: 'design_review', label: 'Design Review' },
    { id: 'development', label: 'Development' },
    { id: 'security', label: 'SecOps Audit' },
    { id: 'qa', label: 'QA Testing' },
];

export function BmadPipeline({ currentPhase }: { currentPhase: string }) {
    const getStatus = (phaseId: string): PhaseStatus => {
        // This logic needs to map backend phase names to these IDs
        // For mock purposes:
        if (currentPhase === phaseId) return 'running';
        // basic logic: if index < currentIndex return completed
        return 'pending';
    };

    return (
        <div className="w-full py-8 glass-panel rounded-xl border border-white/5 p-6">
            <h3 className="text-xl font-semibold mb-6">Pipeline Progress</h3>
            <div className="flex justify-between items-center relative">
                {/* Progress Line Background */}
                <div className="absolute top-1/2 left-0 w-full h-1 bg-white/5 -z-0" />

                {phases.map((phase, idx) => (
                    <PhaseStep
                        key={phase.id}
                        label={phase.label}
                        status={getStatus(phase.id)}
                        isLast={idx === phases.length - 1}
                    />
                ))}
            </div>
        </div>
    );
}

function PhaseStep({ label, status, isLast }: PhaseProps) {
    return (
        <div className="relative flex flex-col items-center z-10">
            <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={clsx(
                    "w-10 h-10 rounded-full flex items-center justify-center border-4 transition-colors duration-300",
                    status === 'completed' && "bg-green-500 border-green-900 text-white",
                    status === 'running' && "bg-primary border-primary/30 text-white animate-pulse",
                    status === 'pending' && "bg-surface border-white/10 text-gray-500",
                    status === 'error' && "bg-red-500 border-red-900 text-white"
                )}
            >
                {status === 'completed' && <CheckCircle2 size={18} />}
                {status === 'running' && <Loader2 size={18} className="animate-spin" />}
                {status === 'pending' && <Circle size={18} />}
                {status === 'error' && <AlertCircle size={18} />}
            </motion.div>

            <span className={clsx(
                "absolute top-14 text-xs font-medium w-32 text-center transition-colors duration-300",
                status === 'running' || status === 'completed' ? "text-white" : "text-gray-500"
            )}>
                {label}
            </span>
        </div>
    );
}
