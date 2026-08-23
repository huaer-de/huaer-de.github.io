---
title: Ansible自动化学习
date: 2026-08-23 19:37:43
tags:
---

# Ansible自动化运维学习笔记

从8.13下午的某一分钟开始，我们开始学习自动化运维，似乎也是最后的一大节内容了。嗯......最近几天学习没有那么认真了，还是得调整一下qwq，哎。人生啊。。。。。。

我们从Ansible自动化开始学起。这篇笔记，我们一起走进Ansible。


## 一、Ansible环境搭建

### 1. 理解

Ansible是一个自动化工具，或者说，它是一个能指挥机器的"遥控器"。我们在自己的电脑上（控制机）写好命令或说明书（Playbook），Ansible就会自动地通过SSH帮我们做完命令。

初次听到这个说法，感觉和AI的智能体蛮像的。嗯...很小白的想法，两者毫无关系。对于AI，它有一个基本的能力，是有自己的"大脑"，完成任务时，会推理，同样的任务，最终会生成不一样的效果。甚至我们有时候说"听不懂话的'豆包'"，也是因为它会自己思考，能够自作主张。但是自动化只是"把重复的手工操作，变成固定代码去执行"，没有所谓的"智能"。

Ansible是确定性的运维。相关的同类工具还有SaltStack、Puppet，它依赖的技术有Python（编程语言）、SSH（网络协议）、YAML（配置文件格式），适合给服务器装软件、改配置、批量重启。

### 2. 实验环境准备

我新开了一个Rocky9的虚拟机，启动了`dnf update`后，启动菜单多核选择界面多了一个Rocky9.8的启动项。选择它，重新修改/boot/loader/entries/下面的配置文件，添加`net.ifnames=0`，禁止systemd使用可预测的网卡名，这样网卡的名字就规律地变成eth0，eth1......了（在这里还是浅浅有点后悔，最开始的Rocky9.6，应该给它的磁盘空间放的更大一点，毕竟，克隆后的新虚拟机，是不能调整最初的磁盘空间大小的）。

在这台虚拟机的基础上，克隆server1和server2，再添加CentOS7的server3。我们将通过server1的剧本，控制server2和server3。

来到server1，我们安装好Ansible，安装epel-release和ansible（因为Rocky9默认仓库中，没有ansible，我们先启用Extra Packages for Enterprise Linux源），并为server2和server3配置SSH免密登录，设置静态IP。

![](1.png)

![](2.png)

下面，我们要创建一个存放主机清单的目录，`mkdir -p ~/ansible_project/inventory`，编辑主机清单文件，存放web服务器。

```bash
[root@server1 ~]# mkdir -p ~/ansible_project
[root@server1 ~]# cd ~/ansible_project
[root@server1 ansible_project]# vim inventory
[root@server1 ansible_project]# cat inventory
# ~/ansible_project/inventory
[web_servers]
server2 ansible_host=192.168.86.132
node1 ansible_host=192.168.86.187
```

我们可以通过`ansible -i inventory all -m ping`，再测试一下连通性。

如果是第一次测试连通性，可能出现下面的警告。

![](3.png)

这是因为server1从未通过SSH连接过node1，系统无法确认它的身份，我们先连接一下node1，或者在ansible.cfg中设置`host_key_checking = False`，都可以解决这个问题。

我们在此连接，返回pong，成功连通。


## 二、Playbook部署Apache

### 1. 理解

我们将通过编写一个Ansible Playbook，在server2和node1上安装并启动Apache HTTP服务。我们先了解Playbook的基础结构。

Playbook有四个核心组成部分：

- **目标主机（hosts）**：指定在哪些主机上执行任务
- **任务列表（tasks）**：实际执行的操作序列
- **处理器（handlers）**：在任务触发时执行的特殊操作（如重启服务）
- **变量（vars）**：可复用的配置参数

Playbook采用YAML格式，核心语法要点：

- 文件以`---`（三个短横线）开头
- 缩进使用空格（推荐2个空格），不能混用Tab
- 列表项以`-`加空格开头
- 键值对以`:`加空格分隔

