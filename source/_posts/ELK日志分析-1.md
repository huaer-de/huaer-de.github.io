---
title: ELK日志分析-1
date: 2026-08-16 21:40:22
tags: [Linux, CentOS, 运维, ELK日志分析]
categories: 大二集训
---

<!-- # 8.10 笔记：ELK 日志分析 -->

# ELK日志分析

<!-- 这次笔记是8/10的， -->
这次笔记，我们来学习 **ELK日志分析**。
ELK是一款开源的有关日志分析的技术栈，由三款核心软件Elasticsearch，Logstash和Kibana组成。现在行业经常会再加上Filebeat（轻量日志采集器），四款软件合称ELFK。

---

## 一、Elasticsearch

### （1）理解
ELK中，E就是Elasticsearch（ES）。这是一个分布式搜索引擎、日志存储引擎。负责存放所有日志，提供快速全文检索、聚合统计功能，同时支持集群扩容。

ES中，只有单机是容易丢数据的，搭建一个集群比较好。在本次实验中，我们将在server1，server2，server3上搭建集群，有1个用来管理集群的master，和2个存放日志数据的data。因为我们在模拟实验，用到的机子数量很少，只有三台，我们把这三台都开放master+data，可以同时实现高可用。集群庞大时不建议，太费钱。

ES本身没有网页，我们在server4安装Cerebro工具，使在网页上能直接查看三台节点的内存、磁盘、分片状态。

### （2）实验

**1. 集群部署**
	实验开始，首先，我们要新开三台Centos7虚拟机，完成IP静态配置，域名解析。后续我们会用到scp传输，建议打开免密。

![](1.png)

在server1上安装ES rpm包，就正常地监控系统修改核心配置，修改文件句柄、进程限制limits.conf。

![](2.png)

具体的，核心配置 `elasticsearch.yml` 里，部分语句的含义如下。

```yaml
# 1.集群名称，三台机器必须一字不差！
cluster.name: my-es
# 作用：只有集群名相同的机器，才会自动合并成一个集群；名字不一样会分成两个独立集群

# 2.数据、日志存放路径（rpm安装自动生成，保留默认即可）
path.data: /var/lib/elasticsearch
path.logs: /var/log/elasticsearch
# 作用：指定数据和日志存在哪里，不能删，删了找不到数据

# 3.锁定内存，禁止swap交换分区
bootstrap.memory_lock: true
# 重点解释：swap是硬盘虚拟内存，速度极慢。ES靠内存做搜索缓存，一旦使用swap，查询直接卡死崩溃。这行强制不让ES用swap。

# 4.网络监听地址
network.host: 0.0.0.0
# 默认是127.0.0.1，只能本机访问；0.0.0.0代表允许局域网内所有其他机器、浏览器访问ES端口9200
# 不写0.0.0.0：外部电脑、cerebro、另外两台server无法连接这台ES

# 5.对外访问端口
http.port: 9200
# ES对外网页/API访问固定端口，默认9200，不用修改

# 6.集群发现列表（告诉本机：去找这三台机器组队集群）
discovery.seed_hosts: ["server1","server2","server3"]
# 依靠前面/etc/hosts的主机名解析，自动ping这三台机器，互相建立连接

# 7.初始化集群时，有资格竞选master主节点的机器列表
cluster.initial_master_nodes: ["server1","server2","server3"]
# 集群第一次启动必须写！作用：三台机器都能当集群管理者。
# 三台机器同时启动时，自动投票选出一台作为active master，另外两台备用；一台宕机，剩下两台重新投票出新master，集群不会瘫痪。
```

下面我们优化系统内核，系统权限。

首先调整资源限制。我们在 `/etc/security/limits.conf` 里，文件末尾追加四行语句（开放内存锁定权限，提升文件上限，放大进程限制数）。在systemd服务里开启内存锁定（`[service]` 段添加 `LimitMEMLOCK=infinity`），然后重载systemd配置。关闭swap交换分区，取消swap挂载。

![](3.png)

此时，server1的配置已经调好了。

