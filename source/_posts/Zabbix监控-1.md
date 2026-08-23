---
title: Zabbix监控-1
date: 2026-08-07 11:49:30
tags: [Linux, Rocky9, 运维, Zabbix, 监控]
categories: 大二集训
---

# 8.5 笔记：Zabbix 部署

从这次课开始，我们要学习平台监控了。这次笔记，我们要搭建好简单监控的环境。

---

## 一、Rocky Linux 9 基础配置

### （1）理解

Rocky9 与之前课程学习用到的 CentOS7 都是 RHEL 系企业的 Linux，但是 CentOS7 已经停止维护，Rocky9 比较新，还在继续维护。

它们之间，很大的区别应该是包管理器，CentOS7 主命令 `yum`，底层是 dnf，Rocky9 的主命令是 `dnf`，yum 是 dnf 的软链接，实际起作用的还是 dnf。

### （2）实验

我们需要在 Vmware 上，新搭建一个干净的 Rocky Linux 9.6 的操作系统底座。

具体地，我们提前在本机上安装好 Rocky Linux 9.6 最小化的镜像，官方路径在 [Rocky9.6官方镜像](https://dl.rockylinux.org/vault/rocky/9.6/isos/x86_64/) 。

进入 Vmware，创建新的虚拟机，选择典型（推荐）里面 Rocky Linux 64 位版本的操作系统，建议 2 核 4G 内存，NAT 模式，最后在虚拟机设置里选择镜像，就建好虚拟机了。

![](1.png)

开启虚拟机，启动菜单选择 `Install Rocky Linux 9` 开始安装，在安装摘要界面处理好带感叹号！的选项，打开网卡，地区选亚洲/上海，打开网络时间同步，设置 root 密码，勾选【允许 root 用户使用密码进行 SSH 登录】，重启系统，就进入了登录界面。

远程连接后，开始初始化配置。大概需要关闭防火墙，下载常用包，更换镜像仓库（如果我们访问官方源，是比较慢的，可以换为阿里云），修改网卡名称，配置域名解析等。监控时候，如果不开防火墙，会产生一些问题。

![](2.png)

修改一下网卡配置吧，我们修改内核启动参数，进入 `/boot/loader/entries/` 在 `options root=` 这一行的最后面，加上 `net.ifnames=0`，这样，系统就不会自动生成 ensxxx 这种新式的网卡名字，而是挥发老系统的 eth0, eth1 命名方法。再次重启虚拟机，配置就会生效了。

![](3.png)

我们需要注意一下，RHEL9 不可以直接修改 `/etc/sysconfig/grub`，那是 grub2 的传统方式，用 `grub2-mkconfig` 生成配置。RHEL9 的 systemd-boot（UEFI 启动）配置是 `/boot/loader/entries/*.conf`，直接编辑就好，不用生成。

后续我们可以再通过下面的命令，确认修改生效并为 eth0 创建连接。

![](4.png)

通过 `nmcli` 命令，看到有两行多余行，网卡 eth0 的连接名字是 `Wired connection 1`，我们通过 `nmcli connection modify "Wired connection 1" connection.id eth0`，把名字改回 eth0，通过 `nmcli connection delete ens160` 删去多余行。重载后会生效。

我们在这里了解一下 `nmcli` 的含义。`nmcli` 完整写法是 NetworkManager command-line，用来管理网络连接。connection 是连接设备，NAME 列，一套网络配置（ip、网关、dns），可以有多套配置；device 是物理网卡，DEVICE 列，里面的 eth0、ens160、lo 等，是真实网卡的硬件名字。

系统原本应用的 dhcp 策略容易使 IP 发生变化，我们可以使用 nmcli 命令的方式配置为静态 IP，我的 IP 在 192.168.86.135，于是命令为 `nmcli c modify eth0 ipv4.addresses '192.168.86.135/24' ipv4.gateway '192.168.86.2' ipv4.dns '114.114.114.114'`。
最后要记得`nmcli c up eth0`激活配置使静态网卡生效。

![](5.png)

可能是刚开始用 Rocky9，部署很习惯，配置静态 IP 还是 CentOS7 容易一点。

在 CentOS7 里，我们只需改 `/etc/sysconfig/network-scripts/ifcfg-ens32`（也可能是 ifcfg-ens33），修改后，`BOOTPROTO=static`（或 none），添加静态 IPADDR，子网掩码 `IPNETMASK=255.255.255.0`，网关 `GATEWAY=192.168.86.2`，`DNS1=114.114.114.114`，以及网卡对外的名称 `NAME=eth0`。

设置网卡名字，需要我们在`/etc/default/grub`里面，`GRUB_CMDLINE_LINUX`行末尾（但是在引号内）加上`net.ifnames=0 biosdevname=0`，然后通过`grub2-mkconfig -o /boot/grub2/grub.cfg`自动生成配置。重启，eth0网卡名字生效。

如此一来，我们的 Rocky 配置就算完成了。

---

## 二、Zabbix 部署

### （1）理解

监控在运维里很重要，而 Zabbix 是监控中最常用的系统。

监控有三个核心，及时发现，提前预警，事后追溯，同时也有三个维度，指标（Metrics），日志（Logs）和链路追踪（Tracing）。Zabbix 可以自动帮我们做完这一切，不需要自己写代码去挨个查每台机器的状态，它能够采集存储数据、画图展示、通知报警。

Zabbix 的工作模式是 C/S 架构，我们会在 server 端下命令、收数据、发警报，监控 agent 端，在 agent 端执行总部命令，上报数据。

Zabbix 中还有“拉取（Pull）”的概念，是说 Zabbix 是总部主动来要数据。但也有系统是推送（Push）的，是Agent主动向总部去喊：“总部！我 CPU 爆了！”比如 Prometheus。

我们部署的时候，要先把基础环境搭建好。装 MySQL，Apache(Web)，配 YUM 源。下面我们正式开始部署吧。

### （2）实验

官方下载和安装文档的路径在 [zabbix安装](https://www.zabbix.com/cn/download) ，使用文档在 [zabbix使用文档](https://www.zabbix.com/documentation/6.0/zh/manual/)。

提前配好 MySQL 服务，下面我们跟着文档来做，在 server1 上安装 Zabbix 官方源，导入 Zabbix 初始数据。

![](6.png)

因为我已经装过了，显示有一些异常，是提醒用户存在之类的，我们不用理会。

大概来说，我们安装好 Zabbix 软件仓库后，要继续安装服务器，Web 前端及代理程序的服务。再登录 MySQL 创建初始数据库，将配置文件 `/etc/zabbix/zabbix_server.conf` 里的密码改为 password，`DBPassword=password`。启动 `zabbix-server zabbix-agent httpd php-fpm` 进程并设为开机自启，下面我们去 agent 端操作。

![](7.png)

我们需要在 server2 上安装 Agent，在 zabbix_agent 配置文件里，将服务指向 server1 的 IP，配置 Hostname 为 server2，再启动 zabbix_agent 服务。这样，架构就算搭好了。

下面，我们进行前端初始化。

进入浏览器，访问 server 端虚拟机中的 Zabbix 界面（如我的，是访问 192.168.86.135/zabbix），根据我们的情况来填写，最后检查的信息如下。

![](8.png)

实际初始化和图片所示，有区别，没有 ”Pre-installation summary” 这一栏。因为实验用的是 6.0 版本，图片所示为 5.0。

我们登录管理员站好 Admin，密码为 zabbix，就进入管理界面了。

![](9.png)

> 下一篇，我们使用 Zabbix。