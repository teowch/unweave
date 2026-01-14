# services/sse.py
import uuid
import json
import queue
import threading
import time
from typing import Dict, Generator, Optional
from contextlib import contextmanager

class SSEManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._channels: Dict[str, "queue.Queue[Optional[dict]]"] = {}

    def create(self, job_id: str) -> None:
        with self._lock:
            if job_id not in self._channels:
                self._channels[job_id] = queue.Queue()

    def publish(self, job_id: str, event: str, data: dict) -> None:
        with self._lock:
            q = self._channels.get(job_id)
        if not q:
            return  # or raise if you want strict behavior
        q.put({"event": event, "data": data})

    def close(self, job_id: str) -> None:
        with self._lock:
            q = self._channels.get(job_id)
        if q:
            q.put(None)  # sentinel to stop generator

    def subscribe(self, job_id: str, heartbeat_seconds: int = 15) -> Generator[str, None, None]:
        with self._lock:
            q = self._channels.get(job_id)

        if not q:
            # Stream a quick error then end
            yield self._format("error", {"message": "unknown job_id"})
            return

        last_heartbeat = time.time()

        while True:
            try:
                msg = q.get(timeout=1)
            except queue.Empty:
                msg = "__EMPTY__"

            if msg is None:
                # cleanup at end
                with self._lock:
                    self._channels.pop(job_id, None)
                yield self._format("done", {"message": "closed"})
                return

            if msg == "__EMPTY__":
                if time.time() - last_heartbeat >= heartbeat_seconds:
                    last_heartbeat = time.time()
                    yield ": heartbeat\n\n"  # comment line keeps connection alive
                continue

            yield self._format(msg["event"], msg["data"])

    def set_project_id(self, old_id: str, new_id: str) -> None:
        with self._lock:
            self._channels[new_id] = self._channels.pop(old_id)

    def _format(self, event: str, data: dict) -> str:
        # SSE framing: event + data (JSON) + blank line
        payload = json.dumps(data, ensure_ascii=False)
        return f"event: {event}\ndata: {payload}\n\n"

@contextmanager
def useSSEManager(sse_manager: SSEManager, job_id: str):
    state = {"job_id": job_id}
    try:
        sse_manager.create(state["job_id"])
        yield sse_manager, state
    finally:
        sse_manager.close(state["job_id"])
