---
title: MysqlRouter配置
date: 2026-08-09 10:54:33
tags: [Linux, CentOS, 运维, MySQL, mysqlrouter]
categories: 大二集训
---

# 8.2 笔记：MysqlRouter配置

这篇笔记是8.2的内容，我们给虚拟机分配了路由。

---

## 一、InnoDB Cluster 单主模式

### （1）理解
在上一次实验，我们搭建了多组模式的MGR组复制集群，使三台server机都可读可写。但是多组的时候，几台机子同时工作，容易出现写冲突，也容易出错。

大部分情况下，我们采用单主模式。在master（1台）出现问题时，系统会自动从slave里选择一个新的master做primary，如果原先的master再回来，会变成secondary，可能丢失数据。

具体地，已提交的数据是不丢失的，但我们强制bootstrap/清GTID/脑裂都会丢数据。于是我们可以设置，不允许存在没有secondary的master，即作为master的最小从库的个数不为0。

### （2）实验
单主模式中，`my.cnf` 的核心参照是 `group_replication_single_primary_mode=ON` 和 `group_replication_enforce_update_everywhere_checks=OFF`，表示开启单主模式了。我们在三个节点都要修改。改后，配置文件如下：

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
server_id=1 # 2, 3
gtid_mode=ON
enforce_gtid_consistency=ON
binlog_checksum=NONE
log_bin=binlog
log_replica_updates=ON

plugin_load_add='group_replication.so'
group_replication_group_name="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
group_replication_start_on_boot=off
group_replication_local_address= "192.168.86.135:33061" # 134, 133
group_replication_group_seeds= "192.168.86.135:33061,192.168.86.134:33061,192.168.86.133:33061"
group_replication_bootstrap_group=off
group_replication_ip_whitelist="192.168.86.0/24,127.0.0.1/8"
group_replication_single_primary_mode=ON
group_replication_enforce_update_everywhere_checks=OFF

[client]
socket=/data/mysql/mysql.sock
```

改后我们重启一下mysqld服务，进入MySQL开始启动集群。在server1上初始化引导节点，（唯一）执行bootstrap。

![](1.png)

在server2和server3上执行 `START GROUP_REPLICATION;` 加入集群，并查看一下状态 `SELECT * FROM performance_schema.replication_group_members;` ，发现集群搭建好啦。

![](2.png)

单组模式启动后，如果server1有故障（比如server1的mysqld服务终止了），Primary会自动切换到server2或server3。
下面我们开始配置MySQL Router了。

---

## 二、MySQL路由器静态配置

### （1）理解
在前几节内容中，我们在底层成功搭建了组复制（三节点的集群）。但是，我们在应用的时候是很难记住这3个节点IP访问的（应用层）。
我们可以在高层架设一台“MySQL路由器”，让程序只需连接好路由器，路由器会自动把请求转发给后端的3台数据库。

对于路由器（MySQL Router），它的上层是应用程序，下层是MGR组复制。
在这个实验里，我们通过MySQL Shell管理MGR，开设7001只读端口和7002读写端口。

### （2）实验
新的server4做我们的路由器。我们先在server4上安装MySQL Router工具，修改对应的配置文件，将7001和7002两个端口的后端地址连接至集群节点。

![](3.png)

具体的，端口文件内容为：

```ini
[routing:ro]
bind_address=0.0.0.0
bind_port=7001
destinations=192.168.86.135:3306,192.168.86.134:3306,192.168.86.133:3306
routing_strategy=round-robin

