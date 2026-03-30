import { startTransition, useDeferredValue, useEffect, useState } from 'react';
import CommandComposer from './components/CommandComposer.jsx';
import HeaderBar from './components/HeaderBar.jsx';
import HostMesh from './components/HostMesh.jsx';
import TelemetryStage from './components/TelemetryStage.jsx';
import TimelineFeed from './components/TimelineFeed.jsx';
import { approvePlaybook, executeEnvelope, fetchDevToken, fetchExecution, fetchHosts, fetchIncident, openEventSocket, resolveIntent } from './lib/api.js';

const initialContext = {
  actor: 'arturo',
  actor_role: 'security_admin',
  source_ip: '10.20.1.50',
  severity: 'high',
  emergency: false,
};

export default function App() {
  const [token, setToken] = useState('');
  const [hosts, setHosts] = useState([]);
  const [selectedHosts, setSelectedHosts] = useState([]);
  const [command, setCommand] = useState('Aplica parche de emergencia para OpenSSH en prod-ssh-gateway');
  const [context, setContext] = useState(initialContext);
  const [resolution, setResolution] = useState(null);
  const [envelope, setEnvelope] = useState(null);
  const [execution, setExecution] = useState(null);
  const [incident, setIncident] = useState(null);
  const [events, setEvents] = useState([]);
  const [telemetryByHost, setTelemetryByHost] = useState({});
  const [busy, setBusy] = useState(false);
  const deferredEvents = useDeferredValue(events);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      const devToken = await fetchDevToken();
      if (!mounted) return;
      setToken(devToken);
      const inventory = await fetchHosts(devToken);
      if (!mounted) return;
      startTransition(() => {
        setHosts(inventory);
        setSelectedHosts(inventory.length ? [inventory[0].id] : []);
      });
    }

    boot().catch((error) => {
      console.error('Panal boot failed', error);
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!token) return undefined;

    const socket = openEventSocket(token, (event) => {
      startTransition(() => {
        setEvents((current) => [event, ...current].slice(0, 40));
        if (event.event === 'host.telemetry') {
          setTelemetryByHost((current) => ({
            ...current,
            [event.payload.host_id]: event.payload,
          }));
        }
      });
    });

    socket.addEventListener('open', () => socket.send('ping'));
    return () => socket.close();
  }, [token]);

  function toggleHost(hostId) {
    setSelectedHosts((current) =>
      current.includes(hostId) ? current.filter((item) => item !== hostId) : [...current, hostId]
    );
  }

  async function handleResolve() {
    setBusy(true);
    try {
      const result = await resolveIntent(token, { command, context });
      startTransition(() => {
        setResolution(result);
        if (result.extracted_vars?.matched_hosts?.length) {
          setSelectedHosts(result.extracted_vars.matched_hosts);
        }
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove() {
    if (!resolution?.playbook_id) return;
    setBusy(true);
    try {
      const response = await approvePlaybook(token, resolution.playbook_id, {
        command,
        context,
        target_hosts: selectedHosts,
        justification: `Approval manual emitido por ${context.actor} para ${resolution.playbook_id}.`,
        vars: resolution.extracted_vars || {},
      });
      startTransition(() => {
        setEnvelope(response.envelope);
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleExecute() {
    if (!envelope) return;
    setBusy(true);
    try {
      const result = await executeEnvelope(token, {
        envelope,
        context,
      });
      const [executionState, incidentState] = await Promise.all([
        fetchExecution(token, result.execution_id),
        fetchIncident(token, result.incident_id),
      ]);
      startTransition(() => {
        setExecution(executionState);
        setIncident(incidentState);
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-4 text-white md:px-6 md:py-6">
      <div className="mx-auto flex max-w-[1700px] flex-col gap-4">
        <HeaderBar
          hostCount={hosts.length}
          selectedCount={selectedHosts.length}
          executionStatus={execution?.status}
        />

        <div className="grid gap-4 xl:grid-cols-[1.1fr_1.3fr_1fr]">
          <CommandComposer
            command={command}
            setCommand={setCommand}
            context={context}
            setContext={setContext}
            resolution={resolution}
            envelope={envelope}
            selectedHosts={selectedHosts}
            onResolve={handleResolve}
            onApprove={handleApprove}
            onExecute={handleExecute}
            busy={busy}
          />

          <div className="grid gap-4">
            <TelemetryStage
              telemetryByHost={telemetryByHost}
              selectedHosts={selectedHosts}
              execution={execution}
            />
            <HostMesh
              hosts={hosts}
              selectedHosts={selectedHosts}
              onToggleHost={toggleHost}
              telemetryByHost={telemetryByHost}
            />
          </div>

          <TimelineFeed events={deferredEvents} incident={incident} />
        </div>
      </div>
    </main>
  );
}
