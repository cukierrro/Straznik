"""Loopback-only gallery; explicit route allowlist, never exposes the repo root."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
ROOT = Path(__file__).resolve().parents[1]
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path=urlsplit(self.path).path
        routes={'/': ROOT/'docs/aircraft-library/gallery.html',
                '/aircraft-photo-catalog.js': ROOT/'frontend/aircraft-photo-catalog.js',
                '/aircraft-photos.js': ROOT/'frontend/aircraft-photos.js'}
        file=routes.get(path)
        if file is None and path.startswith('/assets/aircraft/'):
            import re
            if re.fullmatch(r'/assets/aircraft/[a-z0-9]+-[a-f0-9]{12}\.jpg',path):
                file=ROOT/'frontend'/path.lstrip('/')
        if file is None or not file.is_file(): self.send_error(404);return
        body=file.read_bytes();self.send_response(200)
        self.send_header('Content-Type',{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.jpg':'image/jpeg'}[file.suffix])
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self'; object-src 'none'; base-uri 'none'")
        self.end_headers();self.wfile.write(body)
if __name__=='__main__': ThreadingHTTPServer(('127.0.0.1',8780),Handler).serve_forever()
