from __future__ import annotations

import time
import unittest

from fastapi.testclient import TestClient

import c2_app
from panal_app.security import create_dev_jwt


class PanalBackendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(c2_app.app)
        cls.jwt = create_dev_jwt({"sub": "arturo", "role": "commander"}, c2_app.settings.jwt_secret, expires_in=3600)
        cls.headers = {"Authorization": f"Bearer {cls.jwt}"}

    def test_jwt_required(self) -> None:
        response = self.client.get("/api/v1/hosts")
        self.assertEqual(response.status_code, 401)

    def test_resolve_patch_intent_requires_approval(self) -> None:
        response = self.client.post(
            "/api/v1/intents/resolve",
            headers=self.headers,
            json={
                "command": "Aplica parche de emergencia para OpenSSH en prod-ssh-gateway",
                "context": {
                    "actor": "arturo",
                    "actor_role": "security_admin",
                    "source_ip": "10.20.1.50",
                    "severity": "high",
                    "emergency": True
                }
            }
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["playbook_id"], "host.patch.openssh")
        self.assertEqual(body["decision"], "require_approval")
        self.assertFalse(body["used_ai"])

    def test_blackhole_denied_without_emergency(self) -> None:
        approval = self.client.post(
            "/api/v1/playbooks/incident.blackhole_source/approve",
            headers=self.headers,
            json={
                "command": "Bloquea IP 198.51.100.10 con blackhole",
                "context": {
                    "actor": "arturo",
                    "actor_role": "commander",
                    "source_ip": "10.20.1.50",
                    "severity": "critical",
                    "emergency": False
                },
                "target_hosts": ["dmz-web-01"],
                "justification": "Intento de brute force detectado",
                "vars": {}
            }
        )
        self.assertEqual(approval.status_code, 403)

    def test_approval_and_execution_lifecycle(self) -> None:
        approval = self.client.post(
            "/api/v1/playbooks/host.scan_security/approve",
            headers=self.headers,
            json={
                "command": "Escanea con trivy y nmap security-lab-01 quick",
                "context": {
                    "actor": "arturo",
                    "actor_role": "security_admin",
                    "source_ip": "10.20.1.50",
                    "severity": "low",
                    "emergency": False
                },
                "target_hosts": ["security-lab-01"],
                "justification": "Revision programada del laboratorio",
                "vars": {}
            }
        )
        self.assertEqual(approval.status_code, 200)
        envelope = approval.json()["envelope"]

        execution = self.client.post(
            "/api/v1/executions",
            headers=self.headers,
            json={
                "envelope": envelope,
                "context": {
                    "actor": "arturo",
                    "actor_role": "security_admin",
                    "source_ip": "10.20.1.50",
                    "severity": "low",
                    "emergency": False
                }
            }
        )
        self.assertEqual(execution.status_code, 200)
        execution_id = execution.json()["execution_id"]

        final = None
        for _ in range(40):
            time.sleep(0.1)
            final = self.client.get(f"/api/v1/executions/{execution_id}", headers=self.headers)
            if final.json()["status"] in {"succeeded", "failed"}:
                break
        self.assertIsNotNone(final)
        self.assertEqual(final.status_code, 200)
        self.assertEqual(final.json()["status"], "succeeded")
        self.assertGreaterEqual(len(final.json()["artifacts"]), 1)

    def test_envelope_replay_is_rejected(self) -> None:
        approval = self.client.post(
            "/api/v1/playbooks/host.scan_security/approve",
            headers=self.headers,
            json={
                "command": "Escanea security-lab-01",
                "context": {
                    "actor": "arturo",
                    "actor_role": "security_admin",
                    "source_ip": "10.20.1.50",
                    "severity": "low",
                    "emergency": False
                },
                "target_hosts": ["security-lab-01"],
                "justification": "Second scan",
                "vars": {}
            }
        )
        envelope = approval.json()["envelope"]
        payload = {
            "envelope": envelope,
            "context": {
                "actor": "arturo",
                "actor_role": "security_admin",
                "source_ip": "10.20.1.50",
                "severity": "low",
                "emergency": False
            }
        }
        first = self.client.post("/api/v1/executions", headers=self.headers, json=payload)
        second = self.client.post("/api/v1/executions", headers=self.headers, json=payload)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 409)


if __name__ == "__main__":
    unittest.main()

