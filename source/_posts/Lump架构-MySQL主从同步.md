---
title: Lump架构-MySQL主从同步
date: 2026-07-31 12:04:49
tags: [Linux, CentOS, 运维, Lnmp架构, MySQL]
categories: 大二集训
---

# 7.29 笔记：MySQL 源码编译与主从复制

这次笔记整理的是7/29内容，我们主要在一台源码编译的MySQL上，搭建单主单从的级联数据库架构。

---

## 一、MySQL 8.0.36 源码编译

### （1）能做什么

MySQL是一个关系型数据库管理系统（RDBMS），是我们通过SQL语言来查、存、改、删这些数据，方便我们管理数据信息。很多中小企业会有类似的基础的数据库架构。

与内存Redis不同，缓存里的数据重启是容易丢失的。但MySQL会将数据存储在磁盘中，使数据被永久保存，给数据做持久化存储。

搭建LAMP/LNMP架构的核心是MySQL，我们安装好后可以通过phpMyAdmin验证环境是否跑通。

### （2）上机实验

**1. 前期准备**

我们前期需要去官网（https://downloads.mysql.com/archives/community/） 获取源码包，选择带`boost`集成版本的 `mysql-8.0.36-src.tar.gz`，版本为8.0.36，操作系统选择 `Source Code` 源代码，操作系统版本选择 `All` 全部。

将压缩包上传到终端（直接拖到目录 `/root` 里）并解压，进入mysql目录，新建一个  `build` 文件夹是用来外部编译的。

我们把源代码 `/root/mysql-8.0.36/`编译产生的所有中间文件，目标程序等，都放在 `build/` 里。使执行 `cmake...` 后，所有编译产生的垃圾文件不散落在源码文件，集合起来，方便管理。如果我们需要重新编译，需要清理残留的文件，只需要 `rm -f build/*` 一条命令。

![](1.png)

**2. 安装依赖**

为了让依赖下载的速度更快，我们可以更换yum源为阿里云。接着就要安装全部的依赖了，主要是 `cmake` 和 `gcc`。`cmake` 作为编译配置工具，相当于搭建编译框架，是一定要安装好的。

我们把系统上之前cmake3旧版本删去，下载好新版本，并配置环境变量（把 `cmake` 命令加入系统，使终端能直接识别cmake指令）。最后可以通过 `cmake --version` 校验一下版本。

![](2.png)

MySQL8.0的源代码，是用C++17写的，`gcc` 作为C/C++的编译器，也必须要安装。CentOS7出厂的确自带着gcc4.8.5，但版本太低，最高只支持C++11，我们需要升级gcc。

升级gcc之前，我们要安装软件源 `yum install -y centos-release-scl`。`centos-release-scl` 是一个Yum源配置包，安装好，系统会新增一套官方软件仓库地址（`CentOS-SCLo-scl.repo`），我们后面装的 `devtoolset-9-gcc` 和 `devtoolset-9-gcc-c++` 都来自SCL源（Software Collections，软件集合源）。

![](3.png)

其余还需要安装 `make`（调用cmake生成文件，执行编译），`ncurses-devel`（终端交互库），`openssl-devel`（提供SSL加密，mysql登录、传输），`bison`（语法解析工具），`libtirpc-devel`（远程调用库，可选）。用到的命令是 `yum install -y cmake gcc gcc-c++ make ncurses-devel openssl-devel bison libtirpc-devel`，最后可以通过 `gcc -v` 和 `g++ -v` 检查一下版本。

**3. cmake配置，编译安装**

到这里，我们就可以CMake编译安装mysql了。进入创建的 `build` 目录，cmake编译配置（这条命令好长），编译（`make -j$(nproc)`，`make -j4`），安装（`make install`）。

```bash
cmake .. \
-DCMAKE_C_COMPILER=$(which gcc) \
-DCMAKE_CXX_COMPILER=$(which g++) \
-DCMAKE_INSTALL_PREFIX=/usr/local/mysql \
-DMYSQL_DATADIR=/data/mysql \
-DSYSCONFDIR=/etc/mysql \
-DMYSQL_UNIX_ADDR=/data/mysql/mysql.sock \
-DMYSQL_TCP_PORT=3306 \
-DWITH_INNOBASE_STORAGE_ENGINE=1 \
-DWITH_BOOST=../boost/boost_1_77_0 \
-DWITH_SSL=system \
-DDEFAULT_CHARSET=utf8mb4 \
-DDEFAULT_COLLATION=utf8mb4_unicode_ci \
-DWITH_SYSTEMD=1 \
-DWITH_DEBUG=0
```