[routing:rw]
bind_address=0.0.0.0
bind_port=7002
destinations=192.168.86.135:3306
routing_strategy=first-available
```

其中，`bind_port` 是对外监听端口，`destinations` 是后端数据库节点的地址，`routing_strategy` 是访问的策略，在ro端口中，我们采用rr轮询，在rw端口中，采用首选可用。我们把 `[routing:ro]` 和 `[routing:rw]` 添加在配置文件最后面。

接着，我们启动路由服务，安装mysql客户端工具mariadb（可以测试连接的路由），在MGR内部创建测试账号，就可以开始测试连接了。

![](4.png)

在server4上登录只读端7001端口连接MySQL，发现成功进入。这里我跑去server1新建了一个新的test数据库，加了user_tb组，写了三组数据信息。

![](5.png)

可以通过lsof工具，通过命令 `lsof -i :3306` 查看，连接到的服务器后端。显然的，如果是只读端，会被连接在server2或server3上，读写端只能去server1。
实时查看需要在 `lsof -i :3306` 前加上 `watch`。

![](6.png)

---

## 三、动态配置

### （1）理解
添加路由器有静态和动态，两种方式。
静态虽然在教学时，配置简单一点，容易理解一点，但生产几乎不用。静态的IP是被写死的，这样，主库换了，Router是不会感知到的，分配会出错。
动态Router不看IP，看的是连 InnoDB Cluster 的元数据。它能实时知道主库和从库，并自动分配读写权限给数据库。

我们这个实验使用InnoDB Cluster元数据模式（像一个调度器），通过MySQL Shell自，动生成配置。

### （2）实验
来到server1，在primary节点创建集群管理员。

![](7.png)

整理笔记的时候，可能是断网或者什么奇怪原因，单主模式又坏了。可恶啊。。。排错需要我们重启MySQL，清空之前的信息，重新将三个节点建立连接。

回到server4，通过icadmin用户连接主节点的3306端口。让server4接管现有的MGR集群，并验证集群的状态。
第一次连接时，会让输入密码，我们设置的是westos。后面再连接时，就不用输啦。
在这里，我们要注意提前进行好server1和server4的域名解析。否则连接不上哒。

![](8.png)

让它自动生成配置，重启服务，我们发现配置文件已经自动变化了。

![](9.png)

这里的6446端口，是Primary读写端，6447是Secondary只读端。6448和6449是X Protocol忽略端口。
我们输入 `mysql -h192.168.86.154 -P6446 -ulkh -pwestos` 会自动分配到server1的读写端，可以进行写操作。连接6447端口，会分配到只读端。

![](10.png)

恭喜你，已经掌握了两种路由部署的方法。下面升级，我们去看看生产上，MySQL Router高可用部署怎么搭建。

---

## 四、MySQL Router 高可用与横向扩容

### （1）理解
单个Router可能产生单点故障。我们再添加server5，并部署一个Router来避免单点故障。
我们想搭建一个DR模式的四层高可用负载均衡集群，于是又添加了三台机子，server6（LVS Master主调度器），server7（LVS Master备调度器）和server8。

### （2）实验
将域名解析在几台server上都配置好，server5上开始安装并引导第二个Router。

![](11.png)

我们还用不到MySQL X protocol，可以先把配置文件中，相关参数删去。这里要保证我们的单组模式集群是好好开着的。
初始化完成，我们重启服务（可以将其设为开机自启）。

来server6，从server1拷 `/usr/local/mysql/bin/mysql` 给 `server6:/usr/local/bin/`，下载mariasb，ipvsadm，keepalived。我们连接到server4（第一个Router）的6446和6447端口，发现都能访问成功。

![](12.png)

将keepalived的配置文件修改为下面内容：

```bash
! Configuration File for keepalived

global_defs {
   notification_email {
        root@localhost
   }
   notification_email_from Keepalived@localhost
   smtp_server 127.0.0.1
   smtp_connect_timeout 30
   router_id LVS_DEVEL
   vrrp_skip_check_adv_addr
   #vrrp_strict
   vrrp_garp_interval 0
   vrrp_gna_interval 0
}

vrrp_instance VI_1 {
    state MASTER
    interface ens32
    virtual_router_id 51
    priority 100
    advert_int 1
    authentication {
        auth_type PASS
        auth_pass 1111
    }
    virtual_ipaddress {
        192.168.86.100
    }
}

virtual_server 192.168.86.100 6446 {
    delay_loop 3
    lb_algo rr
    lb_kind DR
    persistence_timeout 300
    protocol TCP

    real_server 192.168.86.154 6446 {
        weight 1
        TCP_CHECK {
            connect_timeout 3
            connect_port 6446
        }
    }
    real_server 192.168.86.155 6446 {
        weight 1
        TCP_CHECK {
            connect_timeout 3
            connect_port 6446
        }
    }
}

virtual_server 192.168.86.100 6447 {
    delay_loop 3
    lb_algo rr
    lb_kind DR
    persistence_timeout 300
    protocol TCP

    real_server 192.168.86.154 6447 {
        weight 1
        TCP_CHECK {
            connect_timeout 3
            connect_port 6447
        }
    }
    real_server 192.168.86.155 6447 {
        weight 1
        TCP_CHECK {
            connect_timeout 3
            connect_port 6447
        }
    }
}
```

来到server7和server8，我们先下载软件ipvsadm，keepalived。将server6的配置文件拷贝过来。
在server7上，修改虚拟机为备用机，降低优先级。

![](13.png)

下面我们在两个Router上配置后端服务器。为解决在LVS DR模式，经典的ARP冲突问题，我们要绑定集群的VIP并屏蔽ARP广播，保证负载均衡正常工作。
简单了解一下ARP冲突问题。一般地，调度器（server7/server8）和所有后端 RS 都使绑定在同一个 VIP上的，若不做 ARP 屏蔽（不修改配置），客户端发 ARP 查 VIP，所有服务器都会争抢回复 ARP，流量会直接绕过 LVS 调度器，使负载均衡失效。

![](14.png)

其实ARP抑制，主要是四个参数。
```ini
net.ipv4.conf.lo.arp_ignore = 1
net.ipv4.conf.lo.arp_announce = 2
net.ipv4.conf.all.arp_ignore = 1
net.ipv4.conf.all.arp_announce = 2
```
给网卡ens32额外绑定到VIP 192.168.86.100（`ip addr add 192.168.86.100/24 dev ens32`），屏蔽入站针对 VIP 的 ARP 请求（不对外应答 VIP 的 ARP），并修改出站 ARP 包。将arptables规则保存到配置文件，使开机自动生效，重启后 ARP 屏蔽配置不会丢失。
这样，我们在调度器上用VIP就可以访问到后端了。

![](15.png)

我们可以去server6里，通过 `ipvsadm -Ln` 和 `ipvsadm -Lnc` 查看调度的情况。

![](16.png)

停掉server6，VIP会自动漂移到server7，业务不会中断。

> Over