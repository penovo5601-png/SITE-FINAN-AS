"use client";

export type Verdict = "SUBIR" | "DESCER" | "NEUTRO";

export function verdictColor(v: Verdict) {
  return v === "SUBIR" ? "text-bull-400" : v === "DESCER" ? "text-bear-400" : "text-amber-signal";
}

export function verdictBg(v: Verdict) {
  return v === "SUBIR"
    ? "bg-bull-500/12 border-bull-500/40 text-bull-300"
    : v === "DESCER"
      ? "bg-bear-500/12 border-bear-500/40 text-bear-300"
      : "bg-amber-signal/12 border-amber-signal/40 text-amber-signal";
}

export function VerdictBadge({ verdict, label, size = "md" }: { verdict: Verdict; label?: string; size?: "sm" | "md" | "lg" }) {
  const arrow = verdict === "SUBIR" ? "▲" : verdict === "DESCER" ? "▼" : "◆";
  const cls =
    size === "lg"
      ? "px-4 py-2 text-base gap-2.5"
      : size === "sm"
        ? "px-2 py-0.5 text-[11px] gap-1"
        : "px-3 py-1.5 text-[13px] gap-1.5";
  return (
    <span className={`inline-flex items-center rounded-lg border font-semibold tracking-tight ${verdictBg(verdict)} ${cls}`}>
      <span className="tnum">{arrow}</span>
      <span>{label ?? verdict}</span>
    </span>
  );
}

/** Mostrador circular da pontuação -100..+100. */
export function ScoreDial({ score, confidence, verdict, size = 168 }: { score: number; confidence: number; verdict: Verdict; size?: number }) {
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, Math.abs(score) / 100);
  const color = verdict === "SUBIR" ? "#12b76a" : verdict === "DESCER" ? "#ef4056" : "#f5a524";
  const cx = size / 2;
  const cy = size / 2;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1b2338" strokeWidth="10" />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${c * frac} ${c}`}
          style={{ transition: "stroke-dasharray 900ms cubic-bezier(.22,1,.36,1)", filter: `drop-shadow(0 0 8px ${color}66)` }}
        />
        <circle cx={cx} cy={cy} r={r - 14} fill="none" stroke="#12182a" strokeWidth="1" />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <div className="tnum text-[11px] uppercase tracking-[0.18em] text-ink-500">pontuação</div>
        <div className="tnum text-4xl font-bold leading-none" style={{ color }}>
          {score > 0 ? "+" : ""}
          {score.toFixed(1)}
        </div>
        <div className="mt-1.5 text-[10.5px] font-medium uppercase tracking-wider text-ink-400">
          convergência {confidence}/100
        </div>
      </div>
    </div>
  );
}

export function Meter({ value, label, hint, tone = "neutral" }: { value: number; label: string; hint?: string; tone?: "bull" | "bear" | "neutral" }) {
  const pctv = Math.max(0, Math.min(100, ((value + 100) / 200) * 100));
  const color = tone === "bull" ? "#12b76a" : tone === "bear" ? "#ef4056" : value > 12 ? "#12b76a" : value < -12 ? "#ef4056" : "#f5a524";
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium text-ink-300">{label}</span>
        <span className="tnum text-[12px] font-bold" style={{ color }}>
          {value > 0 ? "+" : ""}
          {value.toFixed(1)}
        </span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-ink-800">
        <div className="absolute left-1/2 top-0 h-full w-px bg-ink-600" />
        <div
          className="absolute top-0 h-full rounded-full transition-all duration-700"
          style={{
            background: color,
            left: value >= 0 ? "50%" : `${pctv}%`,
            width: `${Math.abs(pctv - 50)}%`,
            boxShadow: `0 0 8px ${color}77`,
          }}
        />
      </div>
      {hint && <div className="mt-1 text-[10.5px] leading-snug text-ink-500">{hint}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "bull" | "bear" | "neutral" }) {
  const color = tone === "bull" ? "text-bull-400" : tone === "bear" ? "text-bear-400" : "text-ink-100";
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-900/60 px-3.5 py-3">
      <div className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink-500">{label}</div>
      <div className={`tnum mt-1 text-lg font-bold leading-none ${color}`}>{value}</div>
      {sub && <div className="tnum mt-1.5 text-[11px] text-ink-400">{sub}</div>}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <h2 className="text-[13px] font-bold uppercase tracking-[0.16em] text-ink-400">{children}</h2>
      {right}
    </div>
  );
}