### 2. 实验

在ansible_project下创建`apache.yml`文件。

```yaml
---
- name: 部署Apache Web服务器
  hosts: web_servers
  become: yes
  vars:
    http_port: 80
    server_admin: admin@example.com

  tasks:
    - name: 安装httpd包
      yum:
        name: httpd
        state: present

    - name: 确保firewalld服务已启动
      service:
        name: firewalld
        state: started
        enabled: yes
      when: ansible_facts['os_family'] == "RedHat"

    - name: 复制自定义首页
      copy:
        content: |
          <h1>Welcome to {{ ansible_hostname }}</h1>
          <p>This server is managed by Ansible.</p>
          <p>Server IP: {{ ansible_default_ipv4.address }}</p>
        dest: /var/www/html/index.html
        owner: root
        group: root
        mode: '0644'

    - name: 启动并启用httpd服务
      service:
        name: httpd
        state: started
        enabled: yes

    - name: 配置防火墙允许HTTP访问
      firewalld:
        service: http
        permanent: yes
        state: enabled
        immediate: yes
      when: ansible_facts['os_family'] == "RedHat"
```

接着，我们可以通过`ansible-playbook -i inventory apache.yml --syntax-check`检查一下语法，没问题的话，就开始运行吧。下面的截图是第二次运行剧本的效果啦。

![](4.png)

这里执行剧本结束，发现所有的任务都是绿色ok状态，而不是changed，这是Ansible的幂等性在起作用。执行剧本前，先检查一下当前的系统状态，如果已经符合期望状态，就不会重复执行不必要的操作。

如果害怕运行出错，我们可以在运行命令中加上`-C`来模拟执行。我们在虚拟机中，害怕出错的话，其实多加快照比较方便。

我们验证一下部署的结果。

![](5.png)

部署成功啦，好耶。


## 三、Playbook中的变量与事实

### 1. 理解

Ansible中有很多变量，它们组成了一个变量系统，包括内置Facts变量、自定义变量以及不同作用域的变量使用。

常见的Facts变量如下：

| Facts变量 | 说明 | 示例值 |
|-----------|------|--------|
| ansible_hostname | 主机名 | server2 |
| ansible_fqdn | 完整域名 | server2.example.com |
| ansible_default_ipv4.address | 默认网卡的IP地址 | 192.168.86.132 |
| ansible_os_family | 操作系统家族 | RedHat |
| ansible_distribution | 发行版名称 | Rocky |
| ansible_distribution_version | 发行版版本 | 9.0 |
| ansible_processor_vcpus | CPU核心数 | 2 |
| ansible_memtotal_mb | 总内存(MB) | 4096 |
| ansible_memory_mb.real.free | 可用内存(MB) | 2048 |
| ansible_architecture | 系统架构 | x86_64 |

这个小节，我们将通过一个实际场景来学习Ansible中的变量：为每台Web服务器配置个性化的配置文件。

### 2. 实验

Ansible在执行Playbook时会自动收集受控节点的系统信息，这些信息称为Facts。我们可以使用setup模块来查看所有Facts：

```bash
# 在 server1 (192.168.86.131) 的 ~/ansible_project 目录下执行
# 查看server2的所有Facts信息
ansible -i inventory server2 -m setup

# 过滤查看特定信息
ansible -i inventory server2 -m setup -a "filter=ansible_memory_mb"
ansible -i inventory server2 -m setup -a "filter=ansible_processor"
ansible -i inventory server2 -m setup -a "filter=ansible_default_ipv4"
```

执行完第一条语句，下面会出现好多的信息，查看信息时，过滤会方便一点。

创建一个`facts_demo.yml`，写入下面的内容：

