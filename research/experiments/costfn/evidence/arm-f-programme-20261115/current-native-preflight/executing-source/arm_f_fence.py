"""Writer-preferred shared mutation/exclusive rebuild fence, one research worker."""
from contextlib import contextmanager
import threading


class Fence:
    def __init__(self):
        self.condition = threading.Condition()
        self.active, self.waiting, self.exclusive = 0, 0, False

    @contextmanager
    def shared(self):
        with self.condition:
            self.condition.wait_for(lambda: not self.exclusive and not self.waiting)
            self.active += 1
        try:
            yield
        finally:
            with self.condition:
                self.active -= 1
                self.condition.notify_all()

    @contextmanager
    def rebuild(self):
        with self.condition:
            self.waiting += 1
            try:
                self.condition.wait_for(lambda: not self.exclusive and not self.active)
                self.exclusive = True
            finally:
                self.waiting -= 1
        try:
            yield
        finally:
            with self.condition:
                self.exclusive = False
                self.condition.notify_all()
