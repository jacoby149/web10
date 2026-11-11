"""No large fixture, network, subprocess or paid resource is used by these tests."""
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import realism_scratch as scratch


class ScratchTests(unittest.TestCase):
    def test_nested_roots_and_hardlinks_count_once_and_symlinks_are_skipped(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            child=root/"child"
            child.mkdir()
            source=child/"bytes"
            source.write_bytes(b"x"*5000)
            os.link(source,root/"hardlink")
            (root/"symlink").symlink_to(source)
            measured=scratch.tree_bytes([root,child,source])
            self.assertEqual(measured["logical_bytes"],5000)
            self.assertEqual(measured["allocated_bytes"],source.stat().st_blocks*512)

    def test_disappeared_directory_does_not_hide_other_roots(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            (root/"present").write_text("abc")
            self.assertEqual(scratch.tree_bytes([root,root/"missing"])["logical_bytes"],3)

    def test_ownership_refuses_paths_outside_context_and_symlink_escape(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            context=root/"context"
            context.mkdir()
            outside=root/"outside"
            outside.mkdir()
            (context/"link").symlink_to(outside)
            with patch.object(scratch,"CONTEXT",context):
                self.assertEqual(scratch.owned_path(context/"future"),context/"future")
                for value in (outside,context/"link",context/"link"/"child"):
                    with self.subTest(path=value),self.assertRaises(ValueError):
                        scratch.owned_path(value)

    def test_tempdir_ack_samples_before_original_cleanup_without_changing_location(self):
        with tempfile.TemporaryDirectory() as tmp:
            events=io.StringIO()
            with patch("sys.stdout",events),patch("sys.stdin",io.StringIO("sampled\n")):
                observed=scratch.ObservedDirectory(tempfile.TemporaryDirectory,dir=tmp,prefix="realism-work-")
                with observed as name:
                    location=Path(name)
                    self.assertEqual(location.parent,Path(tmp))
                    (location/"proof").write_text("retained until ack")
                    self.assertTrue(location.exists())
            self.assertFalse(location.exists())
            kinds=[json.loads(line.split("=",1)[1])["kind"] for line in events.getvalue().splitlines()]
            self.assertEqual(kinds,["created","before_cleanup"])

    def test_missing_ack_is_a_failure_not_a_successful_observation(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch("sys.stdout",io.StringIO()),patch("sys.stdin",io.StringIO("")):
                observed=scratch.ObservedDirectory(tempfile.TemporaryDirectory,dir=tmp,prefix="realism-work-")
                try:
                    with self.assertRaisesRegex(RuntimeError,"disconnected"):
                        with observed:
                            pass
                finally:
                    observed.original.cleanup()

    def test_low_disk_reserve_stops_only_the_owned_child(self):
        class Child:
            returncode=None
            stdout=io.StringIO("")
            stdin=io.StringIO()

            def poll(self):
                return self.returncode

            def terminate(self):
                self.returncode=-15

            def kill(self):
                self.returncode=-9

            def wait(self,timeout=None):
                return self.returncode

        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            child=Child()
            usage=type("Usage",(),{"free":0})()
            with patch.object(scratch,"CONTEXT",root),patch.object(scratch,"REPO",root), \
                    patch.object(scratch.shutil,"disk_usage",return_value=usage), \
                    patch.object(scratch.subprocess,"Popen",return_value=child):
                result=scratch.measure("generate",root/"dataset",root/"reference",root,reserve=1)
            self.assertEqual(result["stop_reason"],"local_free_space_reserve")
            self.assertEqual(result["returncode"],-15)
            self.assertFalse(result["complete"])


if __name__=="__main__":
    unittest.main()
