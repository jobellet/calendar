import http.server
import os
import urllib.request
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = 8000
web_dir = os.path.dirname(__file__)
if web_dir:
    os.chdir(web_dir)

class ProxyHTTPRequestHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/proxy?url='):
            try:
                query = urllib.parse.urlparse(self.path).query
                params = urllib.parse.parse_qs(query)
                url = params.get('url', [None])[0]

                if url:
                    # Validate URL scheme to prevent SSRF/Local File Inclusion
                    parsed_url = urllib.parse.urlparse(url)
                    if parsed_url.scheme not in ('http', 'https'):
                        self.send_error(400, "Invalid URL scheme. Only http and https are allowed.")
                        return

                    req = urllib.request.Request(
                        url,
                        data=None,
                        headers={
                            'User-Agent': 'Mozilla/5.0 (compatible; CalendarProxy/1.0)'
                        }
                    )
                    with urllib.request.urlopen(req) as response:
                        content = response.read()
                        self.send_response(200)
                        self.send_header('Content-Type', 'text/calendar; charset=utf-8')
                        # Removed Access-Control-Allow-Origin: * to prevent cross-origin exploitation
                        self.end_headers()
                        self.wfile.write(content)
                else:
                    self.send_error(400, "Missing URL parameter")
            except Exception as e:
                self.send_error(500, str(e))
        else:
            super().do_GET()

# Use ThreadingHTTPServer for multi-threading support
# Bind to the custom handler
with ThreadingHTTPServer(("", PORT), ProxyHTTPRequestHandler) as httpd:
    print(f"Serving at http://localhost:{PORT}")
    httpd.serve_forever()
