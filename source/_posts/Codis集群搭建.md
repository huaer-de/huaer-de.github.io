---
title: Codis集群搭建
date: 2026-08-03 20:41:48
tags: [Linux, CentOS, 运维, 集群搭建, 作业]
categories: 大二集训
---

# Codis 集群搭建笔记

## 1. 介绍

Codis 是一个由豆瓣开源的分布式 Redis 解决方案。对于上层应用来说，连接到 Codis Proxy 和连接原生的 Redis Server 没有显著区别，底层会处理请求的转发和不停机的数据迁移等工作。

---

## 2. 环境准备

**实验环境**：CentOS 7 虚拟机，IP: 192.168.86.135

### 2.1 安装 JDK

```bash
tar -zxvf jdk-8uXXX-linux-x64.tar.gz -C /usr/local/
mv /usr/local/jdk1.8.0_XXX /usr/local/java
```

配置 JAVA_HOME 环境变量后，验证安装：

```bash
java -version
```

![](1.png)

### 2.2 安装 ZooKeeper

Codis 使用 ZooKeeper 作为外部存储，管理集群元数据。

```bash
tar -zxvf zookeeper-3.4.14.tar.gz -C /usr/local/
mv /usr/local/zookeeper-3.4.14 /usr/local/zookeeper
mkdir -p /data/zookeeper
cp /usr/local/zookeeper/conf/zoo_sample.cfg /usr/local/zookeeper/conf/zoo.cfg
sed -i 's@dataDir=/tmp/zookeeper@dataDir=/data/zookeeper@' /usr/local/zookeeper/conf/zoo.cfg
```

启动并验证 ZooKeeper：

```bash
/usr/local/zookeeper/bin/zkServer.sh start
/usr/local/zookeeper/bin/zkServer.sh status
```

![](2.png)

### 2.3 安装 Go 运行环境

Codis 由 Go 语言编写，需要 Go 运行环境。

```bash
wget https://golang.org/dl/go1.7.3.linux-amd64.tar.gz
tar -zxvf go1.7.3.linux-amd64.tar.gz -C /usr/local/
echo 'export PATH=$PATH:/usr/local/go/bin' >> /etc/profile
source /etc/profile
go version
```

> **注意**：需要设置 `$GOPATH` 环境变量，Codis 源码需下载到 `$GOPATH/src/github.com/CodisLabs/codis`。

![](3.png)

---

## 3. 编译 Codis

从 GitHub 下载 Codis 3.2 分支源码并编译：

```bash
mkdir -p $GOPATH/src/github.com/CodisLabs
cd $GOPATH/src/github.com/CodisLabs
git clone https://github.com/CodisLabs/codis.git -b release3.2
cd codis
make
```

编译成功后，`bin/` 目录下会生成以下可执行文件：

- `codis-dashboard` — 集群管理服务
- `codis-proxy` — 代理服务
- `codis-admin` — 命令行管理工具
- `codis-fe` — Web 管理界面
- `codis-server` — 基于 Redis 3.2.8 的服务端

![](4.png)

---

## 4. 修改配置文件

需要修改以下三个配置文件（位于 `config/` 目录下）：

![](5.png)

### 4.1 dashboard.toml

配置 Dashboard 参数：

```toml
coordinator_name = "zookeeper"            # 外部存储类型：zookeeper/etcd
coordinator_addr = "192.168.86.135:2181"  # ZooKeeper 地址
product_name = "codis-demo"               # 集群名称
product_auth = ""                         # 集群密码（默认为空）
admin_addr = "0.0.0.0:18080"              # Dashboard API 端口
```

### 4.2 proxy.toml

配置 Proxy 参数：

```toml
product_name = "codis-demo"           # 必须与 Dashboard 一致
product_auth = ""                     # 必须与 Dashboard 一致
admin_addr = "0.0.0.0:11080"          # Proxy 管理端口
proto_type = "tcp4"
proxy_addr = "0.0.0.0:19000"          # Proxy 服务端口（客户端连接端口）
```