![](4.png)

Two thousand years later...经过漫长的等待，我们终于编译好了。再经过安装，就可以进入数据库了（可能是由于之前给虚拟机分配的内存有点小，或者CPU分配数量不够，咋这么慢呢qwq）。

**4. 初始化数据库，配置环境**

安装好mysql，为了用 `service mysql start/stop` 直接管理它的启动停止，我们想把源码包自带的脚本复制到系统目录 `/etc/init.d/`，命名为 `mysql`。MySQL 8.0 虽然仍提供 `support-files/mysql.server`，但官方推荐使用 `systemd` 管理服务，因此我们选择直接编写 `mysqld.service` 单元文件。我们直接创建一个systemd服务单元文件，启停服务。在 `/usr/lib/systemd/system` 下，创建 `mysqld.service` 文件，写入：

```ini
[Unit]
Description=MySQL Server
Documentation=man:mysqld(8)
After=network.target

[Service]
User=mysql
Group=mysql
ExecStart=/usr/local/mysql/bin/mysqld --defaults-file=/etc/my.cnf
#ExecReload=/usr/local/mysql/bin/mysqladmin shutdown
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

其中，核心运行参数的含义是：MySQL进程以 `mysql` 用户运行，`ExecStart` 是真正启动命令，`ExecReload` 执行 `systemctl reload mysqld` 运行的命令（MySQL 不支持热重载全部配置，修改 `my.cnf` 需要重启），`Restart=on-failure` 当程序异常崩溃、意外退出时 `systemd` 自动重启MySQL。

接着到了初始化数据库，并且配置环境。具体地，我们先创建运行用户 `mysql`，给他目录授权，初始化（初次执行 `mysqld --initialize --user=mysql`，会生成一个没有逻辑的mysql初始密码，我们暂时记录好他，为了方便后续改一个好记的密码 `westos`，或者 `grep "temporary password" /data/mysql/mysql-error.log` 过滤查看临时密码(这里路径根据实际情况哈)）

![](5.png)

**5. 安全加固（`mysql_secure_installation`）**

启动mysql服务后，3306端口开始运行，进行安全初始化。在这里，我们可以先临时进入mysql，通过 `ALTER USER 'root'@'localhost' IDENTIFIED BY 'westos';` 修改密码。进入mysql的命令是 `mysql -u(用户名) -p(密码)`，回车后输入密码。`-p` 也可以直接跟密码，但会被进程列表暴露，问题不大。再退出mysql交互界面，输入 `mysql_secure_installation` 进行初始化。

![](6.png)

再次进入mysql，通过 `show databases;` 查看当前的数据库。数据库里可以存放多个数据表（Table）。

现在能看到四个MySQL自带的系统库，分别是 `mysql` 核心库（存放账号、权限、密码等用户信息），`information_schema` 数据库元信息（记录所有表、字段等信息），`performance_schema` 服务器性能统计，和 `sys` 方便查看数据库运行状态。

![](7.png)

**6. phpMyAdmin 部署**

phpMyAdmin软件可以使我们通过Web界面管理MySQL，帮助我们验证 Nginx，PHP，MySQL三者的连通性。我们解压它，简化访问路径（改名），重启Nginx服务。这里我们需要改一下 `nginx.conf` 文件，在它的默认首页上放上 `index.php`，并打开 `location ~ \.php$` 语句块。再重启一下Nginx服务，然后修改 `php.ini` 中 `pdo_mysql.default_socket` 和 `mysqli.default_socket` 的值，指向MySQL的socket文件路径 `/data/mysql/mysql.sock`，然后重载 php-fpm，就可以在浏览器连接了。

![](8.png)

这时候就有人要问了，那么好几行的注释，我们能不能一下子取消呢？其实是可以的。我们进入vim编辑界面（默认的普通模式），按 `Shift+V`（进入行可视化模式），鼠标移动到第一个需要取消的 `#` 上，方向键 `↓` 选中所有需要注释的代码，按 `Shift+i`（大写I），输 `d`，就把这一列的 `#` 删完了。想一下子加上注释，输 `#`，按 `Esc` 再等一下下，就好啦。

![](9.png)

在首页输入用户名 `root` 和密码就进来啦。可以在这里看到数据库。

---

## 二、MySQL 主从复制

### （1）理解

单台server机子的MySQL可能会出错，我们可以多来几台server，让它们自动抄写server1的数据，将它们变成可备份、可扩容的存储集群。即从库（Slave）会会把主库（Master）干的活重新再干一边，但只有主库是写数据的，从库只抄（只读）。

