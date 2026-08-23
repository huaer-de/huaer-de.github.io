---
title: TiDB单点部署
date: 2026-08-17 22:11:17
tags: [Linux, CentOS, 运维, Zabbix, TiDB，作业]
categories: 大二集训
---

# 8.17 作业：通过 TiDB 搭建 zabbix-server

这是8.17的作业，我们的任务是通过TiDB搭建zabbix-server（好像是这样哒）。

实验开始前，我们先了解一下TiDB，和为什么用TiDB。

TiDB是一个分布式的数据库，就像 **能多台机器一起干活的 MySQL** 。它和 MySQL 的语言是兼容的（协议兼容），我们直接连到 MySQL 上，不用改代码就可以使用。用 TiDB 代替 MySQL 后，可以增加 MySQL 监控的数据量，相当于扩展了 MySQL 的机器数量。

---

## 一、搭建 TiDB 集群

### （1）理解

我们早上的实验，成功通过Ansible在server2上搭建了单点的MySQL，下午，新开三台Rocky9的虚拟机。server3是TiDB Server和PD，即MySQL直接连接的节点。server4和server5是TiKV节点，用来存储数据。

### （2）实验

新开了三台Rocky9的虚拟机，我们解析域名，并与server1实现免密登录。修改server1中 `ansible/hosts` 文件，加上TiDB集群的信息。添加下面的内容：

```
[zabbix_server]
192.168.86.169
[tidb_servers]
192.168.86.174
[tikv_servers]
192.168.86.175
192.168.86.176
```

测试，发现能够成功连通。

![](1.png)

那么就到了关键的一步，创建yaml文件。我们在server1上创建 `tidb.yml`，写入下面的内容。