```yaml
---
- name: 演示Facts变量的使用
  hosts: web_servers
  become: yes
  gather_facts: yes

  tasks:
    - name: 创建包含系统信息的文件
      copy:
        content: |
          # 系统信息报告
          主机名: {{ ansible_hostname }}
          操作系统: {{ ansible_distribution }} {{ ansible_distribution_version }}
          内核版本: {{ ansible_kernel }}
          CPU核心数: {{ ansible_processor_vcpus }}
          总内存: {{ ansible_memtotal_mb }} MB
          可用内存: {{ ansible_memory_mb.real.free }} MB
          IP地址: {{ ansible_default_ipv4.address }}
        dest: /tmp/system_info.txt
        owner: root
        group: root
        mode: '0644'

    - name: 根据操作系统安装不同包
      package:
        name:
          - net-tools
          - vim-enhanced
        state: present
      when: ansible_os_family == "RedHat"

    - name: 根据内存大小调整swappiness
      sysctl:
        name: vm.swappiness
        value: "{{ (ansible_memtotal_mb / 1024) < 4 | int and 10 or 30 }}"
        state: present
        reload: yes
```

简单理解一下这条剧本。

`gather_facts: yes`表示显式开启Facts收集（默认就是yes），第一个任务使用copy模块的content参数创建文件，其中大量使用了Facts变量；

第二个任务使用package模块（通用包管理模块，自动适配不同发行版），条件判断`when: ansible_os_family == "RedHat"`确保只在RedHat系列系统执行；

第三个任务使用sysctl模块调整内核参数，使用了条件表达式根据内存大小设置不同值。

执行剧本，验证一下效果，发现/tmp/system_info.txt文件里写入了很多变量信息。

![](6.png)

下面，我们试试自定义变量。

**第一种方式，我们可以直接在Playbook中定义变量vars。** 演示一个示例吧。

先创建一个使用自定义变量的Playbook `custom_vars.yml`，写入下面内容：

```yaml
---
- name: 演示自定义变量
  hosts: web_servers
  become: yes
  vars:
    app_name: myapp
    app_port: 8080
    app_user: appuser
    app_directory: /opt/{{ app_name }}

  tasks:
    - name: 创建应用程序用户
      user:
        name: "{{ app_user }}"
        state: present
        system: yes
        create_home: no

    - name: 创建应用程序目录
      file:
        path: "{{ app_directory }}"
        state: directory
        owner: "{{ app_user }}"
        group: "{{ app_user }}"
        mode: '0755'

    - name: 创建应用配置文件
      copy:
        content: |
          APP_NAME={{ app_name }}
          APP_PORT={{ app_port }}
          APP_USER={{ app_user }}
        dest: "{{ app_directory }}/app.conf"
        owner: "{{ app_user }}"
        group: "{{ app_user }}"
        mode: '0644'
```

运行结果是正常的。

![](7.png)

**第二种方式，我们可以在inventory文件中定义主机变量和组变量。** 修改inventory文件，添加变量，效果如下。

```ini
[web_servers]
server2 ansible_host=192.168.86.132 http_port=8080 server_role=backend
node1 ansible_host=192.168.86.187 http_port=8000 server_role=backend

[web_servers:vars]
ntp_server=pool.ntp.org
timezone=Asia/Shanghai

[all:vars]
ansible_user=root
```

**第三种方式，我们可以使用独立的变量文件。**

比如我们可以创建一个`vars`目录，里面写入`common.yml`变量文件：

```yaml
---
# 公共变量 - 所有环境共享
app_name: myapp
app_user: appuser
log_level: info
timezone: Asia/Shanghai

# 默认端口配置
default_http_port: 80
default_https_port: 443

# 日志配置
log_retention_days: 30
log_rotation_size: 100M

# 备份配置
backup_enabled: true
backup_path: /backup
```

再创建使用变量文件的Playbook `use_vars_file.yml`，写入：

```yaml
---
- name: 使用外部变量文件
  hosts: web_servers
  become: yes
  vars_files:
    - vars/common.yml
  vars:
    # Playbook中定义的变量会覆盖vars_files中的同名变量
    log_level: debug

  tasks:
    - name: 显示变量值（调试用）
      debug:
        msg: |
          app_name: {{ app_name }}
          app_user: {{ app_user }}
          log_level: {{ log_level }}
          http_port: {{ http_port | default('未定义') }}
          server_role: {{ server_role | default('未定义') }}

    - name: 创建应用用户
      user:
        name: "{{ app_user }}"
        state: present
```

