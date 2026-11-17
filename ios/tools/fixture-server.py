"""iOS 版の照合データを Mac だけで作るための配信サーバー（Node が無くても使える）。

Web 版（リポジトリ直下の index.html と assets/）を配信し、tests/v11-harness.mjs と同じ位置に
検査用の入口 globalThis.__mm3Test を差し込む。ブラウザで開いたページから POST /__fixture に
JSON を送ると ios/Packages/TodayMoneyCore/Tests/TodayMoneyCoreTests/Fixtures/<name>.json に保存する。

使い方: python3 ios/tools/fixture-server.py 8766  → http://localhost:8766/
"""
import http.server, json, os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FIX = os.path.join(ROOT, 'ios/Packages/TodayMoneyCore/Tests/TodayMoneyCoreTests/Fixtures')
MARKER = 'try{await saveAsync({snapshot:data})}catch'
HOOK = ("globalThis.__mm3Test={ev:s=>eval(s),getData:()=>JSON.parse(JSON.stringify(data)),"
        "replaceData:snapshot=>safeCommitAsync(()=>restoreDataSnapshot(normalizeData(snapshot))),renderAll};\n")

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def do_GET(self):
        path = self.translate_path(self.path)
        if path.endswith('.js') and os.path.isfile(path):
            text = open(path, encoding='utf-8').read()
            if MARKER in text:
                body = text.replace(MARKER, HOOK + MARKER, 1).encode()
                self.send_response(200); self.send_header('Content-Type', 'text/javascript')
                self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body); return
        if self.path.split('?')[0] in ('/sw.js',):
            self.send_response(404); self.end_headers(); return
        super().do_GET()
    def do_POST(self):
        if not self.path.startswith('/__fixture/'):
            self.send_response(404); self.end_headers(); return
        name = os.path.basename(self.path[len('/__fixture/'):]) or 'out'
        raw = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        obj = json.loads(raw)
        os.makedirs(FIX, exist_ok=True)
        with open(os.path.join(FIX, name + '.json'), 'w', encoding='utf-8') as f:
            json.dump(obj, f, ensure_ascii=False, indent=1); f.write('\n')
        self.send_response(200); self.send_header('Content-Type', 'text/plain'); self.end_headers(); self.wfile.write(b'ok')

if __name__ == '__main__':
    http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8766), H).serve_forever()
