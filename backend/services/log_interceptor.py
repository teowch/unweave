import io
import sys
from contextlib import contextmanager

class Interceptor(io.TextIOBase):
    def __init__(self, original_stream, callback):
        self.original_stream = original_stream
        self.callback = callback
        self._inside_callback = False

    def write(self, buf):
        if not self._inside_callback:
            self._inside_callback = True
            try:
                raw_message = buf.strip()
                if raw_message:
                    self.callback(raw_message)
            except Exception:
                pass
            finally:
                self._inside_callback = False
        if self.original_stream:
            return self.original_stream.write(buf)
        return 0

    def flush(self):
        if self.original_stream:
            self.original_stream.flush()

@contextmanager
def intercept(callback):
    original_stderr = sys.stderr
    sys.stderr = Interceptor(original_stderr, callback)
    try:
        yield
    finally:
        sys.stderr = original_stderr
