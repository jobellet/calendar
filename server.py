import http.server
import os

PORT = 8000
web_dir = os.path.dirname(__file__)
if web_dir:
    os.chdir(web_dir)

Handler = http.server.SimpleHTTPRequestHandler
# Use ThreadingHTTPServer for multi-threading support
with http.server.ThreadingHTTPServer(("", PORT), Handler) as httpd:
    print(f"Serving at http://localhost:{PORT}")
    httpd.serve_forever()
