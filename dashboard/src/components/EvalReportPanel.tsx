// EvalReportPanel.tsx — Phase 3B: Affichage du rapport d'évaluation
// Composant Neural Glass, thème VEIST (dark, cyan/violet, fond #0A0A0B)
import type { EvalReport, EvalCheck } from '../api/client';

const CHECK_LABELS: Record<EvalCheck['name'], { label: string; pts: number }> = {
  http_200:           { label: 'Accessibilité HTTP',   pts: 40 },
  no_console_errors:  { label: 'Logs container',       pts: 30 },
  build_artifacts:    { label: 'Artifacts de build',   pts: 20 },
  file_structure:     { label: 'Structure fichiers',   pts: 10 },
};

const RECOMMENDATION_CONFIG: Record<
  EvalReport['recommendation'],
  { label: string; color: string; bg: string; border: string }
> = {
  SHIP:             { label: 'SHIP',             color: '#34d399', bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.3)' },
  SHIP_WITH_ISSUES: { label: 'SHIP_W_ISSUES',   color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)' },
  FIX:              { label: 'FIX',              color: '#FF6A3D', bg: 'rgba(255,106,61,0.08)',  border: 'rgba(255,106,61,0.3)' },
};

function scoreColor(score: number): string {
  if (score >= 70) return '#34d399';
  if (score >= 50) return '#F59E0B';
  return '#FF6A3D';
}

interface Props {
  report: EvalReport;
  deployedUrl?: string;
}


export function EvalReportPanel({ report, deployedUrl }: Props) {
  const rec = RECOMMENDATION_CONFIG[report.recommendation];
  const sc = scoreColor(report.score);

  return (
    <div
      className="flex flex-col gap-0 overflow-hidden"
      style={{
        background: '#0A0A0B',
        border: '1px solid rgba(255,255,255,0.06)',
        fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace",
      }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{
          background: 'linear-gradient(90deg, rgba(16,16,20,0.95) 0%, rgba(20,20,21,0.95) 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="flex items-center gap-3">
          {/* Icon */}
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: sc }}>
            verified
          </span>
          <span
            className="text-[10px] font-bold tracking-widest uppercase"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            EVAL REPORT
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Cycle badge */}
          <span
            className="text-[9px] font-bold px-2 py-0.5 uppercase tracking-widest"
            style={{
              color: 'rgba(215,255,47,0.6)',
              background: 'rgba(215,255,47,0.06)',
              border: '1px solid rgba(215,255,47,0.15)',
            }}
          >
            CYCLE {report.cycle}/3
          </span>

          {/* Recommendation badge */}
          <span
            className="text-[9px] font-black px-2 py-0.5 uppercase tracking-widest"
            style={{ color: rec.color, background: rec.bg, border: `1px solid ${rec.border}` }}
          >
            {rec.label}
          </span>

          {/* Score badge */}
          <span
            className="text-sm font-black tabular-nums"
            style={{ color: sc, textShadow: `0 0 12px ${sc}66` }}
          >
            {report.score}
            <span style={{ fontSize: '0.55rem', opacity: 0.6, marginLeft: 1 }}>/100</span>
          </span>
        </div>
      </div>

      {/* Score bar */}
      <div
        className="h-[3px] w-full"
        style={{ background: 'rgba(255,255,255,0.04)' }}
      >
        <div
          className="h-full transition-all duration-700"
          style={{
            width: `${report.score}%`,
            background: `linear-gradient(90deg, ${sc}99, ${sc})`,
            boxShadow: `0 0 8px ${sc}66`,
          }}
        />
      </div>

      {/* ── Checks ── */}
      <div className="flex flex-col divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
        {report.checks.map((check) => {
          const meta = CHECK_LABELS[check.name];
          return (
            <div
              key={check.name}
              className="flex items-start gap-3 px-4 py-2.5"
              style={{
                background: check.pass
                  ? 'transparent'
                  : 'rgba(255,106,61,0.03)',
              }}
            >
              {/* Pass/Fail icon */}
              <span
                className="shrink-0 mt-0.5 text-[14px] material-symbols-outlined"
                style={{ color: check.pass ? '#34d399' : '#FF6A3D' }}
              >
                {check.pass ? 'check_circle' : 'cancel'}
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: check.pass ? 'rgba(255,255,255,0.75)' : '#FF6A3D' }}
                  >
                    {meta?.label ?? check.name}
                  </span>
                  <span
                    className="shrink-0 text-[9px] font-bold tabular-nums"
                    style={{ color: 'rgba(255,255,255,0.2)' }}
                  >
                    {check.weight}pts
                  </span>
                </div>
                <p
                  className="text-[9px] leading-relaxed mt-0.5 break-words"
                  style={{ color: 'rgba(255,255,255,0.35)' }}
                >
                  {check.detail}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Fix Instructions ── */}
      {report.fixInstructions && (
        <div
          className="px-4 py-3 mx-4 mb-3 mt-1"
          style={{
            background: 'rgba(255,106,61,0.06)',
            border: '1px solid rgba(255,106,61,0.15)',
          }}
        >
          <div
            className="text-[9px] font-bold uppercase tracking-widest mb-1.5"
            style={{ color: '#FF6A3D' }}
          >
            FIX INSTRUCTIONS
          </div>
          <p
            className="text-[10px] leading-relaxed break-words whitespace-pre-wrap"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            {report.fixInstructions}
          </p>
        </div>
      )}

      {/* ── Deployed URL ── */}
      {deployedUrl && (
        <div
          className="px-4 py-2 flex items-center gap-2"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <span
            className="material-symbols-outlined text-[12px]"
            style={{ color: 'rgba(215,255,47,0.4)' }}
          >
            link
          </span>
          <a
            href={deployedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[9px] truncate hover:underline"
            style={{ color: 'rgba(215,255,47,0.6)' }}
          >
            {deployedUrl}
          </a>
        </div>
      )}

      {/* ── Timestamp ── */}
      <div
        className="px-4 py-2 text-[8px] flex items-center justify-end gap-2"
        style={{
          color: 'rgba(255,255,255,0.15)',
          borderTop: '1px solid rgba(255,255,255,0.04)',
        }}
      >
        <span className="material-symbols-outlined text-[10px]">schedule</span>
        {new Date(report.timestamp).toLocaleString()}
      </div>
    </div>
  );
}