执行剧本后，成功创建了应用用户。

![](8.png)

三种方式就讲完啦。

**我们可以使用register注册任务输出。** 有时我们需要获取任务的执行结果，register关键字可以将任务输出保存到变量中。

```yaml
---
- name: 演示register用法
  hosts: web_servers
  become: yes

  tasks:
    - name: 检查是否已安装httpd
      package:
        name: httpd
        state: present
      register: httpd_install_result

    - name: 显示安装结果
      debug:
        msg: "httpd安装状态: {{ httpd_install_result.changed }}"

    - name: 获取系统日期
      command: date +%Y-%m-%d
      register: current_date
      changed_when: false

    - name: 创建带日期的文件
      copy:
        content: "报告生成日期: {{ current_date.stdout }}"
        dest: /tmp/report_{{ current_date.stdout }}.txt
```

在这个剧本里，有几个关键词可以注意一下。

| 关键字/属性 | 说明 |
|-------------|------|
| register | 将任务输出保存到变量 |
| .changed | 任务是否改变了系统状态 |
| .stdout | 命令的标准输出 |
| .stderr | 命令的错误输出 |
| .rc | 命令的返回码 |
| changed_when: false | 标记该任务不会改变系统状态 |

现在我们将综合运用所学知识，创建一个更完善的网站部署Playbook吧。


## 四、使用Jinja2模板管理配置文件

### 1. 理解

本实验的目标是学习使用template模块和Jinja2模板语言，实现配置文件的动态生成。我们将为每台服务器生成个性化的Apache虚拟主机配置文件。

我们先了解一下template模块和Jinja2语言。

Templates模板是一个文本文件，嵌套有脚本（使用模板编程语言编写）。Jinja2是python的一种模板语言，以Django的模板语言为原本。Jinja2模板包含着变量和逻辑控制语句，Ansible在执行时会将其渲染为最终的配置文件。

这些模板文件有一些约定：文件通常放在`templates/`目录下，文件扩展名通常为`.j2`，使用`{{ variable }}`引用变量，使用`{% statement %}`执行控制语句（if、for等）。我们从实验中，深入学习一下。

### 2. 实验

创建templates文件夹，写入`site_index.j2`文件。

```jinja2
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ site_title | default('我的网站') }}</title>
    <style>
        body {
            font-family: "Microsoft YaHei", sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .card {
            background: white;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #333; }
        .info { color: #666; font-size: 14px; }
        .highlight { color: #e74c3c; font-weight: bold; }
    </style>
</head>
<body>
    <div class="card">
        <h1>🎯 {{ site_title | default('我的网站') }}</h1>
        <hr>
        <h3>📋 服务器信息</h3>
        <ul>
            <li><strong>主机名:</strong> {{ ansible_hostname }}</li>
            <li><strong>IP地址:</strong> {{ ansible_default_ipv4.address }}</li>
            <li><strong>操作系统:</strong> {{ ansible_distribution }} {{ ansible_distribution_version }}</li>
            <li><strong>CPU核心:</strong> {{ ansible_processor_vcpus }}</li>
            <li><strong>总内存:</strong> {{ ansible_memtotal_mb }} MB</li>
            <li><strong>运行时间:</strong> {{ ansible_uptime_seconds }}</li>
            <li><strong>当前时间:</strong> {{ ansible_date_time.iso8601 }}</li>
        </ul>
        <hr>
        <p class="info">由 Ansible 自动部署 | 维护: {{ site_owner | default('未知') }}</p>
    </div>
</body>
</html>
```

这个模板文件是用来创建网页首页的，保存后模板就建成了。

继续创建第二个模板，Apache虚拟主机配置。在`templates/virtualhost.conf.j2`写入下面内容。

