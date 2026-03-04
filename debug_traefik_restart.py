import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('72.61.101.24', username='root', password='GPL?root85420', timeout=30)

def run(cmd, timeout=30):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    stdout.channel.recv_exit_status()
    out = stdout.read().decode().strip()
    return out

with open('debug_traefik_restart.txt', 'w', encoding='utf-8') as f:
    f.write("=== RESTARTING TRAEFIK ===\n")
    f.write(run("docker restart traefik-traefik-1", timeout=60))
    
    import time
    time.sleep(5) # wait for traefik to parse docker events

    f.write("\n\n=== RECENT LOGS ===\n")
    f.write(run("docker logs traefik-traefik-1 --tail 100 2>&1 | grep -E 'vibecraft|level=error' || true"))

    f.write("\n\n=== ROUTERS STATE (API) ===\n")
    # Traefik Dashboard might be inactive, testing curl
    f.write(run("curl -s 'http://localhost:8080/api/rawdata' | grep -i 'vibecraft' || echo 'API disabled'"))

client.close()
