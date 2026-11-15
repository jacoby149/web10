INSERT INTO documents SELECT leftPad(toString(number),4,'0'),'a','posts','{}','',[],toDateTime64('2026-11-15 00:00:00',3)+number,toDateTime64('2026-11-15 00:00:00',3),0 FROM numbers(205)
