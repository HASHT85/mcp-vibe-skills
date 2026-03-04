import os
import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
host = os.environ.get('VPS_HOST')
password = os.environ.get('VPS_PASS')
if not host or not password:
    print("Error: VPS_HOST and VPS_PASS environment variables must be set.")
    exit(1)
client.connect(host, username='root', password=password, timeout=30)

def run(cmd, timeout=30):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    stdout.channel.recv_exit_status()
    out = stdout.read().decode().strip()
    return out

with open('debug_containers.txt', 'w', encoding='utf-8') as f:
    f.write("=== ALL CONTAINERS ===\n")
    containers = run("docker ps -a --format '{{.Names}}'")
    f.write(containers)
    f.write("\n\n=== EXAMINING LABELS ===\n")
    for name in containers.split('\n'):
        if name.strip():
            f.write(f"\n--- {name} ---\n")
            f.write(run(f"docker inspect {name} | jq '.[0].Config.Labels'"))

client.close()
