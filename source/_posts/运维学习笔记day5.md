---
title: 运维学习笔记Day5
date: 2026-04-20 16:38:06
tags: [Linux, CentOS, 实训]
categories: 学习笔记
---

# Linux 系统管理部分的学习笔记

本笔记的主要内容是 **网络管理 (nmcli 与传统方法)** ，还包含一些 **文件压缩、命令解释器、用户与权限管理、ACL 等核心内容**，其实并不是当天就产出的内容，当时有点拖延了，就一直留到今天才产出啦

---

## 第一部分：管理 Linux 的联网

### 环境准备
- **虚拟机操作**：关机 → 编辑虚拟机设置 → 添加网络适配器 → 选择 **仅主机模式 (Host-Only)**。
- **网卡说明**：
    - `ens33`：平时上网用的 **NAT 模式**网卡（请勿随意动）。
    - `ens36` / `ens37`：**仅主机模式**测试网卡（本节课新增网卡，由于历史原因我这里显示为 `ens37`）。

---

### 方法一：现代化方法 (nmcli 命令)
> **适用系统**：RHEL 7/8/9、CentOS 7/8/9 推荐。
> **核心**：NetworkManager 服务必须保持 **running**。

#### 1. 前提检查 (NetworkManager)
```bash
systemctl status NetworkManager   # 确保状态是 active (running)
systemctl start NetworkManager    # 若未启动则手动启动
systemctl enable NetworkManager   # 设置开机自启
```
![0.png](0.png)

#### 2. 常用 nmcli 实操 (针对 ens37)

**① 查看状态，确认网卡识别**
![1.png](1.png)
```bash
ip a                               # 查看所有网卡及 IP，确认 ens37 存在
nmcli device status                # 查看设备状态，确认 ens37 为 UP 状态
```
![2.png](2.png)
> 嗯嗯，好啦。

**② 设置静态 IP：12.130.1.37/24（修改并生效，查看变化）**
![3.png](3.png)
```bash
nmcli c modify ens37 ipv4.method manual ipv4.addresses 12.130.1.37/24 ipv4.gateway 12.130.1.1 ipv4.dns 114.114.114.114 && nmcli c up ens37 && ip a
```
> 发现 `12.130.1.100` 消失 → 变成 `12.130.1.37/24`。

**③ 额外多绑定一个 IP（12.130.1.38）（追加 IP，查看双 IP 效果）**
![4.png](4.png)
```bash
nmcli c modify ens37 +ipv4.addresses 12.130.1.38/24 && nmcli c up ens37 && ip a
```
> 多出 `12.130.1.38`，IP 同时有 `37` + `38`。

**④ 切换为 DHCP（需要先清空原有静态 IP，避免报错）**
![5.png](5.png)
```bash
nmcli c modify ens37 ipv4.method auto ipv4.addresses "" ipv4.gateway "" && nmcli c up ens37 && ip a
```
> 震惊！静态 IP 全部消失，但获取到新的 DHCP 地址。

**⑤ 关闭网卡**
![6.png](6.png)
```bash
nmcli c down ens37
ip a
```
> 哦哦，`ens37` 的所有 IPv4 消失了。
>
> *注：DHCP 自动获取 IP 不固定，虚拟机重启后 `ens33` IP 变为 `10.0.0.136`，远程连接工具需重新连接。*

**nmcli 方法总结**：
- 使用 `NetworkManager` + `nmcli` 命令
- 网卡：`ens37`（仅主机）专门测试
- 操作：`nmcli c modify`、`up`、`down`
- **优点**：不用关服务，不用改文件

---

### 方法二：传统方法 (修改配置文件)
> **适用系统**：CentOS 7 / RHEL 7~9（生产环境最常用）。
> **核心思路**：**先禁用 NetworkManager** → 直接修改 `/etc/sysconfig/network-scripts/` 下的文件。

#### 1. 前提（必做）
- 虚拟机添加网卡（仅主机模式）
- 系统语言改为英文（避免中文路径/显示异常）
- `ens33` 是正在使用的网卡，绝对不能乱删乱改

#### 2. 核心操作：禁用 NetworkManager（重点）
![7.png](7.png)
```bash
systemctl stop NetworkManager
systemctl disable NetworkManager
```
> ✅ 作用：关闭自动网络管理，才能手动改配置文件。

#### 3. 直接修改网卡配置文件（企业最常用）
![8.png](8.png)
- 进入目录：`/etc/sysconfig/network-scripts/`
- 编辑配置文件（以 `ifcfg-ens33` 为例），只保留核心内容：
```ini
TYPE=Ethernet
BOOTPROTO=static
NAME=ens33
DEVICE=ens33
ONBOOT=yes
IPADDR=10.0.0.136
NETMASK=255.255.255.0
GATEWAY=10.0.0.2
DNS1=114.114.114.114
```

