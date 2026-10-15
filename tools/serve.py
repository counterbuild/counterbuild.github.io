"""Local preview server for site/ that tells the browser not to cache, so edits show up immediately."""
import functools, http.server, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
http.server.ThreadingHTTPServer(("", port), functools.partial(NoCache, directory="site")).serve_forever()
