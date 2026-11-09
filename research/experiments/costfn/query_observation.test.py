import contextvars
import json
import types
import unittest

from query_observation import instrument_client, LIMIT


class QueryObservationTests(unittest.TestCase):
    def setUp(self):
        self.current = contextvars.ContextVar("test_observation", default=None)
        self.calls = []

        def execute(*args, **kwargs):
            self.calls.append((args, kwargs))
            if args and "throw" in args[0]:
                raise ValueError("PRIVATE-EXCEPTION")
            return types.SimpleNamespace(query_id=(args[2] if len(args) > 2 else kwargs.get("settings", {})).get("query_id"))

        self.client = types.SimpleNamespace(query=execute)
        instrument_client(self.client, self.current.get)

    def test_success_failure_ids_and_secret_free_metadata(self):
        observation = {}
        self.current.set(observation)
        self.client.query("SELECT 'PRIVATE-SQL'", {"token": "PRIVATE-PARAM"}, settings={"max_execution_time": 10},
                          transport_settings={"http_headers": "PRIVATE-HEADER"})
        with self.assertRaisesRegex(ValueError, "PRIVATE-EXCEPTION"):
            self.client.query("SELECT throwIf(1)")
        rows = observation["native_queries"]
        self.assertEqual([r["failed"] for r in rows], [False, True])
        self.assertNotEqual(rows[0]["query_id"], rows[1]["query_id"])
        self.assertNotIn("PRIVATE", json.dumps(observation))
        self.assertEqual(self.calls[0][1]["settings"]["max_execution_time"], 10)
        self.assertEqual(set(self.calls[0][1]["settings"]), {"max_execution_time", "query_id"})
        self.assertEqual(self.calls[0][1]["transport_settings"]["http_headers"], "PRIVATE-HEADER")

    def test_unobserved_existing_id_and_bounded_records(self):
        self.client.query("SELECT 1")
        self.assertNotIn("settings", self.calls[-1][1])
        observation = {"native_queries": [{} for _ in range(LIMIT)]}
        self.current.set(observation)
        self.client.query("SELECT 1")
        self.assertEqual(len(observation["native_queries"]), LIMIT)
        self.assertEqual(observation["native_query_observation_skipped"], 1)
        self.client.query("SELECT 1", settings={"query_id": "existing"})
        self.assertEqual(self.calls[-1][1]["settings"]["query_id"], "existing")

    def test_idempotent_instrumentation_and_distinct_clients(self):
        wrapped = self.client.query
        instrument_client(self.client, self.current.get)
        self.assertIs(wrapped, self.client.query)
        other_calls = []
        other = types.SimpleNamespace(query=lambda *args, **kwargs: other_calls.append(kwargs))
        instrument_client(other, self.current.get)
        self.current.set({})
        other.query("SELECT 1")
        self.assertEqual(len(other_calls), 1)
        self.assertEqual(len(self.calls), 0)


if __name__ == "__main__":
    unittest.main()
