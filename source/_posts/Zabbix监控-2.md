---
title: Zabbix监控-2
date: 2026-08-15 01:22:22
tags: [Linux, Rocky9, 运维, Zabbix, 监控]
categories: 大二集训
---

<!-- # 8.6 笔记：Zabbix 监控应用初步 -->

# Zabbix 监控应用初步

<!-- 这是8/6的笔记，我们开始学习了解Zabbix监控的应用。 -->
这篇笔记，我们开始具体学习 **Zabbix监控的应用**。

---

## 一、添加监控主机

添加Agent，需要我们去Zabbix官网找对应的安装包，并安装对应的服务包，安装好后修改配置文件。将服务指向Server端，修改自己的名字。然后启动服务，设置开机自启。

![](1.png)

在Agent端启动服务后，来到前端界面。在配置，主机里，添加server3的信息（这里我们使用了Linux Zabbix agent的模板，和Linux servers群组，根据实际情况来就好）。

![](2.png)

实际操作的时候，不知为何（可能是乱改过......嘛？），我的路径和老师的有一定区别（但我是按照老师的操作一步步来的......吧），我的agent读的文件在 `/etc/zabbix_agentd.conf`

![](3.png)

我们在进程里看到，`zabbix_agentd` 读取的文件，实际路径在 `/etc/zabbix_agentd.conf`，这是二进制程序写死的路径。我们在这里配好内容，就可以和server连接啦。

---

## 二、快速入门