![](4.png)

我们把server1相关的文件包，配置文件传给server2和server3。

![](5.png)

在server2和server3上安装好软件，关闭swap分区。

![](6.png)

我们可以通过 `curl http://192.168.86.161:9200/_cat/nodes?v` 验证他们是否变成一个群组。

![](7.png)

**2. cerebro部署**
	创建一个docker镜像加速配置文件，写入国内镜像源内容，启动docker服务，拉取cerebro镜像。

![](8.png)

然后就可以浏览器访问。在Node address可以填任意ES的节点IP，但要注意格式 `http://192.168.x.x:9200`。

![](9.png)

**3. elasticsearch集群角色分类**

EL中有三种常见角色，作用如下：

| 角色 | 作用 |
|:---|:---|
| master | 负责集群管理，比如节点上下线、分片分配、选举主节点 |
| data | 负责存储数据分片，处理写入、查询、聚合等数据操作 |
| ingest | 负责数据预处理，比如对数据进行解析、转换、 enrichment 等 |

实验的三台是管理节点，也是数据节点；但它不承担 ingest 数据预处理任务。我们修改配置文件里，EL的角色。

![](10.png)

这样，我们的节点就部署好了。

---

## 二、Logstash

### （1）理解
ELK中，L是指Logstash，一个日志管道处理工具，或者称之为日志中转站。它的工作过程是：接收原始日志 → 清洗、过滤、格式化、转换字段 → 转发给 ES。

![](11.png)

我们刚刚在server1，server2，server3上搭好了集群，下面，我们再加上两台虚拟机server4和server5。

我们在server5上安装Logstash 数据采集服务，server4上部署elasticsearch-head网页可视化工具（替代cerebro查看ES索引）。

### （2）实验

**1. Logstash部署**
	进入server5，安装jdk和logstash安装包（Logstash 是 Java 开发程序，需要JDK环境）。可以用最简管道命令测试一下。

进入logstash管道配置目录，新建管道配置文件 `test.conf`，写入采集规则，然后就可以加载配置文件启动Logstash啦。

![](12.png)

在这里，我们 `test.conf` 文件的具体内容及含义如下。

```ruby
# input 数据输入段：定义数据从哪里来
input {
  stdin {}  # 数据源：键盘手动输入文字
}

# output 数据输出段：定义数据发送到哪，可以同时多个输出
output {
  stdout {}  # 输出1：打印到server4控制台，方便实时看采集效果
  elasticsearch {  # 输出2：把数据存入ES集群
    hosts => "192.168.86.161:9200"  # ES集群任意节点IP端口，三台ES写任意一台都能存入集群
    index => "logstash-%{+YYYY.MM.dd}"  # 自动按日期生成ES索引（数据表），每天一个索引
  }
}
```

等待日志打印 `Successfully started`，就代表管道就绪，可以写入数据了（虽然我的没有，但它等着我的输入，也是配成功了的）。

![](13.png)

Web上查看，也能发现有新的2个日志内容。

![](14.png)

**2. elasticsearch-head插件**
	下面我们在server4上安装插件。需要先安装phantomjs依赖，这是head页面渲染的依赖。

![](15.png)

	我们能够进入phantomjs程序交互界面了，说明依赖安装成功。

还要安装nodejs环境，因为head是前端Vue项目，需要node启动web服务。我么修改head源码配置，绑定ES集群的IP。

![](16.png)

![](17.png)

	接着我们通过 `npm run start &` 在后台启动head网页服务。

回到EL节点，在 `/etc/elasticsearch/elasticsearch.yml` 末尾加上“开启ES跨域访问功能”，和“允许所有IP、网页域名访问ES9200端口”，开启跨域允许。

![](18.png)

重启服务后，我们就可以浏览器访问head页面了。

![](19.png)

**3. File文件输入插件**

回到server5，采集服务器系统日志 `/var/log/messages` 这里，修改 `test.conf` 文件，再次启动logstash。我们把文件修改为：

