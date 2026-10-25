import os
import urllib.request
import json
import ssl

ctx = ssl.create_default_context()
url = os.getenv('SUMOPOD_BASE_URL', 'https://ai.sumopod.com/v1').rstrip('/') + '/chat/completions'
token = os.getenv('SUMOPOD_API_KEY', '')

if not token:
    print("[WARN] SUMOPOD_API_KEY environment variable is not set. Exiting test.")
    exit(0)

data = json.dumps({'model': 'MiniMax-M3.1-Flash-Preview', 'messages': [{'role': 'user', 'content': 'hi'}]}).encode('utf-8')

headers_list = [
    {'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'},
    {'Content-Type': 'application/json', 'api-key': token},
    {'Content-Type': 'application/json', 'x-api-key': token},
    {'Content-Type': 'application/json', 'Authorization': token}
]

for h in headers_list:
    req = urllib.request.Request(url, data=data, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=5, context=ctx) as r:
            print('SUCCESS with header:', h)
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='ignore')
        print(f"HTTP Error {e.code} with {list(h.keys())}: {body[:120]}")
    except Exception as e:
        print('Err:', e)