```yaml
---
- name: 使用Jinja2模板部署网站
  hosts: web_servers
  become: yes
  gather_facts: yes

  vars:
    site_title: "Ansible演示站"  # 直接赋值，不加 {{ }}
    site_owner: "运维团队"
    http_port: 80
    server_admin: "admin@example.com"

  tasks:
    - name: 确保httpd已安装
      package:
        name: httpd
        state: present

    - name: 创建网站根目录
      file:
        path: "/var/www/html/{{ site_title | lower | replace(' ', '_') }}"
        state: directory
        owner: apache
        group: apache
        mode: '0755'

    - name: 使用模板生成首页
      template:
        src: site_index.j2
        dest: /var/www/html/index.html
        owner: apache
        group: apache
        mode: '0644'

    - name: 确保httpd已启动
      service:
        name: httpd
        state: started
        enabled: yes

    - name: 显示部署结果
      debug:
        msg: |
          网站部署完成！
          访问地址: http://{{ ansible_default_ipv4.address }}:{{ http_port }}
          网站标题: {{ site_title }}

  handlers:
    - name: restart_httpd
      service:
        name: httpd
        state: restarted
```

![](9.png)

剧本没有问题，模板调取成功啦。我们访问网页看看效果吧。

![](10.png)

虽然界面丑丑的，但确实通过模板自动化部署成功啦，好耶。


## 五、构建高可用集群

### 1. 理解

听到"集群"，实验好像突然就变难了。但我们是用Ansible剧本来跑的，所以最主要的还是要搭建好剧本。

这次实验的目标是使用Ansible在server2和node1上部署Keepalived，实现VIP（Virtual IP）的高可用。当主节点（MASTER）发生故障时，备用节点（BACKUP）会自动接管VIP，确保服务不中断。

实验中，server2是MASTER节点，node1是BACKUP节点，集群对外提供服务的虚拟IP（VIP）是192.168.86.200。

实验开始。

### 2. 实验

我们在server1上创建实验目录和角色目录。

```bash
cd ~/ansible_project
mkdir -p roles/keepalived/{tasks,templates,handlers,vars,defaults}
```

其中，`tasks/`：存放任务定义文件，`templates/`：存放Jinja2模板文件，`handlers/`：存放处理器（触发器）定义，`vars/`：存放变量定义，`defaults/`：存放默认变量（优先级最低）。

接着，我们重新配置主机变量。修改inventory文件如下。

```ini
[web_servers]
server2 ansible_host=192.168.86.132
node1 ansible_host=192.168.86.187

[ha_cluster]
server2 ansible_host=192.168.86.132 keepalived_state=MASTER keepalived_priority=150
node1 ansible_host=192.168.86.187 keepalived_state=BACKUP keepalived_priority=100

[ha_cluster:vars]
vip_address=192.168.86.200
vip_cidr=24
virtual_router_id=51
vrrp_interface=eth0
vrrp_auth_pass=AnsibleHA2024
```

接着，编写Keepalived配置模板。在`roles/keepalived/templates/keepalived.conf.j2`创建Jinja2模板文件，内容如下。

```jinja2
# {{ ansible_managed | default('Ansible managed') }}
# 节点: {{ inventory_hostname }} ({{ ansible_default_ipv4.address }})
# 角色: {{ keepalived_state }}
# 优先级: {{ keepalived_priority }}

global_defs {
    router_id {{ inventory_hostname }}
    # 启用日志记录
    enable_script_security
}

# VRRP实例配置
vrrp_instance VI_{{ virtual_router_id }} {
    state {{ keepalived_state }}
    interface {{ vrrp_interface }}
    virtual_router_id {{ virtual_router_id }}
    priority {{ keepalived_priority }}
    advert_int 1

    # 认证配置
    authentication {
        auth_type PASS
        auth_pass {{ vrrp_auth_pass }}
    }

    # 虚拟IP地址
    virtual_ipaddress {
        {{ vip_address }}/{{ vip_cidr }}
    }

    # 高优先级节点不抢占（防止网络抖动导致频繁切换）
    nopreempt

    # 追踪脚本（用于健康检查）
    track_script {
        chk_service
    }
}

# 健康检查脚本：检查httpd服务是否运行
vrrp_script chk_service {
    script "/usr/bin/pgrep httpd"
    interval 2
    fall 3
    rise 2
}

# 通知脚本（状态变更时执行）
vrrp_instance VI_{{ virtual_router_id }} {
    # 状态变为MASTER时执行
    notify_master "/etc/keepalived/notify.sh MASTER {{ vip_address }}"
    # 状态变为BACKUP时执行
    notify_backup "/etc/keepalived/notify.sh BACKUP {{ vip_address }}"
    # 状态变为FAULT时执行
    notify_fault "/etc/keepalived/notify.sh FAULT {{ vip_address }}"
}
```

