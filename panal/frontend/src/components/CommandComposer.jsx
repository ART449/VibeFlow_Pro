function Toggle({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active ? 'border-cyan bg-cyan/15 text-cyan' : 'border-white/10 text-white/55 hover:border-white/25'
      }`}
    >
      {label}
    </button>
  );
}

export default function CommandComposer({
  command,
  setCommand,
  context,
  setContext,
  resolution,
  envelope,
  selectedHosts,
  onResolve,
  onApprove,
  onExecute,
  busy,
}) {
  return (
    <section className="glass-line rounded-[30px] p-5 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="mono text-[10px] uppercase tracking-[0.34em] text-white/45">A2 / A5</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Composer + Approval</h2>
        </div>
        <div className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/55">
          {selectedHosts.length} host{selectedHosts.length === 1 ? '' : 's'}
        </div>
      </div>

      <textarea
        value={command}
        onChange={(event) => setCommand(event.target.value)}
        className="mt-6 min-h-36 w-full rounded-[24px] border border-white/10 bg-black/25 p-4 text-base text-white outline-none transition focus:border-cyan/60"
        placeholder='Ejemplo: "Aplica parche de emergencia para OpenSSH en prod-ssh-gateway"'
      />

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="space-y-2">
          <span className="mono text-[11px] uppercase tracking-[0.28em] text-white/45">Actor</span>
          <input
            value={context.actor}
            onChange={(event) => setContext((current) => ({ ...current, actor: event.target.value }))}
            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-cyan/50"
          />
        </label>
        <label className="space-y-2">
          <span className="mono text-[11px] uppercase tracking-[0.28em] text-white/45">Source IP</span>
          <input
            value={context.source_ip}
            onChange={(event) => setContext((current) => ({ ...current, source_ip: event.target.value }))}
            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-cyan/50"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {['security_admin', 'commander', 'auditor'].map((role) => (
          <Toggle
            key={role}
            label={role}
            active={context.actor_role === role}
            onClick={() => setContext((current) => ({ ...current, actor_role: role }))}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {['low', 'medium', 'high', 'critical'].map((severity) => (
          <Toggle
            key={severity}
            label={severity}
            active={context.severity === severity}
            onClick={() => setContext((current) => ({ ...current, severity }))}
          />
        ))}
        <Toggle
          label={context.emergency ? 'emergency:on' : 'emergency:off'}
          active={context.emergency}
          onClick={() => setContext((current) => ({ ...current, emergency: !current.emergency }))}
        />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onResolve}
          disabled={busy}
          className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-amber disabled:cursor-not-allowed disabled:opacity-40"
        >
          Resolver intent
        </button>
        <button
          type="button"
          onClick={onApprove}
          disabled={!resolution?.playbook_id || busy || !selectedHosts.length}
          className="rounded-full border border-amber/50 px-5 py-3 text-sm font-semibold text-amber transition hover:bg-amber/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Firmar approval
        </button>
        <button
          type="button"
          onClick={onExecute}
          disabled={!envelope || busy}
          className="rounded-full border border-cyan/50 px-5 py-3 text-sm font-semibold text-cyan transition hover:bg-cyan/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Ejecutar
        </button>
      </div>

      <div className="mt-6 space-y-3 text-sm">
        <div className="rounded-[22px] border border-white/10 bg-black/15 p-4">
          <p className="mono text-[10px] uppercase tracking-[0.3em] text-white/45">Decision</p>
          <p className="mt-2 text-lg font-semibold text-white">{resolution?.decision || 'idle'}</p>
          <p className="mt-1 text-white/60">{resolution?.normalized_intent || 'Esperando resolucion determinista.'}</p>
        </div>
        <div className="rounded-[22px] border border-white/10 bg-black/15 p-4">
          <p className="mono text-[10px] uppercase tracking-[0.3em] text-white/45">Envelope</p>
          <p className="mt-2 break-all text-white/65">{envelope?.signature || 'No firmado aun.'}</p>
        </div>
      </div>
    </section>
  );
}

