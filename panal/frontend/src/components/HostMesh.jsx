export default function HostMesh({ hosts, selectedHosts, onToggleHost, telemetryByHost }) {
  return (
    <section className="glass-line rounded-[30px] p-5 md:p-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="mono text-[10px] uppercase tracking-[0.34em] text-white/45">A1 Console / Target Mesh</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Host inventory</h2>
        </div>
        <p className="text-sm text-white/50">Select scope for deterministic execution.</p>
      </div>

      <div className="mt-6 space-y-3">
        {hosts.map((host) => {
          const selected = selectedHosts.includes(host.id);
          const telemetry = telemetryByHost[host.id];
          return (
            <button
              key={host.id}
              type="button"
              onClick={() => onToggleHost(host.id)}
              className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${
                selected ? 'border-cyan bg-cyan/10' : 'border-white/10 bg-black/15 hover:border-white/20'
              }`}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <span className={`status-dot ${host.status === 'ready' ? 'bg-cyan' : 'bg-amber'}`} />
                    <h3 className="text-lg font-semibold text-white">{host.display_name}</h3>
                  </div>
                  <p className="mono mt-2 text-xs text-white/50">{host.id} · {host.address} · {host.target_group}</p>
                </div>
                <div className="grid grid-cols-3 gap-4 text-xs text-white/60">
                  <div>
                    <p className="mono text-[10px] uppercase tracking-[0.24em] text-white/35">CPU</p>
                    <p className="mt-1 text-base text-white">{telemetry?.cpu ?? '--'}%</p>
                  </div>
                  <div>
                    <p className="mono text-[10px] uppercase tracking-[0.24em] text-white/35">RAM</p>
                    <p className="mt-1 text-base text-white">{telemetry?.ram ?? '--'}%</p>
                  </div>
                  <div>
                    <p className="mono text-[10px] uppercase tracking-[0.24em] text-white/35">Load</p>
                    <p className="mt-1 text-base text-white">{telemetry?.load ?? '--'}</p>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

