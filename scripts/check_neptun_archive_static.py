"""Static audit only: parse source; NEVER import or execute backend code."""
import ast
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = ["backend/app/collectors/neptun.py", "backend/app/main.py"]


def calls_named(tree: ast.AST, name: str) -> list[ast.Call]:
    return [node for node in ast.walk(tree) if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name) and node.func.id == name]


def imports_archive(tree: ast.AST) -> bool:
    return any(isinstance(node, ast.ImportFrom)
               and node.module == "neptun_archive"
               and any(alias.name == "source_metadata" for alias in node.names)
               for node in ast.walk(tree))


def main():
    collector = ast.parse((ROOT / FILES[0]).read_text(encoding="utf-8"))
    main_tree = ast.parse((ROOT / FILES[1]).read_text(encoding="utf-8"))
    assert imports_archive(collector) and imports_archive(main_tree)
    assert calls_named(collector, "source_metadata"), "Signal metadata projection missing"
    assert calls_named(main_tree, "source_metadata"), "Snapshot metadata projection missing"

    handlers = [node for node in collector.body if isinstance(node, ast.AsyncFunctionDef)
                and node.name == "_handle_threats"]
    assert len(handlers) == 1
    kwonly = {arg.arg for arg in handlers[0].args.kwonlyargs}
    receipt_args = {"received_at", "transport", "message_type", "source_message_ts"}
    assert receipt_args <= kwonly, "Receipt contract missing from _handle_threats"

    receipt_assignments = [node for node in ast.walk(handlers[0])
                           if isinstance(node, ast.Assign)
                           and any(ast.unparse(target) == "t['_receipt']"
                                   for target in node.targets)]
    assert len(receipt_assignments) == 1
    receipt_value = receipt_assignments[0].value
    assert isinstance(receipt_value, ast.Dict)
    receipt_keys = {key.value for key in receipt_value.keys if isinstance(key, ast.Constant)}
    assert receipt_args == receipt_keys

    incoming = calls_named(collector, "_handle_threats")
    assert len(incoming) >= 3
    for call in incoming:
        assert receipt_args <= {kw.arg for kw in call.keywords}, "Unstamped incoming batch"

    path = ROOT / "backend/app/neptun_archive.py"
    source = path.read_text(encoding="utf-8")
    parsed = ast.parse(source)
    expected = ast.parse('''
def source_metadata(track: dict) -> dict:
    return {"schema_version": 1,
            "source_fields": {key: track.get(key) for key in SOURCE_FIELDS},
            "field_presence": [key for key in SOURCE_FIELDS if key in track],
            "receipt": track.get("_receipt")}
''')
    functions = [n for n in parsed.body if isinstance(n, ast.FunctionDef)]
    assert len(functions) == 1 and ast.dump(functions[0]) == ast.dump(expected.body[0])
    assert not any(isinstance(n, (ast.Import, ast.ImportFrom)) for n in ast.walk(parsed))
    fields = ast.literal_eval(next(n.value for n in parsed.body if isinstance(n, ast.Assign)))
    assert len(fields) == len(set(fields)) and all(isinstance(k, str) for k in fields)
    result = {"fields": fields, "sha256": hashlib.sha256(source.encode()).hexdigest(),
              "staticAudit": "PASS: signal/snapshot projections and receipt contract verified"}
    print(json.dumps(result))


if __name__ == "__main__":
    main()