从库起两个IO和SQL两个线程，IO 线程负责“连主库 → 拉 `binlog`（二进制日志） → 写到本机 `relay log`”，SQL 线程负责“读 `relay log` → 解析成 SQL/行事件 → 在从库执行”。理想情况下，从库执行完，数据就和主库一致了。简单说，IO负责连接，SQL负责数据内容。

我们最终想达到 `server1 → server2 → server3` 的链式效果，server2既是slave又是master。主库不用直接连多个从库，可以减轻压力。这时候要注意，三个节点的数据必须完全一致，我们要通过 `mysqldump` 将它们同步起来。

### （2）实验

**1. 基本配置**

实现文件的同步，进入server1（主节点）并启动mysqld服务，将server1的 `/usr/local/mysql` 程序目录、`/etc/mysql` 配置文件、`systemd` 启动脚本、`.bash_profile` 环境变量都拷贝到新服务器server2上。这需要server2安装好 `rsync` 服务。

![](10.png)

在从库server2上配置 `server_id`，指定主库信息，启动复制线程。创建用户和空目录 `/data/mysql`，修正目录权限 `mysql:mysql`，执行初始化命令，生成全新数据目录。

![](11.png)

这里我们发现，初始化的 `mysqld --initialize` 执行失败了，我们回到配置文件看看。`mysqld --initialize` 只负责初始化数据字典和系统表，不加载组复制插件，识别不了 `group_replication_*` 系列参数。我们应该：先初始化→启动MySQL→`INSTALL PLUGIN group_replication SONAME 'group_replication.so'`→再启用相关参数。简单说，把 `group_replication_*` 全部注释就能启动啦。等后续要数据库初始化完成、启动成功之后，再恢复启用组复制。

![](12.png)

和之前主库类似地，我们进行安全初始化并修改密码后，就可以进入mysql交互界面了。我们配置一下GTID的主从，连接上主库，查看slave的状态，看到 `Slave_IO_Running` 和 `Slave_SQL_Running` 都是 `Yes`，就连接成功啦。

![](13.png)

配置最后，这里有两种位点可选，分别是 `MASTER_AUTO_POSITION=1`（GTID 自动位点）和 `MASTER_LOG_FILE`+`MASTER_LOG_POS`（传统位点），两者互斥。

我们确认一下文件

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

log-bin=mysql-bin
server-id=1

[client]
socket=/data/mysql/mysql.sock
```

我们先用传统位点来配置。在主库进入MySQL交互界面，输入 `show master status;` 查看 `File` 和 `Position` 给到从库。传统位点复制依赖 `MASTER_LOG_FILE` + `MASTER_LOG_POS`，要求主从数据起点一致；GTID 复制通过全局事务 ID 自动定位，但前提是主库开启了 `gtid_mode=ON`。无论哪种模式，`server_id` 必须唯一，且从库数据必须与主库在某个时间点保持一致，否则 SQL 线程会报错。

先在主库创建复制用户。

![](14.png)

从库是这样配的。

![](15.png)

这里看到IP变了，可能是由于DHCP自动分配地址。但没事，我们重连，重配一下就好啦。这个还是比较麻烦的，改了很久。下面，我们再用GTID自动复制来一下吧qwq。

**2. 数据同步测试**

去浏览器上访问主库的网页，在里面新建了一个 `test` 数据库，插入 `users` 表，在表里插入了两组信息。但其实在主库的MySQL界面用命令行插入信息也可以。

![](16.png)

进入从库访问MySQL，发现能看到信息，即从库配好啦。

![](17.png)

**3. 线性复制**

我们再搭建一个server3从库，达到 `server1 → server2 → server3` 的链式效果。这时，server2 既是slave又是master了，其中最关键的一步是 `log_slave_updates=ON`，没有这个参数，server2 不会把自己从 server1 收到的 binlog 再写到自己的 binlog 里，server3 什么都拉不到。可以说，这是级联复制的灵魂参数。这里由于之前配过GTID，我们配置前先停止GTID服务再连接。

![](18.png)

在主库上新建内容，发现从库server3读取到啦。但是这次的mysql复制是增量同步，复制只会从指定的 binlog 位置（或 GTID 集合）开始回放，之前的历史数据不会自动同步。如果想同步历史数据，必须在搭建复制前通过 `mysqldump` 做全量备份并导入从库，使主从数据在某个时间点达成一致。具体地，这需要我们在原始主库（server1）上，锁表导出全量备份，将 `all.sql` 导入server3。

![](19.png)