#### 4. 重启网络服务，让配置生效
![9.png](9.png)
```bash
systemctl restart network   # 注意是 network，不是 NetworkManager
```

#### 5. 测试网络是否配置成功
![10.png](10.png)
```bash
ip a
ping -c 4 baidu.com
```

#### 6. 网络工具命令
```bash
wget 网址             # 下载文件（Linux版迅雷）
wget -C 网址          # 断点续传（断网后继续下载）
curl 网址             # 测试网站连通性
curl -I 网址          # 查看服务器响应头（看Nginx、状态码）
vim /etc/hosts        # 修改主机名解析（IP 主机名）
```

#### 7. 传统方法总结
- 生产环境服务器**一律用静态 IP**，不能用动态 DHCP
- 网关固定规则：网段最后一位 **`.2`**（例：`192.168.36.2`）
- 修改配置前**必须禁用 NetworkManager**
- 配置文件只保留核心配置，多余内容全部删除
- IP 必须和当前正在使用的一致，**填错直接断网**
- 改完配置必须重启网络服务才会生效
- 测试用仅主机网卡，不影响上网网卡 `ens33`

---

### 实战演练：静态 IP + Apache 搭建

> **背景**：前面网卡配置冲突，跟着 AI 删除所有旧连接后重建 `ens33`，最终成功。
> ![11.png](11.png)
> 可以发现，倒数第二行成功输出 `"hello world"`，本小节试验成功ヽ(✿ﾟ▽ﾟ)ノ

**清空重建流程（遇到冲突时的解决方法）**：
```bash
nmcli c show
nmcli c delete ens33
nmcli c delete "Wired connection 1"
nmcli c add type ethernet ifname ens33 con-name ens33
nmcli c up ens33
```

**搭建 Apache (httpd) 服务**：
```bash
yum install -y httpd
systemctl start httpd
systemctl enable httpd
echo "hello world" > /var/www/html/index.html
curl http://10.0.0.136   # 输出：hello world
```

**小 tips**：
- 服务器必须用静态 IP
- 网卡名要对应，配置错乱会导致启动失败
- DNS 配置不对会无法上网
- 配置乱了就清空重建，不要硬修

---

## 第二部分：补充核心知识点（文件压缩、Shell、用户与权限管理）

> 以下内容基于课堂 AI 总结，涵盖运维必备基础。

### 一、文件压缩与解压

**核心思想**：使用 `tar` 命令打包，并结合不同压缩算法。

#### 1. 常见格式
| 格式 | 压缩工具 | 特点 | 适用场景 |
| :--- | :--- | :--- | :--- |
| `.tar.gz` / `.tgz` | gzip | 压缩率较低，速度快 | 普通文件 |
| `.tar.bz2` | bzip2 | 压缩率更高，较慢 | 大文件（如 Linux 内核源码） |

#### 2. 核心命令
```bash
# 创建压缩包
tar -czf 目标包名.tar.gz 要压缩的目录/文件
tar -cjf 目标包名.tar.bz2 要压缩的目录/文件

# 解压压缩包
tar -xzf 压缩包名.tar.gz
tar -xjf 压缩包名.tar.bz2
tar -xzf xxx.tar.gz -C /指定路径   # 解压到指定目录
```

**参数解释**：
- `-c`：创建 (Create)
- `-x`：解压 (eXtract)
- `-z`：处理 gzip 格式
- `-j`：处理 bzip2 格式
- `-f`：指定文件名（后必须紧跟文件名）
- `-C`：解压到指定路径

---

### 二、命令解释器 (Shell) 与环境变量

#### 1. Shell 基础
- Shell 是用户与系统内核交互的**翻译官**，负责解释和执行命令。
- 命令分为**内置命令**（如 `cd`, `type`）和**外置命令**（如 `ls`, `tar`）。可用 `type -a 命令名` 查看。

#### 2. 别名 (Alias)
```bash
alias ping3='ping -c 3'          # 临时设置
echo "alias ping3='ping -c 3'" >> ~/.bashrc   # 永久设置（需 source 或重登生效）
\ls                              # 在命令前加反斜杠可忽略别名
```

#### 3. 环境变量 PATH
- 系统通过 `PATH` 变量中定义的路径列表来查找可执行命令。
- 自定义脚本全局执行方法：
    1. 添加可执行权限：`chmod +x 脚本名`
    2. 放入 PATH 包含的目录（如 `/usr/local/bin`、`~/bin`）。
- 修改 `PATH` 通常在 `~/.bash_profile` 或 `~/.bashrc` 文件中进行。

