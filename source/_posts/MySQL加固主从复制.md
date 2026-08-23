---
title: MySQL加固主从复制
date: 2026-08-02 10:32:36
tags: [Linux, CentOS, 运维, MySQL]
categories: 大二集训
---


# 7.30 笔记：加固主从复制

这篇笔记整理的是7/30的课堂内容。我们在安装好MySQL异步同步的前提下，通过半同步和组复制等，将单机的MySQL升级成了更安全的生产级数据库系统。

基础的主从复制能多保存一份数据，即使主库炸了，我们仍能再从库里读取数据。但这需要我们手动在备用机里查找数据，麻烦且容易出错。我们可以通过下面的加固手段保护数据。

---

## 一、GTID模式

### （1）理解
GTID（`Global Transaction Identifier`）是全局事务ID。这种模式主从切换时不需要指定日志文件和 position 位置，依靠事务唯一编号自动同步，部署、故障切换更简单。现在生产环境基本都用GTID模式。

### （2）实验
把传统的基于 binlog文件+position 的复制，升级为GTID模式，每个事务都需要有一个全局唯一ID。在主库上修改配置文件，开启GTID模式，并强制GTID事务一致性。修改配置后，重启mysqld服务，使之生效。

在mysql里，我们创建了 `repl` 用户，使它允许86网段的主机，密码登录。

![](1.png)

到了从库，停止当前正在运行的主从同步服务，清空旧的主从复制配置和本机二进制日志，并重新进行配置。
在配置语句中，最后一条 `MASTER_AUTO_POSITION=1` 是GTID的核心。它负责开启GTID的自动定位，不再需要指定日志文件和偏移量。配置好后，再次启动 IO 线程、SQL 线程，开始同步主库数据。

![](2.png)

进入server3，同样地，我们重新配置，将它的主库指向server2。

![](3.png)

通过 `show slave status` 检查时，我们发现两个库的 `Retrieved_Gtid_Set`（从库 IO 线程）和 `Executed_Gtid_Set`（从库 SQL 线程）都不一样。在主库上（其实是浏览器上）删写数据尝试，发现只要是连接后的数据信息，确实同步了。

---

## 二、半同步复制

### （1）理解
复制模式有异步复制（默认的，主库执行完事务直接返回成功），半同步复制（至少一台从库收到主库的文件，并返回确认ACK，返回执行成功），全同步复制（所有从库全部执行完成事务才返回）。我们主要学的是半同步复制。这种复制可以保证数据的零丢失，并且没有全同步延迟那么高，很常用。金融、支付类核心业务必须开这个。

### （2）实验
接着，我们就在已经搭好GTID主从复制的Master主库上，部署半同步复制（semi-sync replication）。它的原理大概是：主库提交 → 写`binlog` → 推送给从库 → 从库落盘 → 返回ACK → 主库commit → 返回客户端。如果超时没收到ACK，主库会自动降级为异步复制，从而保证可用性。

在主库和从库上，我们都要安装半同步插件，启用插件。比主库多的步骤是，从库加载完插件，需要重启IO线程，使半同步立即生效。这样，我们就能实时查看半同步运行的状态了。

![](4.png)

我们重新改一下server3的配置，让它指向server1。等再登主库，通过 `SHOW STATUS LIKE 'Rpl_semi_sync%';` 查看半同步状态时，发现server1的从库变成了两个。

![](5.png)

我们插入一组信息看看，发现 `Rpl_semi_sync_master_yes_tx` 参数值为1，表示有一组数据是通过半同步复制的，事务平均等待从库ACK耗时是2409微秒(μs)，有2次等待从库应答。

![](6.png)

如果将几个从库都停止服务，我们再插入数据时，应用会等待10秒后再显示。主库一直收不到从库的回答，默认等待时间为10秒，10秒过后，连接模式自动变成异步复制。`Rpl_semi_sync_master_status` 值变为OFF（半同步模式关闭），`Rpl_semi_sync_master_no_tx` 值为1（有1条数据未通过半同步模式复制）。这里的等待参数是可以自己设置的，如果是和金融相关的一些产品，会直接将参数设为∞来保证数据0丢失。

但当我们重新启动IO线程，mysql会自动切回半同步模式。

![](7.png)

如果需要重启后，仍能保持半同步的状态，就需要将 `rpl_semi_sync_master_enabled=1` 写入 `my.cnf` 配置文件了。

---

## 三、延迟复制

### （1）理解
延迟复制（Delayed Replica）是指，从库拿到主库`binlog`日志后，不会立刻执行事务，强制等待一段时间后再执行，这样可以防止“手滑删库跑路”，适合用来恢复误删的数据。

### （2）实验
在slave上，我们停止它的SQL线程，设置延迟为70（秒），再重新启动SQL服务。当我们再在master上更新数据时，slave会等待70s再同步。通过 `show slave status\G` 查看从库状态。

我们的延迟时间 `SQL_Delay`=70，这条日志还需要再等待 `SQL_Remaining_Delay`=31秒才会执行，当前从库整体落后主库 `Seconds_Behind_Master`=40秒。

![](8.png)

它是为了方便在我们在操作失误时回滚，当我们想撤回这次操作时，可以在slave上输入 `STOP REPLICA SQL_THREAD;` 立刻停掉SQL线程，将slave上的数据拷回给master。

---

## 四、并行复制

### （1）理解
并行复制是指从库使用多线程并行重放binlog事务。原本从库只有1条SQL线程回放binlog，主库大量并发写入时，从库会追不上，复制延迟会飙升。但我们开启多线程同时回放中继日志后，主从延迟会降低，效率也随之提升。

### （2）实验
修改master的配置文件，添加配套参数，来支持逻辑时钟的并行复制。我们来确认一下配置文件。

