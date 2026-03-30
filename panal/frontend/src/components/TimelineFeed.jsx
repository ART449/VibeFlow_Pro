export default function TimelineFeed({ events, incident }) {
  return (
    <section className="glass-line rounded-[30px] p-5 md:p-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="mono text-[10px] uppercase tracking-[0.34em] text-white/45">A4 / A8 Audit</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Timeline</h2>
        </div>
        <p className="text-sm text-white/55">{incident?.status || 'open channel'}</p>
      </div>

      {incident?.audit_report ? (
        <div className="mt-5 rounded-[22px] border border-cyan/20 bg-cyan/8 p-4">
          <p className="mono text-[10px] uppercase tracking-[0.28em] text-cyan/80">Postmortem</p>
          <pre className="mt-3 whitespace-pre-wrap text-sm text-white/70">{incident.audit_report}</pre>
        </div>
      ) : null}

      <div className="mt-5 max-h-[420px] space-y-3 overflow-auto pr-1">
        {events.length ? (
          events.map((event, index) => (
            <article key={`${event.event}-${index}`} className="rounded-[22px] border border-white/10 bg-black/12 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="mono text-[11px] uppercase tracking-[0.28em] text-white/40">{event.event}</p>
                <p className="mono text-[11px] text-white/35">{event.payload?.time || event.payload?.incident_id || 'live'}</p>
              </div>
              <p className="mt-3 text-sm leading-6 text-white/72">
                {event.payload?.message || event.payload?.summary || event.payload?.report || JSON.stringify(event.payload)}
              </p>
            </article>
          ))
        ) : (
          <div className="rounded-[24px] border border-dashed border-white/10 px-4 py-8 text-center text-white/45">
            Esperando eventos de ejecucion, telemetria o auditoria.
          </div>
        )}
      </div>
    </section>
  );
}