```ruby
# input段：数据源改为服务器系统日志文件
input {
  file {
    path => "/var/log/messages"  # 采集目标：CentOS/Rocky系统全局系统日志文件，系统所有报错、服务日志都存在这里
    start_position => "beginning" # 启动logstash时，从文件最开头读取全部日志（仅首次生效）
  }
}

output {
  stdout {}
  elasticsearch {
    hosts => "192.168.86.161:9200"
    index => "syslog-%{+YYYY.MM.dd}" # 系统日志单独日期索引，区分手动输入日志
  }
}
```

我们在server后端这里，一直在打印着 `/var/log/messages` 内的系统日志，去Web里看了一下，ES生成了新的索引 `syslog-2026.8.12`，每条日志都有 `path:"/var/log/messages"`、`host:"server5"`。

logstash用 `file` 插件读日志文件（比如 `/var/log/messages`）。下面，为了防重复，避免数据冗余读取，我们可以找到上次读取文件的偏移量，删去之前的文件。

![](20.png)

我们看到 `/var/log/messages` 的文件，数字35143714是inode编号（日志文件的id），路径是对应sincedb文件内的记录。通过 `l.` 查看隐藏文件，我们可以把sincedb文件强制删除。这样，读取进度也就清空了。

sincedb文件不会重复读取日志，它里面，有6个存储字段。
1. inode 编号：日志文件唯一 id，日志文件删改重建 inode 会变
2. 设备主号、次号：区分磁盘分区
3. 当前读取字节偏移量：记录上次读到文件第多少字节，下次启动从该位置继续读，不会从头重复采集旧日志
4. 文件最后修改时间戳
5. 日志文件完整路径

**4. syslog插件**

Linux所有服务器的本地日志由 `rsyslog` 管理，logstash里面的 `syslog input` 会监听UDP 514 端口，于是我们产生了一个想法——把logstash伪装成日志服务器(虽然但是，好奇怪的想法，但也还好......不算非常奇怪，嗯)。

我们修改一下其他主机的rsyslog配置，让它们把系统日志远程发给logstash，logstash会自动整理内容，将数据存入ES。

那我们先重新修改管道配置，将文件修改为下面内容。

```ruby
input {
  # 开启syslog接收器，默认监听本机UDP 514端口
  syslog {}
}

output {
  stdout {} # 控制台打印日志，方便实时看效果
  elasticsearch {
    hosts => "192.168.86.161:9200"
    index => "syslog-%{+YYYY.MM.dd}" # 系统日志单独索引
  }
}
```

来到server1，我们修改rsyslog主配置文件，修改三处。加载imudp模块，开启UDP514监听，将所有日志文件转发给server5。重启服务后，就可以看到来自server1的信息了。

![](21.png)

Server5已经收到数据了，我们也可以在Web上也可以过滤查看。

![](22.png)

**5. multiline多行合并插件**

	ES, Java的报错日志每行一条日志，内容太多，杂乱无章，怎么办？我们可以添加multiline插件，将一整段的报错合并为单条完整日志，存进ES中。

我们先从server1拷贝ES日志模板到server5上。然后在server5上修改配置文件。改成下面的内容 。

```ruby
input {
  file {
    path => "/var/log/my-es.log"    # 采集刚才从server1拷贝过来的多行日志文件
    start_position => "beginning"  # 第一次启动从头读取全部日志
    codec => multiline {           # 开启多行合并解码器，专门处理多行日志
      pattern => "^\["             # 正则匹配：以[ 开头的行，是新日志的起始行
      negate => true               # 取反：不匹配上面正则的行，都属于上一条日志的附属多行
      what => previous             # 附属行合并到【上一条】日志里
    }
  }
}

output {
  stdout {}                        # 控制台打印，方便实时看合并效果
  elasticsearch {
    hosts => "192.168.86.161:9200"  # ES集群任意节点IP端口
    index => "myeslog-%{+YYYY.MM.dd}" # 新建独立索引存放合并后的ES报错日志
  }
}
```

最终的效果是，浏览数据的message字段里，很多报错类消息汇聚在一起。

