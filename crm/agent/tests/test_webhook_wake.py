"""Wake path: webhook accepts, worker runs, cancel cannot drop triggers."""

from __future__ import annotations

from pathlib import Path

AGENT = Path(__file__).resolve().parents[1]
MODAL = (AGENT / "modal_app.py").read_text()
ORCH = (AGENT / "orchestrator.py").read_text()


def test_webhook_spawns_detached_run_and_does_not_run_inline():
    webhook = MODAL.split("async def run_now_webhook")[1].split("async def run_swarm")[0]
    assert "run_space.spawn" in webhook
    assert "run_agent_for_space" not in webhook
    assert '"accepted"' in webhook


def test_run_space_is_the_worker_and_forwards_instruction():
    worker = MODAL.split("async def run_space")[1].split("async def run_now_webhook")[0]
    assert "run_agent_for_space" in worker
    assert "instruction=instruction or None" in worker
    assert "timeout=600" in MODAL.split("async def run_space")[0][-80:]


def test_orchestrator_requeues_on_baseexception():
    assert "except BaseException" in ORCH
    locked = ORCH.split("async def _run_locked")[1]
    handler = locked.split("except BaseException")[1].split("finally:")[0]
    assert "requeue_triggers" in handler
    assert "increment_attempts=False" in handler
    assert "triggers: list[dict] = []" in locked.split("if not await check_budget")[0]
    # Pop consumes Redis. The try must start before that or a cancel drops the event.
    assert locked.index("try:") < locked.index("await pop_triggers")
