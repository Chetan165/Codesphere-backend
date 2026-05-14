# Judge0 AWS Setup Guide

This guide describes how to deploy the custom Judge0 setup on AWS using Ubuntu 22.04.

It covers:

- one API machine that runs the Judge0 API services plus Redis and PostgreSQL
- separate worker-only machines for the `run` and `submit` queues
- Docker Compose based deployment
- Ubuntu 22.04 prerequisites
- cgroup v1 configuration required by Judge0/isolate

## Recommended Architecture

Use three node roles:

1. API machine

- Runs Judge0 API containers
- Runs Redis
- Runs PostgreSQL
- Exposes API ports to your backend

2. Run worker machine

- Runs Judge0 workers only
- Uses `JUDGE0_VERSION=run`
- Watches `run,default`
- Can overflow into the default queue when `run` is empty

3. Submit worker machine

- Runs Judge0 workers only
- Uses `JUDGE0_VERSION=default`
- Watches `default` only
- Scales horizontally when contest submissions increase

## Suggested AWS Instance Types

These are good starting points for college-scale contest traffic.

### API machine

- `t3.micro` is possible only if Redis and PostgreSQL are remote and traffic is light
- Better: `t3.small` or `t3.medium`
- If Redis and PostgreSQL are colocated with API, use at least `t3.medium`

### Run worker machine

- Recommended: `c7i-flex.large ` or `t3.medium (2cpus , 4gb ram)` for lower costs
- Reason: steady CPU performance and good value for short, frequent jobs

### Submit worker machine

- Recommended: `c5a.xlarge`
- Reason: 4 vCPU and 8 GB RAM gives more headroom for heavier submissions and Java spikes

If memory pressure appears on submit workers, prefer adding more submit instances before increasing worker count too aggressively.

## 1. Launch Ubuntu 22.04 EC2 Instances

Create the following EC2 instances:

- 1 API machine running Ubuntu 22.04
- 1 run worker machine running Ubuntu 22.04
- 1 submit worker machine running Ubuntu 22.04

Use Security Groups so that:

- API ports are open only to your backend or load balancer
- Redis and PostgreSQL are private and reachable only from your Judge0 machines
- SSH is allowed only from your IP

## 2. Install Docker and Docker Compose

On each EC2 instance:

Run the following command to uninstall all conflicting packages:

```bash
sudo apt remove $(dpkg --get-selections docker.io docker-compose docker-compose-v2 docker-doc podman-docker containerd runc | cut -f1)
```

```bash
# Add Docker's official GPG key:
sudo apt update
sudo apt install ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Add the repository to Apt sources:
sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
```

install docker packages

```bash
sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

## 3. Enable cgroup v1

Judge0/isolate expects cgroup v1 with memory controller available.

On Ubuntu 22.04, edit GRUB:

```bash
sudo nano /etc/default/grub
```

Change the `GRUB_CMDLINE_LINUX_DEFAULT` line to include:

```bash
GRUB_CMDLINE_LINUX_DEFAULT="systemd.unified_cgroup_hierarchy=0 cgroup_enable=memory swapaccount=1"
```

Then run:

```bash
sudo update-grub
sudo reboot
```

After reboot, verify:

```bash
cat /proc/cmdline
ls -ld /sys/fs/cgroup/memory
```

should print tmpfs

## 4. Clone Your Judge0 Repository

On each machine:

```bash
git clone <your-github-repo-url>
cd judge0-1.13.1
```

Replace `<your-github-repo-url>` with your own GitHub URL.

## 5. API Machine Setup

The API machine runs two API services:

- `server_run` for the run queue
- `server_submit` for the submit queue

Both can live in the same Docker Compose file, with different host ports.

### API config files

Create two config files on the API machine:

- `judge0.run.conf`
- `judge0.submit.conf`

#### `judge0.run.conf`

```properties
JUDGE0_VERSION=run
REDIS_HOST=<redis-private-ip-or-host>
REDIS_PORT=6379
REDIS_PASSWORD=<redis-password>
POSTGRES_HOST=<postgres-private-ip-or-host>
POSTGRES_PORT=5432
POSTGRES_DB=judge0
POSTGRES_USER=judge0
POSTGRES_PASSWORD=<postgres-password>
RAILS_MAX_THREADS=1
```

#### `judge0.submit.conf`

```properties
JUDGE0_VERSION=default
REDIS_HOST=<redis-private-ip-or-host>
REDIS_PORT=6379
REDIS_PASSWORD=<redis-password>
POSTGRES_HOST=<postgres-private-ip-or-host>
POSTGRES_PORT=5432
POSTGRES_DB=judge0
POSTGRES_USER=judge0
POSTGRES_PASSWORD=<postgres-password>
RAILS_MAX_THREADS=1
```

### API docker-compose example

Use one compose file with two API services and Redis/Postgres if you are keeping them on the same node.

```yaml
x-logging: &default-logging
  logging:
    driver: json-file
    options:
      max-size: 100M

