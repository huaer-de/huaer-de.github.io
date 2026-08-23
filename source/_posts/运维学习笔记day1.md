---
title: 运维学习笔记Day1
date: 2026-04-13 10:00:00
tags: [Linux, CentOS, 实训]
categories: 学习笔记
---

## 前言

课程的前一段时间一直在安装虚拟机（在 VMware 安装别的主机系统），用远程工具连接 CentOS 7。

- **账号**：root
<!-- - **密码**：@822081794Lkh -->
- **密码**：***
- **IP 地址**：10.0.0.134

目前电脑上有两个远程连接的工具，一个是 **MobaXterm**，一个是 **Xshell**，上课主要使用 MobaXterm。

---

## 一、查看 IP 地址与网卡信息

进入 MobaXterm 后，输入以下命令查看 IP 地址：

```bash
ip a
```
![进入界面](image1.png)

可以看到三个 IP 地址，它们的含义分别是：

1. **inet 127.0.0.1/8 (lo 网卡)**  
   这是 Linux 系统自带的虚拟网卡 IP，仅作用于本机通信，比如 `localhost` 就对应此 IP。

2. **inet 10.0.0.134/24 (ens33 网卡)**  
   虚拟机对外的真实 IPv4 地址，是用于远程连接和网络通信的 IP。

3. **inet6 fe80::20c:29ff:fe6c:a43c/64 (ens33 网卡)**  
   IPv6 的链路本地地址（Link-Local Address），用于同一个局域网链路内的通信。

---

## 二、Vim 编辑器的基本操作

### 如何进入并修改文件？

1. 确保已安装 Vim（如果没有安装，后面会讲到如何安装）。
2. 使用以下命令编辑 SELinux 配置文件：
   ```bash
   vi /etc/selinux/config
   ```
3. 进入编辑界面后，按 `i` 键进入插入模式，修改内容。
4. 修改完成后，按 `Esc` 键退出插入模式。
5. 输入 `:q` 退出（未修改时使用），或输入 `:q!` 强制退出（放弃修改）。
![编辑界面](image2.png)

### SELinux 相关命令与三种状态

![](image3.png)

- `getenforce` —— 查看当前 SELinux 状态
- `setenforce 0` —— 临时关闭 SELinux（重启后失效）
- `vi /etc/selinux/config` —— 永久修改配置文件

三种状态分别是：

- **Enforcing** —— 开启（严格限制）
- **Permissive** —— 警告模式（不拦截，但会记录日志）
- **Disabled** —— 关闭（完全不管）

---

## 三、关闭防火墙

为了方便后续做实验，我们需要关闭防火墙。

- 查看防火墙规则：
  ```bash
  iptables -nL
  ```
  该命令可以列出当前防火墙的所有规则，包括开放的端口和允许/拒绝的访问。

- 彻底关闭防火墙：
  ```bash
  systemctl disable --now firewalld
  ```

---

## 四、更换 YUM 源为阿里云镜像

由于我们使用的是最小化安装的 ISO 镜像，很多工具都没有预装。首先需要更换 YUM 源。

1. 进入 YUM 源配置目录：
   ```bash
   cd /etc/yum.repos.d/
   ```

2. 删除当前目录下的所有文件：
   ```bash
   rm -fr *
   ```

3. 从阿里云镜像站下载 CentOS 7 的 YUM 源配置文件：
   ```bash
   curl -o /etc/yum.repos.d/CentOS-Base.repo https://mirrors.aliyun.com/repo/Centos-7.repo
   ```

4. 使用 `ls` 命令查看，此时目录下应该只剩下一个文件了。

![查看目录文件](image4.png)

5. 编辑该配置文件（可选操作，用于清理多余条目）：
   ```bash
   vi /etc/yum.repos.d/CentOS-Base.repo
   ```
   在 Vim 中，可以按 `dd` 删除当前行，仅保留第一个阿里云的源条目。最后输入 `:wq` 保存并退出。

![删除别的包](image6.png)

---

## 五、安装常用工具软件

YUM 源配置完成后，安装三个必备工具：

```bash
yum install -y vim net-tools wget
```

- **vim**：强大的文本编辑器
- **net-tools**：包含 `ifconfig` 等查看 IP、端口的工具
- **wget**：命令行下载工具

---

## 六、常用命令总结

| 功能 | 命令 |
| :--- | :--- |
| 查看 IP 地址 | `ifconfig` 或 `ip a` |
| 编辑文件 | `vim 文件名` |
| 下载网络文件 | `wget 网址`（如 `wget https://www.baidu.com`） |
| 安装软件 | `yum install -y 软件名` |

---

## 七、VMware 克隆与快照

最后，可以多利用 VMware 的克隆体和快照功能，方便在不同实验环境之间快速切换和恢复。

> 本次笔记完毕ovo