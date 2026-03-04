import { useEffect, useRef } from 'react';
import type { PipelineEvent } from '../api/client';
import { formatTime } from '../utils';

export function Terminal({ events }: { events: PipelineEvent[] }) {
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [events.length]);

    return (
        <div className="terminal">
            <div className="terminal-header">
                <div className="terminal-dots">
                    <span /><span /><span />
                </div>
                Pipeline Events ({events.length})
            </div>
            <div className="terminal-body">
                {events.map((ev) => (
                    <div key={ev.id} className={`terminal-line ${ev.type}`}>
                        <span className="terminal-time" style={{ fontFamily: 'var(--font-mono)' }}>
                            {formatTime(ev.timestamp)}
                        </span>
                        <span className="terminal-agent" style={{ fontFamily: 'var(--font-mono)' }}>
                            {ev.agentEmoji} {ev.agentRole}
                        </span>
                        <span className="terminal-msg" style={{ fontFamily: 'var(--font-mono)' }}>
                            {ev.action}
                        </span>
                    </div>
                ))}
                <div ref={endRef} />
            </div>
        </div>
    );
}