#### 4. 特殊符号
| 符号 | 作用 |
| :--- | :--- |
| `;` | 顺序执行多条命令 |
| `*` `?` | 通配符，匹配任意数量或单个字符 |
| `[]` | 匹配括号内任意一个字符，`[! ]` 表示取反 |
| \`\` (反引号) | 命令替换，先执行反引号内命令，结果作为输入 |

---

### 三、用户、组与账号管理

#### 1. 账户类型
| 类型 | UID | 说明 |
| :--- | :--- | :--- |
| 超级用户 (root) | 0 | 拥有最高权限 |
| 系统账户 | 1-999 | 用于运行系统服务，通常无登录 Shell (`/sbin/nologin`) |
| 普通用户 | 1000+ | 日常登录用户 |

#### 2. 核心配置文件
| 文件 | 作用 |
| :--- | :--- |
| `/etc/passwd` | 存储用户账户信息（用户名、UID、GID、家目录、Shell） |
| `/etc/shadow` | 存储加密密码及密码策略（有效期、警告期等） |
| `/etc/group` | 存储用户组信息 |

#### 3. 管理命令

**用户管理**：
```bash
useradd [选项] 用户名          # 创建用户（-u UID, -s Shell, -d 家目录, -g 主组, -G 附加组）
usermod [选项] 用户名          # 修改用户
userdel -r 用户名              # 删除用户并连带家目录
passwd 用户名                  # 设置密码
echo "新密码" | passwd --stdin 用户名 > /dev/null   # 非交互式改密
```

**组管理**：
```bash
groupadd 组名
groupmod [选项] 组名
groupdel 组名                 # 组内无用户时才能删除
gpasswd -a 用户 组名          # 将用户加入组
gpasswd -d 用户 组名          # 将用户移出组
```

**检查命令执行状态**：
```bash
echo $?     # 返回 0 为成功，非 0 为失败
```

#### 4. 账号切换
| 命令 | 区别 |
| :--- | :--- |
| `su - 用户名` | 完全切换用户环境（家目录、环境变量），需知道**目标用户**密码 |
| `sudo 命令` | 授权普通用户执行特定命令，需验证**当前用户**密码，配置在 `/etc/sudoers` |

---

### 四、文件与目录权限管理

#### 1. 基本权限 (UGO 模型)
- **权限对象**：`u` (User/Owner)、`g` (Group)、`o` (Other)
- **权限类型**：
    - `r` (Read)：读取文件内容/列出目录
    - `w` (Write)：修改文件/在目录增删文件
    - `x` (Execute)：运行程序/进入目录
- **表示方法**：
    - 字母：`rwxr-xr--`
    - 数字：`r=4, w=2, x=1`，相加即得。例如 `rwxr-xr--` = `754`

#### 2. 权限匹配顺序
系统按 **Owner → Group → Other** 顺序检查，一旦匹配即应用对应权限。

#### 3. 修改权限命令
```bash
chmod 755 文件/目录               # 数字法
chmod u=rwx,g=rx,o=r 文件/目录    # 字符法
chmod -R 755 目录名               # 递归修改

chown 所有者:所属组 文件/目录      # 修改所有者和所属组
chgrp 所属组 文件/目录             # 仅修改所属组
```

#### 4. 特殊权限
| 权限 | 字母 | 数字前缀 | 作用 |
| :--- | :--- | :--- | :--- |
| **SetUID** | `s` (u) | 4 | 文件执行时，临时拥有**文件所有者**权限（风险高，慎用） |
| **SetGID** | `s` (g) | 2 | 文件：执行时临时拥有文件所属组权限；目录：新建文件继承目录所属组 |
| **Sticky Bit** | `t` (o) | 1 | 仅对目录有效，文件只能被**所有者、目录所有者、root**删除（如 `/tmp`） |

示例：`chmod 4755 file` 设置 SetUID；`chmod 1777 /shared` 设置 Sticky Bit。

#### 5. 访问控制列表 (ACL)
**用途**：提供比 UGO 更精细的权限控制，可为特定用户或组单独授权。
```bash
setfacl -m u:用户名:权限 目录         # 设置 ACL（如 u:tom:rx /project）
getfacl 目录                          # 查看 ACL（权限位末尾有 `+` 号表示存在 ACL）
setfacl -x u:用户名 目录               # 删除特定 ACL 条目
setfacl -b 目录                       # 清空所有 ACL
```

#### 6. 默认权限与 umask
- 新建文件/目录的默认权限由 **最大权限** 减去 **umask** 得到。
- 最大权限：文件 `666`，目录 `777`。
- root 用户 umask 通常为 `0022`，普通用户为 `0002`。
- 计算示例（root, umask=0022）：
    - 目录：`777 - 022 = 755` (rwxr-xr-x)
    - 文件：`666 - 022 = 644` (rw-r--r--) （系统自动去掉执行权限）

**设置 umask**：
```bash
umask 077                           # 临时设置
echo "umask 077" >> ~/.bashrc       # 永久设置（写入用户配置文件）
```

---

> 本次笔记到这里啦🤔
```