```
---
# =========================
# Play 1：初始化所有 TiDB 节点
# =========================
- name: Prepare all TiDB nodes
  # 在 inventory 中属于 tidb_servers 或 tikv_servers 的主机上都执行
  hosts: tidb_servers:tikv_servers
  tasks:

    # 安装基础依赖软件
    - name: Install basic dependencies
      ansible.builtin.yum:
        name:
          - wget        # 下载工具
          - curl        # URL 访问工具
          - tar         # 解压工具
          - git         # 版本管理工具
          - epel-release # 扩展软件源
        state: present   # 确保软件包已安装（幂等）

    # 关闭 SELinux（TiDB 官方强烈建议）
    - name: Disable SELinux
      ansible.builtin.selinux:
        state: disabled  # 禁用 SELinux（需重启完全生效）

    # 关闭防火墙（学习环境，避免端口被拦）
    - name: Stop firewalld
      ansible.builtin.service:
        name: firewalld  # 服务名
        state: stopped   # 立即停止
        enabled: no      # 禁止开机自启

# =========================
# Play 2：部署 TiDB Server + PD
# =========================
- name: Deploy TiDB Server + PD
  # 只在 TiDB Server / PD 节点上执行
  hosts: tidb_servers
  tasks:

    # 从官网下载 TiDB 二进制包
    - name: Download TiDB package
      ansible.builtin.get_url:
        url: https://download.pingcap.org/tidb-v7.5.0-linux-amd64.tar.gz
        dest: /tmp/tidb.tar.gz   # 保存到远程主机的路径

    # 解压 TiDB 安装包
    - name: Extract TiDB package
      ansible.builtin.unarchive:
        src: /tmp/tidb.tar.gz     # 源压缩包
        dest: /usr/local/         # 解压目标目录
        remote_src: yes           # 压缩包在远程主机上（不是控制机）
        creates: /usr/local/tidb-v7.5.0-linux-amd64
        # 目录存在则跳过，防止重复解压（幂等）

    # 创建软链接，方便版本升级和路径统一
    - name: Create symbolic link
      ansible.builtin.file:
        src: /usr/local/tidb-v7.5.0-linux-amd64  # 真实目录
        dest: /usr/local/tidb                     # 软链接路径
        state: link                                # 创建软链接

    # 启动 PD（Placement Driver，TiDB 元数据管理组件）
    - name: Start PD
      ansible.builtin.shell:
        cmd: |
          nohup /usr/local/tidb/bin/pd-server \   # 后台启动 PD
            --data-dir=/tmp/pd \                  # PD 数据存储目录
            --log-file=/tmp/pd.log \              # 日志文件
            --client-urls=http://0.0.0.0:2379 \   # 客户端访问地址
            --peer-urls=http://0.0.0.0:2380 \     # PD 集群内部通信地址
            > /dev/null 2>&1 &                    # 输出重定向，后台运行
        creates: /tmp/pd.log
        # pd.log 存在则跳过，防止重复启动 PD（幂等）

    # 等待 PD 端口监听，确保 PD 启动成功
    - name: Wait for PD to start
      ansible.builtin.wait_for:
        port: 2379        # PD 客户端端口
        timeout: 30       # 最长等待 30 秒

    # 启动 TiDB Server（对外提供 MySQL 协议）
    - name: Start TiDB Server
      ansible.builtin.shell:
        cmd: |
          nohup /usr/local/tidb/bin/tidb-server \ # 后台启动 TiDB
            --store=tikv \                        # 使用 TiKV 作为存储引擎
            --path=192.168.86.174:2379 \          # PD 地址（需改成你自己的 PD IP）
            --log-file=/tmp/tidb.log \            # 日志文件
            > /dev/null 2>&1 &                    # 后台运行
        creates: /tmp/tidb.log
        # tidb.log 存在则跳过，防止重复启动（幂等）

    # 等待 TiDB Server 端口监听
    - name: Wait for TiDB Server to start
      ansible.builtin.wait_for:
        port: 4000        # TiDB 默认 MySQL 协议端口
        timeout: 30

# =========================
# Play 3：部署 TiKV（存储节点）
# =========================
- name: Deploy TiKV
  # 只在 TiKV 节点上执行
  hosts: tikv_servers
  tasks:

    # 下载 TiDB 二进制包（TiKV 包含在同一个包中）
    - name: Download TiDB package
      ansible.builtin.get_url:
        url: https://download.pingcap.org/tidb-v7.5.0-linux-amd64.tar.gz
        dest: /tmp/tidb.tar.gz

    # 解压 TiDB 安装包
    - name: Extract TiDB package
      ansible.builtin.unarchive:
        src: /tmp/tidb.tar.gz
        dest: /usr/local/
        remote_src: yes
        creates: /usr/local/tidb-v7.5.0-linux-amd64

    # 创建软链接
    - name: Create symbolic link
      ansible.builtin.file:
        src: /usr/local/tidb-v7.5.0-linux-amd64
        dest: /usr/local/tidb
        state: link

    # 启动 TiKV（真正存储数据的组件）
    - name: Start TiKV
      ansible.builtin.shell:
        cmd: |
          nohup /usr/local/tidb/bin/tikv-server \ # 后台启动 TiKV
            --pd-endpoints=192.168.86.174:2379 \  # PD 地址（需改成你自己的 PD IP）
            --data-dir=/tmp/tikv \                # TiKV 数据存储目录
            --log-file=/tmp/tikv.log \            # 日志文件
            > /dev/null 2>&1 &                    # 后台运行
        creates: /tmp/tikv.log
        # tikv.log 存在则跳过，防止重复启动（幂等）
```

执行自动化脚本后，遇到下载问题。

![](2.png)

于是我们决定，先在本机下载好，再传给server1，让server1通过ansible命令传给server3，server4，server5。

![](3.png)

将 `tidb.yml` 文件里的 `Download TiDB package` 部分，替换为下面的内容。

```yaml
    - name: Check if TiDB package exists
      ansible.builtin.stat:
        path: /tmp/tidb.tar.gz
      register: tidb_pkg

    - name: Fail if package not found
      ansible.builtin.fail:
        msg: "Please copy tidb.tar.gz to /tmp/ first!"
      when: not tidb_pkg.stat.exists
```

