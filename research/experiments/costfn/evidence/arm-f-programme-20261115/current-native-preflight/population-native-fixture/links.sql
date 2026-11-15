INSERT INTO doc_groups SELECT leftPad(toString(number),4,'0'),'g1',toDateTime64('2026-11-15 00:00:00',3),toDateTime64('2026-11-15 00:00:00',3),0 FROM numbers(205)