接着，创建通知脚本`roles/keepalived/files/notify.sh`，写入：

```bash
#!/bin/bash
# Keepalived状态变更通知脚本
# 用法: notify.sh <STATE> <VIP>

STATE=$1
VIP=$2
LOG_FILE="/var/log/keepalived-notify.log"

echo "$(date '+%Y-%m-%d %H:%M:%S') - 节点: $(hostname) - 状态变更: $STATE - VIP: $VIP" >> $LOG_FILE

case $STATE in
    MASTER)
        echo "$(date '+%Y-%m-%d %H:%M:%S') - 成为MASTER，VIP已绑定" >> $LOG_FILE
        ;;
    BACKUP)
        echo "$(date '+%Y-%m-%d %H:%M:%S') - 成为BACKUP，VIP已释放" >> $LOG_FILE
        ;;
    FAULT)
        echo "$(date '+%Y-%m-%d %H:%M:%S') - 进入FAULT状态，请检查服务" >> $LOG_FILE
        ;;
esac

exit 0
```

通过`chmod +x roles/keepalived/files/notify.sh`给它赋予执行权限。

接着，编写Tasks任务。创建主任务文件`roles/keepalived/tasks/main.yml`，写入下面内容。

```yaml
---
- name: 导入各子任务
  import_tasks: install.yml
  import_tasks: configure.yml
  import_tasks: service.yml
```

创建安装任务 `roles/keepalived/tasks/install.yml`，写入：

```yaml
---
- name: 安装keepalived软件包
  package:
    name: keepalived
    state: present

- name: 创建keepalived配置目录
  file:
    path: /etc/keepalived
    state: directory
    owner: root
    group: root
    mode: '0755'

- name: 部署通知脚本
  copy:
    src: notify.sh
    dest: /etc/keepalived/notify.sh
    owner: root
    group: root
    mode: '0755'
```

创建配置任务 `roles/keepalived/tasks/configure.yml`，写入：

```yaml
---
- name: 生成keepalived主配置文件
  template:
    src: keepalived.conf.j2
    dest: /etc/keepalived/keepalived.conf
    owner: root
    group: root
    mode: '0644'
  notify: restart_keepalived
```

创建服务管理任务 `roles/keepalived/tasks/service.yml`，写入：

```yaml
---
- name: 启动并启用keepalived服务
  service:
    name: keepalived
    state: started
    enabled: yes

- name: 验证keepalived服务状态
  service:
    name: keepalived
    state: started
  register: keepalived_status
  failed_when: false

- name: 显示服务状态
  debug:
    msg: "keepalived服务状态: {{ keepalived_status.status.ActiveState }}"
```

编写Handlers处理器`roles/keepalived/handlers/main.yml`。

```yaml
---
- name: restart_keepalived
  service:
    name: keepalived
    state: restarted
```

然后，终于到编写剧本了。我们编写主Playbook，创建 `~/ansible_project/ha_deploy.yml`，写入下面内容。

```yaml
---
- name: 部署Keepalived高可用集群
  hosts: ha_cluster
  become: yes
  gather_facts: yes

  roles:
    - keepalived

- name: 验证VIP分配情况
  hosts: ha_cluster
  become: yes
  gather_facts: no

  tasks:
    - name: 检查VIP是否绑定
      debug:
        msg: "VIP {{ vip_address }} 当前绑定在 {{ ansible_hostname }} ({{ ansible_default_ipv4.address }})"
      when: vip_address in ansible_default_ipv4.address
```

检查语法后，执行剧本。发现没有问题。