重新运行Playbook。

遇到问题了，这次是解压时，出现了问题。我们逐条来修正。

Two thousand years have passed...
修正失败了，找了很久，找不到PD组件的安装，找不到资源。

我们先运行单机的TiDB（unistore模式）。

---

## 二、把 Zabbix 的数据库地址指向 TiDB

### （1）理解

我们之前的自动化创建失败了，但安装了一定的软件。现在变成单机了，我们重新创建了一个Playbook文件，叫 `deploy_zabbix_tidb.yml`。

Zabbix Server的数据库地址本来是指向MySQL的（一般是localhost），我们需要将他改为TiDB的地址和端口。

### （2）实验

创建 `deploy_zabbix_tidb.yml` 文件，写入下面的语句。

```yaml
---
- name: 重置并启动单机 TiDB
  hosts: tidb_servers
  become: yes
  tasks:
    - name: 停止现有 TiDB 进程
      shell: |
        ps -ef | grep '[t]idb-server' | awk '{print $2}' | xargs -r kill
      ignore_errors: yes

    - name: 清理 TiDB 数据目录
      file:
        path: /tmp/tidb_data
        state: absent

    - name: 清理 TiDB 日志文件
      file:
        path: /tmp/tidb.log
        state: absent

    - name: 创建新的 TiDB 数据目录
      file:
        path: /tmp/tidb_data
        state: directory
        owner: root
        group: root
        mode: '0755'

    - name: 启动 TiDB Server（单机模式）
      shell: |
        nohup /usr/local/tidb/bin/tidb-server \
          --store=unistore \
          --path=/tmp/tidb_data \
          --log-file=/tmp/tidb.log \
          > /dev/null 2>&1 &
      become: yes

    - name: 等待 TiDB 端口 4000 开放
      wait_for:
        port: 4000
        timeout: 30

- name: 部署 Zabbix 并切换到 TiDB
  hosts: zabbix_server
  become: yes
  vars:
    tidb_host: "192.168.86.174"
    tidb_port: "4000"
    tidb_user: "zabbix"
    tidb_password: "zabbix"
    zabbix_db: "zabbix"
    sql_file: "/usr/share/zabbix-sql-scripts/mysql/server.sql.gz"

  tasks:
    - name: 确保 mysql 客户端可用
      yum:
        name: mysql
        state: present

    - name: 重置 TiDB 中的 zabbix 数据库
      shell: |
        mysql -h {{ tidb_host }} -P {{ tidb_port }} -uroot -e "DROP DATABASE IF EXISTS {{ zabbix_db }}; CREATE DATABASE {{ zabbix_db }} CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;"

    - name: 解压官方 SQL 文件
      shell: |
        zcat {{ sql_file }} > /tmp/server_original.sql
      args:
        creates: /tmp/server_original.sql

    - name: 删除 TiDB 不支持的触发器定义
      shell: |
        sed -i '/DELIMITER \$\$/,/DELIMITER ;/d' /tmp/server_original.sql

    - name: 导入 SQL 到 TiDB（--force 跳过兼容性错误）
      shell: |
        mysql -h {{ tidb_host }} -P {{ tidb_port }} -uroot {{ zabbix_db }} --force < /tmp/server_original.sql
      register: import_result
      failed_when: false

    - name: 创建并授权 TiDB 中的 zabbix 用户
      shell: |
        mysql -h {{ tidb_host }} -P {{ tidb_port }} -uroot -e "CREATE USER IF NOT EXISTS '{{ tidb_user }}'@'%' IDENTIFIED BY '{{ tidb_password }}'; GRANT ALL PRIVILEGES ON {{ zabbix_db }}.* TO '{{ tidb_user }}'@'%'; FLUSH PRIVILEGES;"

    - name: 验证关键表和数据
      shell: |
        echo "--- dbversion ---"
        mysql -h {{ tidb_host }} -P {{ tidb_port }} -uroot -e "SELECT * FROM {{ zabbix_db }}.dbversion;"
        echo "--- users 前 5 行 ---"
        mysql -h {{ tidb_host }} -P {{ tidb_port }} -uroot -e "SELECT userid,username FROM {{ zabbix_db }}.users LIMIT 5;"
      register: verify_output
      changed_when: false

    - name: 显示验证结果
      debug:
        var: verify_output.stdout_lines

    - name: 修改 Zabbix Server 数据库配置
      lineinfile:
        path: /etc/zabbix/zabbix_server.conf
        regexp: "^{{ item.key }}="
        line: "{{ item.key }}={{ item.value }}"
      loop:
        - { key: "DBHost", value: "{{ tidb_host }}" }
        - { key: "DBPort", value: "{{ tidb_port }}" }
        - { key: "DBName", value: "{{ zabbix_db }}" }
        - { key: "DBUser", value: "{{ tidb_user }}" }
        - { key: "DBPassword", value: "{{ tidb_password }}" }

    - name: 更新 Zabbix Web 前端配置（/usr/share/zabbix/conf/zabbix.conf.php）
      copy:
        dest: /usr/share/zabbix/conf/zabbix.conf.php
        content: |
          <?php
          $DB['TYPE']     = 'MYSQL';
          $DB['SERVER']   = '{{ tidb_host }}';
          $DB['PORT']     = '{{ tidb_port }}';
          $DB['DATABASE'] = '{{ zabbix_db }}';
          $DB['USER']     = '{{ tidb_user }}';
          $DB['PASSWORD'] = '{{ tidb_password }}';
          $DB['SCHEMA']   = '';
          $DB['ENCRYPTION'] = false;
          $DB['KEY_FILE']   = '';
          $DB['CERT_FILE']  = '';
          $DB['CA_FILE']    = '';
          $DB['VERIFY_HOST'] = false;
          $DB['VAULT_URL'] = '';
          $DB['VAULT_DB_PATH'] = '';
          $DB['VAULT_TOKEN'] = '';
          $DB['DOUBLE_IEEE754'] = true;
          ?>
        owner: apache
        group: apache
        mode: '0640'

    - name: 同步更新 /etc/zabbix/web/zabbix.conf.php（保证一致性）
      copy:
        src: /usr/share/zabbix/conf/zabbix.conf.php
        dest: /etc/zabbix/web/zabbix.conf.php
        remote_src: yes
        owner: apache
        group: apache
        mode: '0640'

    - name: 重启 Zabbix Server 和 Apache
      systemd:
        name: "{{ item }}"
        state: restarted
        enabled: yes
      loop:
        - zabbix-server
        - httpd

    - name: 等待 Zabbix Server 完全启动
      wait_for:
        port: 10051
        timeout: 30

    - name: 显示 Zabbix Server 最新日志
      shell: tail -n 30 /var/log/zabbix/zabbix_server.log
      register: log_output
      changed_when: false

    - name: 输出日志
      debug:
        var: log_output.stdout_lines
```

保存退出后，运行Playbook。（能看得出，是很详细的一个部署文件）

![](4.png)
![](5.png)
![](6.png)

---

## 三、验证 TiDB 中的 zabbix 数据库

其实在上一步，我们的Playbook已经将数据库部署过了，我们在这里验证一下就好。

![](7.png)

我们看到TiDB（server3）里面是有zabbix库的，并且表结构和初始数据都没有什么问题。

---

## 四、测试 Zabbix 能否正常工作

我们在浏览器上打开server2上zabbix界面，是正常的。但浏览器不能直接显示出数据库的配置，我们来到命令行，来检查一下端口的指向和服务主机。

![](8.png)

> 今天先到这里啦，后面有PD组件后，再部署分布式吧😊