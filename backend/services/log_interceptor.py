import io
import sys
import logging
from contextlib import contextmanager
from typing import Callable, Optional

logger = logging.getLogger(__name__)

class Interceptor(io.TextIOBase):
    def __init__(self, original_stream, callback, event_type: str = "processing"):
        self.original_stream = original_stream
        self.callback = callback
        self.event_type = event_type
        self._inside_callback = False

    def write(self, buf):
        if not self._inside_callback:
            self._inside_callback = True
            try:
                raw_message = buf.strip()
                if raw_message:
                    self.callback(raw_message, self.event_type)
            except Exception as e:
                logger.debug(f"Interceptor callback error: {e}")
            finally:
                self._inside_callback = False
        if self.original_stream:
            return self.original_stream.write(buf)
        return 0

    def flush(self):
        if self.original_stream:
            self.original_stream.flush()

@contextmanager
def intercept(callback: Callable[[str, str], None], event_type: str = "processing"):
    """
    Context manager to intercept stderr output and call callback with messages.
    
    Args:
        callback: Function taking (message, event_type) 
        event_type: Type of event - "model_download" or "processing"
    """
    original_stderr = sys.stderr
    sys.stderr = Interceptor(original_stderr, callback, event_type)
    try:
        yield
    finally:
        sys.stderr = original_stderr