services:
  server_run:
    image: judge0/judge0:latest
    volumes:
      - ./judge0.run.conf:/judge0.conf:ro
    ports:
      - "2358:2358"
    privileged: true
    <<: *default-logging
    restart: always

  server_submit:
    image: judge0/judge0:latest
    volumes:
      - ./judge0.submit.conf:/judge0.conf:ro
    ports:
      - "2359:2358"
    privileged: true
    <<: *default-logging
    restart: always

  db:
    image: postgres:16.2
    env_file: judge0.run.conf
    volumes:
      - data:/var/lib/postgresql/data/
    ports:
      - "5432:5432"
    <<: *default-logging
    restart: always

  redis:
    image: redis:7.2.4
    command:
      [
        "bash",
        "-c",
        'docker-entrypoint.sh --appendonly no --requirepass "$$REDIS_PASSWORD"',
      ]
    env_file: judge0.run.conf
    ports:
      - "6379:6379"
    <<: *default-logging
    restart: always

volumes:
  data:
```

### Start the API stack

```bash
docker compose up -d
```

### Verify API endpoints

```bash
curl http://localhost:2358/version
curl http://localhost:2359/version
curl http://localhost:2358/workers
curl http://localhost:2359/workers
```

Expected:

- port `2358` is the run API
- port `2359` is the submit API

## 6. Run Worker Machine Setup

The run worker machine should run workers only.

### Run worker config

Use one `judge0.conf` on the run worker machine:

```properties
JUDGE0_VERSION=run
QUEUES=run,default
COUNT=2
REDIS_HOST=<redis-private-ip-or-host>
REDIS_PORT=6379
REDIS_PASSWORD=<redis-password>
POSTGRES_HOST=<postgres-private-ip-or-host>
POSTGRES_PORT=5432
POSTGRES_DB=judge0
POSTGRES_USER=judge0
POSTGRES_PASSWORD=<postgres-password>
```

### Run worker docker-compose example

```yaml
x-logging: &default-logging
  logging:
    driver: json-file
    options:
      max-size: 100M

services:
  worker:
    image: judge0/judge0:latest
    command: ["./scripts/workers"]
    volumes:
      - ./judge0.conf:/judge0.conf:ro
    privileged: true
    <<: *default-logging
    restart: always
```

### Start run workers

If you want to scale worker processes in the container, use:

```bash
docker compose up -d --scale worker=2
```

If you want a single container with internal concurrency only, just run:

```bash
docker compose up -d
```

Recommended starting point:

- `COUNT=2`
- `--scale worker=1` or `--scale worker=2` only after monitoring CPU and RAM

## 7. Submit Worker Machine Setup

The submit worker machine should also run workers only.

### Submit worker config

Use one `judge0.conf` on the submit worker machine:

```properties
JUDGE0_VERSION=default
QUEUES=default
COUNT=3
REDIS_HOST=<redis-private-ip-or-host>
REDIS_PORT=6379
REDIS_PASSWORD=<redis-password>
POSTGRES_HOST=<postgres-private-ip-or-host>
POSTGRES_PORT=5432
POSTGRES_DB=judge0
POSTGRES_USER=judge0
POSTGRES_PASSWORD=<postgres-password>
```

Recommended starting point on `c5a.xlarge`:

- `COUNT=3`
- `--scale worker=1` initially
- increase to `--scale worker=2` only if CPU and memory are healthy

### Submit worker docker-compose example

```yaml
x-logging: &default-logging
  logging:
    driver: json-file
    options:
      max-size: 100M

services:
  worker:
    image: judge0/judge0:latest
    command: ["./scripts/workers"]
    volumes:
      - ./judge0.conf:/judge0.conf:ro
    privileged: true
    <<: *default-logging
    restart: always
```

### Start submit workers

```bash
docker compose up -d --scale worker=1
```

You can change the scale later if demand increases.

## 8. Backend Routing

Your frontend/backend should route requests based on type:

- Run endpoint -> `http://<api-ip>:2358`
- Submit endpoint -> `http://<api-ip>:2359`

A typical routing rule is:

- quick execution / run button -> run API
- final contest submission -> submit API

## 9. Redis and PostgreSQL Access

Redis and PostgreSQL are plain TCP services.

- Redis: TCP 6379
- PostgreSQL: TCP 5432

You do not need any special protocol.

Make sure:

- Redis security group allows TCP 6379 only from your Judge0 worker/API security groups
- PostgreSQL security group allows TCP 5432 only from your Judge0 worker/API security groups

## 10. Common Troubleshooting

### `No such file or directory @ rb_sysopen - /box/main.cpp`

This usually means isolate/cgroup setup failed before the sandbox folder was created.

Check:

- container is privileged
- host is using cgroup v1
- memory controller is enabled
- `/sys/fs/cgroup/memory` exists

### `Failed to create control group /sys/fs/cgroup/memory/...`

This means cgroup v1 memory support is not enabled correctly.

Recheck GRUB settings and reboot.

### Worker cannot connect to Redis or PostgreSQL

Check:

- `REDIS_HOST` and `POSTGRES_HOST`
- security groups
- port mappings on the API host if Redis/Postgres are containerized there
- passwords and DB name

## 11. Recommended Contest Baseline

For a 400-500 student contest:

- Run worker: 1 fixed instance on `c7i-flex.large`
- Submit worker: 1 live instance on `c5a.xlarge`
- Submit pre-warm: 1 extra instance ready to start
- API machine: separate from the college frontend/backend
- Java concurrency: keep a backend semaphore limit of 2 to 3

Horizontal scaling of submit workers is usually better than making one machine extremely dense.

## 12. Final Notes

- Keep Judge0 separate from your college frontend/backend
- Prefer AWS for Judge0 worker elasticity
- Use Ubuntu 22.04 on all EC2 nodes
- Keep Redis and PostgreSQL private
- Scale submit workers first, not run workers
- Tune carefully before contest day