## 六、部署HAProxy负载均衡器

### 1. 理解

实验的目标是在 server1（控制节点，也作为调度器）上部署 HAProxy，将后端的 web_servers（server2 和 node1）的 HTTP 服务通过负载均衡对外提供访问。我们将使用 Jinja2 模板动态生成后端服务器列表，实现弹性扩容——只需在 inventory 中添加新主机，无需修改模板。

我们可以将 HAProxy 部署在 server1 上，也可以单独使用 VIP（如 192.168.86.200）结合 Keepalived 实现 HAProxy 的高可用，但本实验简化为单节点 HAProxy。

### 2. 实验

**环境规划**

| 角色 | 主机 | IP | 说明 |
|------|------|-----|------|
| 调度器 | server1 | 192.168.86.131 | 安装 HAProxy，对外提供服务 |
| Web后端1 | server2 | 192.168.86.132 | 运行 httpd，端口 80 |
| Web后端2 | node1 | 192.168.86.187 | 运行 httpd，端口 80 |

**步骤1：创建 HAProxy 角色目录**

在 server1 (192.168.86.131) 上执行：

```bash
cd ~/ansible_project
mkdir -p roles/haproxy/{tasks,templates,handlers,vars,defaults}
```

**步骤2：编写 HAProxy 配置模板**

创建 `roles/haproxy/templates/haproxy.cfg.j2`：

```jinja2
# {{ ansible_managed | default('Ansible managed') }}
# 生成时间: {{ ansible_date_time.iso8601 }}
# 调度器: {{ ansible_hostname }} ({{ ansible_default_ipv4.address }})

global
    log         127.0.0.1 local2
    chroot      /var/lib/haproxy
    pidfile     /var/run/haproxy.pid
    maxconn     4000
    user        haproxy
    group       haproxy
    daemon
    stats socket /var/lib/haproxy/stats

defaults
    mode                    http
    log                     global
    option                  httplog
    option                  dontlognull
    option http-server-close
    option forwardfor       except 127.0.0.0/8
    option                  redispatch
    retries                 3
    timeout http-request    10s
    timeout queue           1m
    timeout connect         10s
    timeout client          1m
    timeout server          1m
    timeout http-keep-alive 10s
    timeout check           10s
    maxconn                 3000

# 统计页面（可选）
listen stats
    bind *:{{ haproxy_stats_port | default(8080) }}
    stats enable
    stats uri /stats
    stats realm HAProxy\ Statistics
    stats auth {{ haproxy_stats_user | default('admin') }}:{{ haproxy_stats_password | default('password') }}

# 前端：接收客户端请求
frontend http_front
    bind *:{{ haproxy_http_port | default(80) }}
    default_backend http_back

# 后端：Web服务器集群
backend http_back
    balance {{ haproxy_balance | default('roundrobin') }}
    option httpchk GET /index.html HTTP/1.0
    option forwardfor
    http-request set-header X-Forwarded-Port %[dst_port]

    # 动态生成后端服务器列表
    {% for host in groups['web_servers'] %}
    server {{ hostvars[host].ansible_hostname }} {{ hostvars[host].ansible_default_ipv4.address }}:{{ hostvars[host].http_port | default(80) }} check inter 2000 rise 2 fall 3
    {% endfor %}
```

**步骤3：编写 Tasks**

创建主任务文件 `roles/haproxy/tasks/main.yml`：

```yaml
---
- import_tasks: install.yml
- import_tasks: configure.yml
- import_tasks: service.yml
```

安装任务 `roles/haproxy/tasks/install.yml`：

```yaml
---
- name: 安装HAProxy软件包
  package:
    name: haproxy
    state: present

- name: 安装rsyslog（用于日志）
  package:
    name: rsyslog
    state: present
  when: ansible_os_family == "RedHat"
```

配置任务 `roles/haproxy/tasks/configure.yml`：

