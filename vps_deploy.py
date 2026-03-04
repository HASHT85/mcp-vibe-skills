import paramiko
import os
import tarfile
import io

VPS_IP = "72.61.101.24"
VPS_USER = "root"
VPS_PASS = os.environ.get("VPS_PASS")
APP_DIR = "/opt/vibecraft"
LOCAL_DIR = r"c:\Projet\mcp-vibe-skills\mcp-vibe-skills"

EXCLUDE = {'node_modules', 'dist', '.git', '__pycache__'}

print(f"Connecting to {VPS_IP}...")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(VPS_IP, username=VPS_USER, password=VPS_PASS, timeout=30)
print("Connected!")

def run(cmd, check=True):
    print(f"$ {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    if out: print(out)
    if err: print(f"[err] {err}")
    return out

# 1. Setup directories
run(f"mkdir -p {APP_DIR}")
run("docker network create web 2>/dev/null || true")
print("VPS ready!")

# 2. Upload project as tar via SFTP
print("Uploading project files...")
sftp = client.open_sftp()

def upload_dir(local, remote):
    try:
        sftp.mkdir(remote)
    except: pass
    for item in os.listdir(local):
        if item in EXCLUDE or item.startswith('.'):
            if item not in ['.env', '.env.example']:
                continue
        lpath = os.path.join(local, item)
        rpath = remote + '/' + item
        if os.path.isdir(lpath):
            upload_dir(lpath, rpath)
        else:
            print(f"  Uploading {item}...")
            sftp.put(lpath, rpath)

upload_dir(LOCAL_DIR, APP_DIR)
print("Upload done!")

# 3. Build and launch
print("Building Docker image...")
run(f"cd {APP_DIR} && docker compose -f docker-compose.prod.yml --env-file .env build 2>&1 | tail -5", check=False)
print("Starting containers...")
run(f"cd {APP_DIR} && docker compose -f docker-compose.prod.yml --env-file .env up -d 2>&1")
print("Status:")
run(f"cd {APP_DIR} && docker compose -f docker-compose.prod.yml ps")

sftp.close()
client.close()
print("\nDone! VibeCraft should be running on the VPS.")