```ini
[mysqld]
basedir=/usr/local/mysql
datadir=/data/mysql
socket=/data/mysql/mysql.sock
port=3306
user=mysql
pid-file=/data/mysql/mysql.pid
character-set-server=utf8mb4
collation-server=utf8mb4_unicode_ci
log-error=/data/mysql/mysql-error.log
innodb_buffer_pool_size=1G
max_connections=1000

default_authentication_plugin=mysql_native_password

log-bin=/data/mysql/binlog
server-id=1
gtid_mode=ON
enforce-gtid-consistency=ON
rpl_semi_sync_master_enabled=1

binlog_format=ROW
transaction_write_set_extraction=XXHASH64
binlog_transaction_dependency_tracking=WRITESET
binlog_transaction_dependency_history_size=50000

[client]
socket=/data/mysql/mysql.sock
```

重启服务，我们继续去slave的配置文件里，添加并行复制的参数。关键是 `replica_parallel_type=LOGICAL_CLOCK`，表示并行调度的模式是逻辑时钟方式；`replica_parallel_workers=16` 表示开启16个工作线程；`replica_preserve_commit_order=ON` 是强制地，让从库事务的最终提交顺序和主库保持一致。

```ini
[mysqld]
basedir=/usr/local/mysql
datadir=/data/mysql
socket=/data/mysql/mysql.sock
port=3306
user=mysql
pid-file=/data/mysql/mysql.pid
character-set-server=utf8mb4
collation-server=utf8mb4_unicode_ci
log-error=/data/mysql/mysql-error.log
innodb_buffer_pool_size=1G
max_connections=1000

server-id=22
log-bin=/data/mysql/binlog
gtid_mode=ON
enforce-gtid-consistency=ON
rpl_semi_sync_master_enabled=1

replica_parallel_type=LOGICAL_CLOCK
replica_parallel_workers=16
replica_preserve_commit_order=ON
relay_log_recovery=ON
relay_log_info_repository=TABLE
master_info_repository=TABLE

[client]
socket=/data/mysql/mysql.sock
```

在server3上也可以改哦，改好配置文件后，我们就要重新启动服务了。

---

## 五、MGR组复制

### （1）理解
多主模式是指，集群所有节点均为 PRIMARY 角色，所有节点默认支持读写，不存在主从区分。其中的关键参数是 `group_replication_single_primary_mode=OFF`。如果参数值变为ON，就是单主模式。

### （2）实验
要实现组复制，我们要先停止MySQL，清空原有数据目录来清除旧的binlog/GTID冲突。

然后重新编写基础 `my.cnf`，设置 `default_authentication_plugin=mysql_native_password`（解决MGR账号连接加密报错）。

具体地，我们 `my.cnf` 文件内容为

```ini
[mysqld]
basedir=/usr/local/mysql
datadir=/data/mysql
socket=/data/mysql/mysql.sock
port=3306
user=mysql
pid-file=/data/mysql/mysql.pid
character-set-server=utf8mb4
collation-server=utf8mb4_unicode_ci
log-error=/data/mysql/mysql-error.log
innodb_buffer_pool_size=1G
max_connections=1000
default_authentication_plugin=mysql_native_password

[client]
socket=/data/mysql/mysql.sock
```

![](9.png)

接着 `mysqld --initialize` 初始化数据库，再启动MySQL，登录修改root初始密码。

![](10.png)

创建组复制专用恢复账号后，修改 `my.cnf` 追加 MGR 核心参数，再依次启动集群(间隔一段时间更好)，注意，这里只有server1是引导集群的（`SET GLOBAL group_replication_bootstrap_group` 这两条只在server1执行，启动集群后立即关闭）。

具体地，我们 `my.cnf` 文件内容为

```ini
[mysqld]
basedir=/usr/local/mysql
datadir=/data/mysql
socket=/data/mysql/mysql.sock
port=3306
user=mysql
pid-file=/data/mysql/mysql.pid
character-set-server=utf8mb4
collation-server=utf8mb4_unicode_ci
log-error=/data/mysql/mysql-error.log
innodb_buffer_pool_size=1G
max_connections=1000
default_authentication_plugin=mysql_native_password

disabled_storage_engines="MyISAM,BLACKHOLE,FEDERATED,ARCHIVE,MEMORY"
server_id=1
gtid_mode=ON
enforce_gtid_consistency=ON
binlog_checksum=NONE
log_bin=binlog
log_replica_updates=ON

plugin_load_add='group_replication.so'
group_replication_group_name="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
group_replication_start_on_boot=off
group_replication_local_address= "192.168.86.133:33061"
group_replication_group_seeds= "192.168.86.133:33061,192.168.86.134:33061,192.168.86.175:33061"
group_replication_bootstrap_group=off
group_replication_ip_whitelist="192.168.86.0/24,127.0.0.1/8"
group_replication_single_primary_mode=OFF
group_replication_enforce_update_everywhere_checks=ON

[client]
socket=/data/mysql/mysql.sock
```

![](11.png)

最终，我们通过 `SELECT * FROM performance_schema.replication_group_members;` 查看状态，发现节点都变成ONLINE SECONDARY了。

![](12.png)

实际操作遇到了一些问题，查看状态时，server2、server3启动MGR后，持续处于RECOVERING状态，无法加入集群。
排错时发现，这是因为账号的权限有问题，具体地，账号和密码不匹配。

![](13.png)

我们回到server1，删除掉旧用户，重建复制账号后再搭建集群，发现可以建立连接啦。

至此，我们的组复制就完成啦。在三个节点都可以进行写操作。

![](14.png)

---

> 这些加固手段是可以互相叠加，递进的。在生产中，我们推荐的组合是一个主库，一个正常读的半同步的从库，和一个延迟1h的延迟库。