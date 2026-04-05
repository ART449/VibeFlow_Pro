-- Colmena v2 — Schema inicial
-- Memoria, tareas, agentes, artefactos

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(50) NOT NULL,
  scope VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed','awaiting_approval')),
  priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  input JSONB NOT NULL DEFAULT '{}',
  output JSONB,
  runner_id VARCHAR(100),
  runner_profile VARCHAR(50),
  cost_usd NUMERIC(10,4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  approved_by VARCHAR(100),
  approved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  agent_id VARCHAR(50) NOT NULL,
  risk VARCHAR(10) CHECK (risk IN ('low','medium','high','critical')),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  evidence TEXT,
  remediation TEXT,
  file_path VARCHAR(500),
  line_number INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  agent_id VARCHAR(50) NOT NULL,
  type VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  size_bytes BIGINT DEFAULT 0,
  mime_type VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_scores (
  agent_id VARCHAR(50) NOT NULL,
  domain VARCHAR(100) NOT NULL,
  score NUMERIC(5,2) DEFAULT 50.0 CHECK (score BETWEEN 0 AND 100),
  tasks_completed INTEGER DEFAULT 0,
  tasks_failed INTEGER DEFAULT 0,
  avg_cost_usd NUMERIC(10,4) DEFAULT 0,
  last_run TIMESTAMPTZ,
  PRIMARY KEY (agent_id, domain)
);

CREATE TABLE IF NOT EXISTS approval_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  agent_id VARCHAR(50) NOT NULL,
  action_type VARCHAR(100) NOT NULL,
  description TEXT,
  risk VARCHAR(10) CHECK (risk IN ('low','medium','high','critical')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project VARCHAR(100) NOT NULL,
  key VARCHAR(255) NOT NULL,
  value JSONB NOT NULL,
  agent_id VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project, key)
);

-- Indices para queries comunes
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_findings_risk ON findings(risk);
CREATE INDEX IF NOT EXISTS idx_findings_task ON findings(task_id);
CREATE INDEX IF NOT EXISTS idx_approval_status ON approval_queue(status);
CREATE INDEX IF NOT EXISTS idx_memory_project ON memory(project);
