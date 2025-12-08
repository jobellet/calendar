import http.server
import socketserver
import os

PORT = 8000
web_dir = os.path.dirname(__file__)
if web_dir:
    os.chdir(web_dir)

Handler = http.server.SimpleHTTPRequestHandler
httpd = socketserver.TCPServer(("", PORT), Handler)
print(f"Serving at http://localhost:{PORT}")
httpd.serve_forever()