### 4.3 redis.conf

Codis Server 基于 Redis，使用标准 Redis 配置文件，默认端口 6379。

![](6.png)

---

## 5. 启动集群

> **启动顺序**：必须按照 Dashboard → Proxy → Server → FE 的顺序启动。

### 5.1 启动 Dashboard

```bash
nohup ./bin/codis-dashboard --ncpu=4 --config=config/dashboard.toml \
  --log=logs/dashboard.log --log-level=WARN &
```

启动后 Dashboard 监听 `18080` 端口提供 RESTful API。可通过日志确认启动状态：

```bash
tail -100 logs/dashboard.log
```

### 5.2 启动 Proxy

```bash
nohup ./bin/codis-proxy --ncpu=4 --config=config/proxy.toml \
  --log=logs/proxy.log --log-level=WARN &
```

> **重要**：Proxy 启动后处于 `waiting` 状态，不会接受客户端连接，需要添加到集群并完成状态同步后才能变为 `online`。

### 5.3 将 Proxy 添加到集群并设为 Online

通过 `codis-admin` 命令行工具将 Proxy 加入集群：

```bash
./bin/codis-admin --dashboard=192.168.86.135:18080 \
  --create-proxy --addr=192.168.86.135:11080

./bin/codis-admin --dashboard=192.168.86.135:18080 \
  --online-proxy --addr=192.168.86.135:11080
```

添加过程中，Dashboard 会完成：验证集群 name 和 auth、将 Proxy 信息写入外部存储、同步 slots 状态、标记 Proxy 为 online。

### 5.4 启动 Codis Server

```bash
./bin/codis-server config/redis.conf
```

启动方式与普通 Redis 完全一致。

### 5.5 启动 Codis FE（Web 管理界面）

```bash
nohup ./bin/codis-fe --zookeeper=192.168.86.135:2181 \
  --listen=0.0.0.0:9090 --log=logs/fe.log --log-level=WARN &
```

FE 启动后监听 `9090` 端口。通过浏览器访问 `http://192.168.86.135:9090` 即可进入管理界面。

检查端口：

```bash
netstat -tlnp | grep 9090
```

![](7.png)

---

## 6. 配置集群

### 6.1 创建 Group 并添加 Server

通过 FE 界面操作：

1. 在集群管理页面选择对应集群（如 `codis-demo`）
2. 在 **Group** 栏点击 **NEW GROUP**，输入 Group ID（如 1）
3. 在 **Add Server** 输入框填写 Codis Server 地址（`192.168.86.135:6379`），点击 **Add Server**

> **原理**：Group 是 Codis 中的服务器组，每个 Group 包含一个 Master 和多个 Slave，负责存储一部分数据。

创建 Group 界面：

![](8.png)

添加 Server 后，界面显示状态如下（Data Center 显示 NO:ONE 可忽略，Memory 和 Keys 正常）：

![](9.png)

### 6.2 初始化 Slots

Codis 将数据分散到 **1024 个槽位（Slots）** 中。新增集群的 slot 状态为 `offline`，需要进行初始化：

在 FE 界面点击 **Rebalance All Slots** 按钮，系统会将 1024 个 slot 自动分配到各个 Group。

> **原理**：Codis 3.x 的 rebalance 算法基于 Group 下的 slot 数量进行分配。分配完成后，蓝色条（未分配）消失，表示所有 slot 已分配完毕。

![](10.png)

### 6.3 通过 redis-cli 测试

通过 `redis-cli` 连接 Codis Proxy（端口 19000）进行测试：

```bash
redis-cli -h 192.168.86.135 -p 19000
127.0.0.1:19000> set key1 value1
OK
127.0.0.1:19000> get key1
"value1"
```

> **注意**：客户端应连接 Proxy 端口（19000），而非直接连接 Codis Server（6379）。

![](11.png)
