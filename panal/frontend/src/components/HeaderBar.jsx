export default function HeaderBar({ hostCount, selectedCount, executionStatus }) {
  return (
    <header className="glass-line relative overflow-hidden rounded-[28px] px-6 py-5">
      <div className="absolute inset-y-0 right-0 w-72 bg-gradient-to-l from-amber/15 to-transparent" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="mono text-xs uppercase tracking-[0.45em] text-cyan/75">Autonomia controlada / zero trust</p>
          <div className="flex items-center gap-4">
            <h1 className="text-4xl font-bold tracking-tight text-white md:text-6xl">Panal</h1>
            <div className="h-10 w-px bg-white/10" />
            <p className="max-w-xl text-sm text-white/60 md:text-base">
              Command and control para incidentes, remediacion aprobada y evidencia operativa con nodos A1-A6.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-6 text-sm">
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.32em] text-white/45">Inventario</p>
            <p className="mt-2 text-2xl font-semibold text-white">{hostCount}</p>
          </div>
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.32em] text-white/45">Scope</p>
            <p className="mt-2 text-2xl font-semibold text-amber">{selectedCount}</p>
          </div>
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.32em] text-white/45">Ultima ejecucion</p>
            <p className="mt-2 text-2xl font-semibold text-cyan">{executionStatus || 'idle'}</p>
          </div>
        </div>
      </div>
    </header>
  );
}