我们来到官方文档 [zabbix入门使用指南](https://www.zabbix.com/documentation/6.0/zh/manual/quickstart) 里，看到它提供了6个模块，我们一起来看一看。

因为这里图片很多，我上传博客的话，要一个个建文件，比较麻烦（），就暂时不在这儿记录啦（但考虑在B站上录个教学的小视频）。

快进，我们到下一节。

---

## 三、服务监控

下面我们要学习Zabbix的三大服务监控，分别是Nginx Web服务监控，MySQL数据库监控和Java/Tomcat应用监控（当然还有别的，但我们先学这几个）。

### 1. Nginx Web 服务监控

#### （1）理解
Zabbix的Nginx Web服务监控，是通过Zabbix采集Nginx的运行状态，监控Web服务是否正常，负载情况。我们在被监控服务器上，安装内置的，带 `ngx_http_stub_status_module` 状态模块的Nginx源。这个状态模块是输出监控数据的核心。Nginx 对外输出运行状态数据后，可以让Zabbix读取数据。

在Nginx配置里，我们在被监控机器 `/etc/nginx/nginx.conf` 或站点conf里添加status专用location，让Agent主动拉取数据，在server端主机关联Web server模块，添加模板 `Template Web server Nginx`。

模板内置预定义了很多监控项，这样，我们就能实现监控。

#### （2）实验
> 很像机器人一样的，我们还是在...安装软件，修改配置，重启服务。

![](4.png)

我们添加的内容如下：

![](5.png)

再次再次进入Web的主机界面，我们加上 `Nginx by Zabbix agent` 的模板。

### 2. MySQL 数据库监控

#### （1）理解
MySQL 数据库监控能够监控 MySQL的运行状态，我们还是用的Zabbix的内置模板。是 `MySQL by Zabbix agent`。进入模板详细界面，根据它的描述，进行实验。

同样地，我们在Agent端安装mysql服务，创建专用监控账号，然后就可以用模板了。如果想用其他的模板，也可以在网上下载xml文件后，导入Zabbix里。

#### （2）实验
在Web找到模板的描述。

![](6.png)

安装mysql客户端的软件（mysql-server），根据模板提示，创建数据库专用的监控用户。

![](7.png)

拷贝模板，重启服务后，创建mysql客户端配置。这里配置文件的内容就是Web上，介绍页里的内容。

![](8.png)

再次进入Web里，主机界面。我们添加MySQL官方模板。

![](9.png)

### 3. Java/Tomcat 应用监控

#### （1）理解
这小节的监控模板，不是官方自带的，是我们从别的地方拷的哦。Java是应用里蛮常用的编程语言，它有自己独有JMX协议。我们监控它要用Server+Java Gateway中转采集。我们新建一个CentOS7的server3。

感觉这小节比前两节难一点。可能是之前安装过，再安装的时候总会有奇怪报错，乱糟糟的冲突。但之前初学，步骤并没有记住，也不知道在干嘛。

#### （3）实验
我们来到Web上，把老师发的文件模板拷进去。

![](10.png)

新建一个CentOS7的server3，来监控它的Tomcat Percona情况。装一下percona-zabbix-templates，把userpar...那个模板拷到 `/etc/zabbix/zabbix_agentd.d` 里，然后重启zabbix服务。安装mariadb-servre(好像是mysqld的平替)和php, php-mysql。我们激活mariadb服务，新建一个有所有权限的管理员。

![](11.png)

我们进入php的配置目录，在 `/var/lib/zabbix/percona/scripts/` 低下，我们修改 `ss_get_mysql_stats.php` 里的用户和密码的信息。

![](12.png)

然后执行 `su -s /bin/sh -c "/var/lib/zabbix/percona/scripts/get_mysql_stats_wrapper.sh gg" zabbix` 的脚本。发现有返回值后，我们的客户端就算配置好了。我们去服务端再操作一下。

先安装好jmx服务，设置zabbix-java的开机自启。看到10050端口已经正常访问后，我们修改zabbix_server的配置。

```
JavaGateway=192.168.86.151 #jmx服务所在主机地址
JavaGatewayPort=10052
StartJavaPollers=5
```

再重启服务，tomcat服务就生效了OvO

![](13.png)

来到server2上，解压一下apache-tomcat，修改一下 `bin/cataline.sh` 的配置。

![](14.png)

版本不同，配置改的是有区别的。对于tomcat8.5（我在用的这个），我们找到 `CATALINA_OPTS=`，填入

```
CATALINA_OPTS='-Dcom.sun.management.jmxremote.port=8888
-Dcom.sun.management.jmxremote.ssl=false
-Dcom.sun.management.jmxremote.authenticate=false'
```

对于tomcat9，我们要添加换行符，内容如下。

```
CATALINA_OPTS='-Dcom.sun.management.jmxremote.port=8888 \
-Dcom.sun.management.jmxremote.rmi.port=8889 \
-Dcom.sun.management.jmxremote.ssl=false \
-Dcom.sun.management.jmxremote.authenticate=false'
```

重启Tomcat服务（先用 `/usr/local/tomcat/bin/shutdown.sh` 关闭，又用 `/usr/local/tomcat/bin/startup.sh` 开启），这时候，我们的JMX端口8888已经开始监听了。

来到Web界面，添加jmx接口，更新一下。

![](15.png)

这里需要注意，JMX如果想和代理proxy一起打开，
我还是觉得Zabbix监控的成功与否，与运气紧密相关。运气好的时候顺顺的，不太好的时候总有奇怪报错，但似乎也不止是Zabbix，生活很戏剧性，这里我就不加以赘述了。

---

## 四、集成外部告警

### （1）理解
Zabbix原生的告警比较少，我们可以把Zabbix和其他的第三方AI平台结合起来，产生告警。比如我们可以用Zabbix对接Alops云告警平台，实现更丰富的告警效果。

### （2）实验
在浏览器注册aiops账号，进来关联一下Zabbix的监控工具。

![](16.png)

进入详细页，我们看到右面有一个配置步骤。我们跟着它做，配置探针。

![](17.png)

跟着他的步骤来，安装探针。

![](18.png)

当我们再去Web上查看时，会发现脚本已经安装成功了。这时候我们就可以去睿象云绑定账号信息了。去“配置”里改一下通知策略，可以去个人用户中心中绑定一些通知的方式。比如我绑定了一下微信小程序OvO。

![](19.png)

---

## 五、Zabbix API 自动化管理

### （1）理解
我们为什么想用API添加主机呢？因为它比较方便。如果我们想大批量地上线服务器，可以写一个脚本，循环调用 `host.create`，这样就不需要人工登录网页，去点点点，实现自动化运维。

基本的步骤是：`user.login`：拿 token（通行证）--> `host.get`：查现有主机，获取 hostid --> `host.delete`：传入 hostid 删除旧主机（可选） --> `host.create`：创建新监控主机，填 IP、分组、模板。

### （2）实验

**1. 获取token**

下面的result就是我们想要的token啦。

![](20.png)

**2. 获取主机列表**

auth是tocken，后面操作都是。

![](21.png)

**3. 删除主机**

记得吧params的id替换为刚刚看到的hostid哦。

![](22.png)

**4. 添加主机**

![](23.png)

> 我们的内容就到这里结束啦，拜拜。