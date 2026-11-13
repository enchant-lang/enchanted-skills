"""Real receiver/reader contract, isolated from account and production data.

Run with the qualified bl on PATH: python3 test/share_protocol_test.py
"""
import hashlib
import io
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import tarfile
import tempfile
import time
import unittest
import urllib.error
import urllib.request

KIT = Path(__file__).resolve().parents[1]
BL = os.environ.get("BL", shutil.which("bl"))


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


def artifact(label):
    contents = {"index.html": (f'<link rel="stylesheet" href="app.css"><p>{label}</p>'.encode(), "text/html; charset=utf-8"),
                "app.css": (f"/* {label} */".encode(), "text/css"),
                "sample.mp4": ((KIT / "test/fixtures/share.mp4").read_bytes(), "video/mp4"),
                "sample.pdf": (b"%PDF-1.4\n% range contract fixture\n%%EOF\n", "application/pdf")}
    routes, files = {}, {}
    for route, (data, mime) in contents.items():
        routes[route] = {"file": route, "type": mime, "bytes": len(data), "sha256": digest(data)}
        files["public/" + route] = data
    manifest = encoded({"version": 1, "title": "Protocol fixture", "routes": routes})
    files["manifest.json"] = manifest
    return digest(manifest), files


def archive(files, symlink=False):
    out = io.BytesIO()
    with tarfile.open(fileobj=out, mode="w", format=tarfile.USTAR_FORMAT) as tar:
        for name, data in files.items():
            entry = tarfile.TarInfo(name)
            entry.size = len(data)
            entry.mode = 0o640
            if symlink:
                entry.type, entry.linkname, entry.size = tarfile.SYMTYPE, "../../escape", 0
            tar.addfile(entry, io.BytesIO(data))
    return out.getvalue()


class PublicationProtocol(unittest.TestCase):
    def test_atomic_updates_unsafe_uploads_and_revocation(self):
        with tempfile.TemporaryDirectory(prefix="dossier-protocol-") as temporary:
            root = Path(temporary)
            for name in ("objects", "grants", "staging", "cache"):
                (root / name).mkdir()
            token = secrets.token_urlsafe(32)
            identity = {"id": "fixture", "tokenHash": digest(token.encode())}
            env = os.environ | {"DOSSIER_SHARE_DATA": str(root), "DOSSIER_SHARE_PUBLISHER": "fixture",
                                "XDG_CACHE_HOME": str(root / "cache"), "BL_DAEMON": "off"}

            def receive(action, operation, expected=0, revision=None, data=b"", ok=True):
                request = identity | {"action": action, "operation": operation, "expected": expected}
                if revision:
                    request["revision"] = revision
                result = subprocess.run([BL, "--cold", "run", "-p", str(KIT), str(KIT / "share-receive.bl")],
                                        env=env | {"SSH_ORIGINAL_COMMAND": encoded(request).decode()},
                                        input=data, capture_output=True, timeout=90)
                responses = [json.loads(line) for line in result.stdout.splitlines() if line.startswith(b"{")]
                self.assertTrue(responses, result.stderr.decode(errors="replace")[-2000:])
                self.assertEqual(responses[-1]["ok"], ok)
                self.assertEqual(result.returncode == 0, ok)
                return responses[-1].get("grant")

            first, files = artifact("First")
            initial = receive("publish", "first", revision=first, data=archive(files))
            self.assertEqual(initial["sequence"], 1)
            # The same operation can be retried after an acknowledgement is lost.
            self.assertEqual(initial, receive("publish", "first", revision=first, data=archive(files)))
            with socket.socket() as sock:
                sock.bind(("127.0.0.1", 0))
                port = sock.getsockname()[1]
            log = (root / "reader.log").open("wb")
            reader = subprocess.Popen([BL, "--cold", "run", "-p", str(KIT), str(KIT / "share-reader.bl")],
                                      env=env | {"PORT": str(port)}, stdout=log, stderr=log)
            base = f"http://127.0.0.1:{port}"

            def read(path, method="GET", headers=None):
                try:
                    response = urllib.request.urlopen(urllib.request.Request(base + path, method=method, headers=headers or {}), timeout=10)
                except urllib.error.HTTPError as error:
                    response = error
                with response:
                    return response.status, response.read(), response.headers

            try:
                deadline = time.monotonic() + 45
                while True:
                    try:
                        if read("/health")[0] == 200:
                            break
                    except OSError:
                        pass
                    if reader.poll() is not None or time.monotonic() > deadline:
                        self.fail((root / "reader.log").read_text())
                    time.sleep(0.2)
                stable = f"/s/{token}/"
                old = stable + f"r/{first}/"
                self.assertIn(b"First", read(stable)[1])
                self.assertEqual(read(old, "HEAD")[:2], (200, b""))
                self.assertEqual(read(old, headers={"Range": "bytes=0-7"})[:2], (206, files["public/index.html"][:8]))
                self.assertEqual(read(old + "src")[0], 404)
                self.assertEqual(read(old, "POST")[0], 405)
                for name, mime in (("sample.mp4", "video/mp4"), ("sample.pdf", "application/pdf")):
                    status, body, headers = read(old + name, headers={"Range": "bytes=0-15"})
                    self.assertEqual((status, body), (206, files["public/" + name][:16]))
                    self.assertTrue(headers["Content-Type"].startswith(mime))
                self.assertIn("form-action 'none'", read(old)[2]["Content-Security-Policy"])

                corrupt = files | {"public/index.html": b"Corrupt"}
                receive("publish", "corrupt", 1, first, archive(corrupt), ok=False)
                receive("publish", "traversal", 1, first, archive({"../escape": b"bad"}), ok=False)
                receive("publish", "symlink", 1, first, archive({"link": b""}, symlink=True), ok=False)
                self.assertFalse((root.parent / "escape").exists())
                self.assertEqual(receive("status", "unchanged")["sequence"], 1)
                self.assertIn(b"First", read(stable)[1])

                second, next_files = artifact("Second")
                receive("publish", "stale", 0, second, archive(next_files), ok=False)
                self.assertEqual(receive("status", "still-first")["sequence"], 1)
                receive("publish", "second", 1, second, archive(next_files))
                new = stable + f"r/{second}/"
                self.assertIn(b"Second", read(stable)[1])
                self.assertEqual(read(old + "app.css")[1], b"/* First */")
                self.assertEqual(read(new + "app.css")[1], b"/* Second */")
                self.assertIn("no-store", read(new)[2]["Cache-Control"])

                receive("revoke", "revoked", 2)
                for path in (stable, old, new, old + "app.css", new + "app.css", old + "sample.mp4", new + "sample.pdf"):
                    self.assertEqual(read(path)[0], 404)
                self.assertEqual(read(old, "HEAD")[0], 404)
                receive("publish", "restore", 3, second, archive(next_files))
                self.assertIn(b"Second", read(stable)[1])
            finally:
                reader.terminate()
                try:
                    reader.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    reader.kill()
                    reader.wait()
                log.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
