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

with open('debug_traefik.txt', 'w', encoding='utf-8') as f:
    f.write("=== TRAEFIK COMMAND ARGS ===\n")
    args = run("docker inspect traefik-traefik-1 | jq '.[0].Args'")
    f.write(args)

    f.write("\n\n=== CURL HTTP ===\n")
    curl_http = run("curl -I -H 'Host: vibecraft.hach.dev' http://localhost")
    f.write(curl_http)

    f.write("\n\n=== CURL HTTPS ===\n")
    curl_https = run("curl -I -k -H 'Host: vibecraft.hach.dev' https://localhost")
    f.write(curl_https)

client.close()