```yaml
---
- name: 生成HAProxy配置文件
  template:
    src: haproxy.cfg.j2
    dest: /etc/haproxy/haproxy.cfg
    owner: root
    group: root
    mode: '0644'
  notify: restart_haproxy

- name: 配置rsyslog记录HAProxy日志
  copy:
    content: |
      # HAProxy日志配置
      $ModLoad imudp
      $UDPServerRun 514
      local2.*    /var/log/haproxy.log
    dest: /etc/rsyslog.d/haproxy.conf
  notify: restart_rsyslog
```

服务管理任务 `roles/haproxy/tasks/service.yml`：

```yaml
---
- name: 启动并启用HAProxy服务
  service:
    name: haproxy
    state: started
    enabled: yes

- name: 确保防火墙允许HTTP访问
  firewalld:
    service: http
    permanent: yes
    state: enabled
    immediate: yes
  when: ansible_os_family == "RedHat"

- name: 检查HAProxy状态
  service:
    name: haproxy
    state: started
  register: haproxy_status
  failed_when: false

- name: 显示HAProxy状态
  debug:
    msg: "HAProxy服务状态: {{ haproxy_status.status.ActiveState }}"
```

**步骤4：编写 Handlers**

创建 `roles/haproxy/handlers/main.yml`：

```yaml
---
- name: restart_haproxy
  service:
    name: haproxy
    state: restarted

- name: restart_rsyslog
  service:
    name: rsyslog
    state: restarted
```

**步骤5：编写主 Playbook**

创建 `~/ansible_project/haproxy_deploy.yml`：

```yaml
---
- name: 部署HAProxy负载均衡器
  hosts: server1
  become: yes
  gather_facts: yes

  roles:
    - haproxy

- name: 验证负载均衡效果
  hosts: localhost
  connection: local
  gather_facts: no

  vars:
    haproxy_host: "192.168.86.131"
    haproxy_port: "{{ haproxy_http_port | default(80) }}"

  tasks:
    - name: 发送测试请求到HAProxy
      uri:
        url: "http://{{ haproxy_host }}:{{ haproxy_port }}/"
        return_content: yes
      register: response

    - name: 显示负载均衡响应
      debug:
        msg: |
          负载均衡测试成功！
          响应内容摘要: {{ response.content | regex_replace('\n', ' ') | truncate(200) }}
          来源服务器: {{ response.server }}
```

**步骤6：关于后端端口配置**

如果需要为每个后端指定不同的端口，可以在 inventory 中添加 http_port 变量。例如，让 server2 使用 80，node1 使用 8080：

```ini
[web_servers]
server2 ansible_host=192.168.86.132 http_port=80
node1 ansible_host=192.168.86.187 http_port=8080
```

由于我们之前的 Apache 部署都使用默认 80 端口，这里可以不添加 http_port，模板会使用默认值 80。

**步骤7：执行Playbook**

```bash
ansible-playbook -i inventory haproxy_deploy.yml --syntax-check
ansible-playbook -i inventory haproxy_deploy.yml
```

发现没有报错。

**步骤8：验证负载均衡**

从浏览器访问 `http://192.168.86.131:8080/stats`（默认用户名 admin / 密码 password），可以看到后端服务器的实时状态。

多次访问 HAProxy 前端，通过以下命令查看轮询效果：

```bash
for i in {1..6}; do curl -s http://192.168.86.131/ | grep -E "(主机名|IP地址)"; done
```

我们看到请求在 server2 和 node1 之间轮询分配。

**步骤9：验证故障转移**

如果我们停止其中一台后端服务器的 httpd 服务：

```bash
ansible -i inventory server2 -m service -a "name=httpd state=stopped"
```

再次访问 HAProxy，所有请求会自动路由到仍然在线的 node1。恢复 server2 的 httpd 后，它会自动重新加入后端池。


## 总结

好耶，至此Ansible的笔记就写完了！从环境搭建到Playbook编写，从变量使用到模板渲染，再到高可用集群和负载均衡的部署，也算是把Ansible的核心功能都过了一遍。

虽然中间有几天学习不太认真（挠头），但笔记还是坚持整理完了。希望后面复习的时候能派上用场吧。

人生啊......继续加油吧！

虽然但是，马上就开学了捏...