**6. grok日志拆分过滤插件**

	apache 访问日志是一整行的文本乱乱的。比如像 `192.168.56.1 - - [25/Mar/2023:15:31:44 +0800] "GET /index.html HTTP/1.0" 200 15`，就乱乱的。

安装grok插件，就可以解决这个问题啦（每次说到这里，都隐隐觉得自己是在带货）。grok插件可以用正则模板，自动拆分整行日志，将它们拆成独立字段 `clientip、verb、status、bytes` 存入 ES，方便我们筛选查询。

---

## 三、Filebeat日志收集

### （1）理解
	Filebeat是一个轻量日志采集器，部署在业务服务器（客户端）。它能够轻量化采集日志，传给ES，也可以中转给Logstash/Kafka/Redis，替代Logstash直接采集（节省资源）。

它的内部，有下面四个部分。

1. **Input 输入源**：配置监控日志文件路径（支持通配符），多路径分开管理
2. **Harvester 收割机**：每匹配到一个日志文件，自动启动一个收割进程，逐行读取文件新增内容
3. **Spooler 缓冲池**：收割机采集的日志统一存入内存缓冲，批量聚合，减少网络请求
4. **Output 输出端**：聚合后的日志批量发送到目标服务（ES / Logstash / 消息队列）

![](23.png)

### （2）实验

**1. Filebeat采集Apache日志，直接输出Elasticsearch**

我们在客户端安装httpd+Filebeat服务，来采集apache访问和错误日志。

来到server1，安装apache网站，这是产生日志的来源。

![](24.png)

安装Filebeat采集工具，启动apache日志的专用模块。

![](25.png)

在 `apache.yml` 配置文件里，把内容修改为下面的样子。声明使用apache日志模块，开启访问日志采集，告诉Filebeat去哪里读取日志，并开启错误日志的采集（yaml文件蛮注重内容的排版和对齐的，要注意格式，可以用空格代替Tab缩进）。

```yaml
- module: apache
  access:
    enabled: true
    var.paths: ["/var/log/httpd/access_log*"]
  error:
    enabled: true
    var.paths: ["/var/log/httpd/error_log*"]
```

在 `/etc/filebeat/filebeat.yml` 里，注释掉 `output.elasticsearch` 段，打开 `output.logstash` 端，修改filebeat输出，将output.logstash的地址指向 `server5的IP:5011`，然后重启服务。

下面，我们转移阵地，来到server5创建beats管道配置文件 `beats.conf`，填入下面内容。

```ruby
# input 输入：接收Filebeat发来的日志，监听5044端口
input {
  beats {
    port => 5044
  }
}

# filter 过滤清洗层：解析apache杂乱日志，拆分IP、状态码、请求地址
filter {
  grok {
    match => { "message" => "%{HTTPD_COMBINEDLOG}" }
  }
}

# output 输出：清洗完的结构化日志发给server4的ES存储
output {
  elasticsearch {
    hosts => ["http://192.168.86.161:9200"]
    index => "apachelog-%{+YYYY.MM.dd}"
  }
}
```

在beat管道配置文件里，`input{}` 为输入段（接收日志），`filter{}` 为过滤段（拆分日志），`output{}` 为输出端，输出到ES集群里，按日期分成索引。

再次启动Logstash，我们回到server1上检查一下。校验yaml语法，测试与ES的连通性，发现没问题，就启动Filebeat服务了。

![](26.png)

---

## 四、Kibana日志采集

### （1）理解
ELK中，K是Kibana，一个可视化的Web控制台。用来读取ES里的日志，做图表、仪表盘等，让工作人员查看日志页面更加方便。

### （2）实验
我真的生气了ono，这个电脑卡的很啊oooo。

我们在server4上安装Kibana，修改配置 `elasticsearch.hosts`，将它指向ES集群。启动后，通过浏览器访问 `http://192.168.86.161:5601`。在 Management → Index Patterns 中创建索引模式（如 `syslog-*`、`myeslog-*`），随后在 Discover 页面即可按时间、主机、日志级别检索日志。
