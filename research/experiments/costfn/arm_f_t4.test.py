"""Replay the observed final-validator failure without engine or paid work."""
import unittest
import sqlglot
from arm_f_t4 import reads_fanout


class NativeStatementTests(unittest.TestCase):
    def test_driver_binary_insert_header_is_not_a_read(self):
        sql = ('INSERT INTO `logs` (`id`, `timestamp`, `level`, `service`, `method`, `path`, '
            '`status`, `latency_ms`, `user_key`, `origin`, `message`, `request_body`, `response_body`, `meta`) FORMAT Native')
        with self.assertRaises(sqlglot.errors.ParseError):
            sqlglot.parse_one(sql, read='clickhouse')
        self.assertFalse(reads_fanout(sql))
        self.assertFalse(reads_fanout('INSERT INTO `web10`.`fanout` (`reader_key`, `doc_id`) FORMAT Native'))

    def test_selects_nested_selects_and_insert_selects_still_detect_reader_rerank(self):
        for sql in ('SELECT reader_key FROM fanout',
                    'INSERT INTO fanout SELECT * FROM fanout',
                    'SELECT * FROM (SELECT * FROM fanout)',
                    "SELECT * FROM fanout WHERE reader_key='FORMAT Native'"):
            with self.subTest(sql=sql):
                self.assertTrue(reads_fanout(sql))
        self.assertFalse(reads_fanout("SELECT 'fanout' AS table_name FROM documents"))

    def test_unknown_malformed_statement_is_not_ignored(self):
        with self.assertRaises(sqlglot.errors.ParseError):
            reads_fanout('INSERT INTO logs (id) FORMAT SomethingUnknown')


if __name__ == '__main__':
    unittest.main()
