import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

export default function TelemetryStage({ telemetryByHost, selectedHosts, execution }) {
  const primaryHost = selectedHosts[0];
  const snapshot = primaryHost ? telemetryByHost[primaryHost] : null;
  const labels = ['-5m', '-4m', '-3m', '-2m', '-1m', 'now'];
  const cpu = snapshot ? [snapshot.cpu - 10, snapshot.cpu - 6, snapshot.cpu - 4, snapshot.cpu - 3, snapshot.cpu - 1, snapshot.cpu] : [18, 23, 26, 22, 31, 28];
  const ram = snapshot ? [snapshot.ram - 8, snapshot.ram - 6, snapshot.ram - 4, snapshot.ram - 2, snapshot.ram - 1, snapshot.ram] : [34, 36, 38, 40, 42, 44];

  return (
    <section className="glass-line relative overflow-hidden rounded-[30px] p-5 md:p-6">
      <div className="absolute inset-0 hex-grid animate-pulsegrid opacity-50" />
      <div className="relative">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.34em] text-white/45">Telemetry / A1 Stream</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Operational pulse</h2>
          </div>
          <div className="text-right">
            <p className="mono text-[10px] uppercase tracking-[0.28em] text-white/35">Execution</p>
            <p className="mt-2 text-lg text-cyan">{execution?.status || 'idle'}</p>
          </div>
        </div>

        <div className="mt-6 h-[280px]">
          <Line
            data={{
              labels,
              datasets: [
                {
                  label: 'CPU',
                  data: cpu,
                  fill: true,
                  backgroundColor: 'rgba(242,185,75,0.16)',
                  borderColor: '#f2b94b',
                  tension: 0.38,
                },
                {
                  label: 'RAM',
                  data: ram,
                  fill: true,
                  backgroundColor: 'rgba(122,230,255,0.12)',
                  borderColor: '#7ae6ff',
                  tension: 0.38,
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  labels: {
                    color: 'rgba(255,255,255,0.75)',
                  },
                },
              },
              scales: {
                x: {
                  grid: { color: 'rgba(255,255,255,0.05)' },
                  ticks: { color: 'rgba(255,255,255,0.45)' },
                },
                y: {
                  grid: { color: 'rgba(255,255,255,0.05)' },
                  ticks: { color: 'rgba(255,255,255,0.45)' },
                },
              },
            }}
          />
        </div>
      </div>
    </section>
  );
}

