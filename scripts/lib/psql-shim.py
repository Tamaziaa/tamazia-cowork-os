#!/usr/bin/env python3
"""psql shim using pg8000 — supports the subset of psql flags our verifications use.

Usage:
  psql-shim.py <conn_url> -tA -c "SELECT ..."        # execute one statement
  psql-shim.py <conn_url> -tA -f /path/to/file.sql   # execute a .sql file

Mirrors the -tA output mode (tuple-only, unaligned, tab-separated).
"""
import sys
import re
import os
import json
import datetime
import decimal
import pg8000.native


def _fmt(v):
    """Mirror psql -tA output: NULL -> '', JSONB -> compact JSON, datetimes -> ISO, others -> str()"""
    if v is None:
        return ""
    if isinstance(v, (dict, list)):
        return json.dumps(v, default=str, separators=(", ", ": "))
    if isinstance(v, bool):
        return "t" if v else "f"
    if isinstance(v, datetime.datetime):
        return v.isoformat(sep=" ")
    if isinstance(v, datetime.date):
        return v.isoformat()
    if isinstance(v, decimal.Decimal):
        return str(v)
    if isinstance(v, (bytes, bytearray)):
        return v.decode("utf-8", "replace")
    return str(v)


def parse_url(url: str):
    # postgres://user:pass@host:port/db?...
    m = re.match(r"postgres(?:ql)?://([^:]+):([^@]+)@([^/:]+)(?::(\d+))?/([^?]+)(\?.*)?", url)
    if not m:
        raise SystemExit(f"Could not parse Neon URL: {url}")
    user, password, host, port, dbname, _ = m.groups()
    port = int(port or 5432)
    return dict(user=user, password=password, host=host, port=port, database=dbname)


def main():
    args = sys.argv[1:]
    if not args:
        raise SystemExit("Usage: psql-shim.py <conn_url> -tA -c \"SQL\" | -f file.sql")
    conn_url = args[0]
    rest = args[1:]

    sql = None
    sql_file = None
    while rest:
        token = rest.pop(0)
        if token in ("-c",):
            sql = rest.pop(0)
        elif token in ("-f",):
            sql_file = rest.pop(0)
        elif token in ("-tA", "-A", "-t", "-q"):
            pass  # accepted no-ops; we always emit tuple-only unaligned
        else:
            # ignore other flags silently
            pass

    params = parse_url(conn_url)
    params["ssl_context"] = True  # Neon requires TLS

    conn = pg8000.native.Connection(**params)
    try:
        if sql_file:
            with open(sql_file, "r", encoding="utf-8") as fh:
                raw = fh.read()
            # Strip --line comments so the splitter does not see ; inside them.
            cleaned_lines = []
            for line in raw.splitlines():
                idx = -1
                in_s = False
                k = 0
                while k < len(line):
                    c = line[k]
                    if c == "'" and (k + 1 < len(line) and line[k + 1] == "'") and in_s:
                        k += 2
                        continue
                    if c == "'":
                        in_s = not in_s
                    elif c == "-" and k + 1 < len(line) and line[k + 1] == "-" and not in_s:
                        idx = k
                        break
                    k += 1
                cleaned_lines.append(line if idx == -1 else line[:idx])
            cleaned = "\n".join(cleaned_lines)

            # State-machine splitter — copies a char at a time, only treats ; as separator
            # when we are outside any quoted string.
            statements = []
            buf = []
            in_str = False
            i = 0
            n = len(cleaned)
            while i < n:
                ch = cleaned[i]
                if ch == "'":
                    if in_str and i + 1 < n and cleaned[i + 1] == "'":
                        buf.append("''")
                        i += 2
                        continue
                    in_str = not in_str
                    buf.append(ch)
                    i += 1
                    continue
                if ch == ";" and not in_str:
                    stmt = "".join(buf).strip()
                    if stmt:
                        statements.append(stmt)
                    buf = []
                    i += 1
                    continue
                buf.append(ch)
                i += 1
            tail = "".join(buf).strip()
            if tail:
                statements.append(tail)

            for st in statements:
                rows = conn.run(st)
                if rows:
                    for row in rows:
                        print("\t".join(_fmt(v) for v in row))
            return
        if sql is None:
            raise SystemExit("Either -c or -f required")
        # Strip a trailing ;
        sql = sql.strip().rstrip(";")
        rows = conn.run(sql)
        if rows is None:
            return
        for row in rows:
            print("\t".join(_fmt(v) for v in row))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
