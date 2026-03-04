import os
import subprocess
import paramiko

print("Syncing dashboard files to VPS...")
# Using ssh to mkdir if not exists
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
host = os.environ.get('VPS_HOST')
password = os.environ.get('VPS_PASS')
if not host or not password:
    print("Error: VPS_HOST and VPS_PASS environment variables must be set.")
    exit(1)
client.connect(host, username='root', password=password, timeout=30)
client.exec_command("mkdir -p /opt/vibecraft/dashboard/src")
client.exec_command("mkdir -p /opt/vibecraft/dashboard/public")

import shutil
print("Zipping local project for fast transfer")
shutil.make_archive("deploy", "zip", root_dir=".", base_dir="dashboard")
shutil.make_archive("deploy_compose", "zip", root_dir=".", base_dir="docker-compose.prod.yml")

print("Uploading to VPS...")
sftp = client.open_sftp()
sftp.put("deploy.zip", "/opt/vibecraft/deploy.zip")
sftp.put("deploy_compose.zip", "/opt/vibecraft/deploy_compose.zip")
sftp.close()

print("Extracting and building on VPS...")
def run(cmd, timeout=300):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    for line in iter(stdout.readline, ""):
        print(line, end="")
    for line in iter(stderr.readline, ""):
        print(line, end="")
    return stdout.channel.recv_exit_status()

# 1. Extract zip
print("Installing unzip...")
run("apt-get update && apt-get install -y unzip", timeout=120)

print("Extracting...")
run("cd /opt/vibecraft && unzip -o deploy.zip && unzip -o deploy_compose.zip", timeout=60)
# 2. Build the new compose structure
print("Building and restarting containers...")
run("cd /opt/vibecraft && docker compose -f docker-compose.prod.yml up -d --build", timeout=300)

client.close()
print("Deployment script finished.")
