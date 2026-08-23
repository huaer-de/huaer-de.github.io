以下是经过语法修正和格式整理的完整笔记内容。已保留你所有的图片占位符 `![](imageX.png)`，方便你后续替换为实际截图链接。口语化标记和多余空格已清理。

```markdown
---
title: 运维学习笔记 Day4：Shell基础、用户权限与文件系统
date: 2026-04-16 10:00:00
tags: [Linux, CentOS, 实训]
categories: 学习笔记
---

# 运维学习笔记 Day4：Shell基础、用户权限与文件系统

本笔记记录了 Linux 系统管理的核心进阶知识，涵盖文件压缩、Shell 环境、用户与组管理，以及文件系统的权限控制机制。

## 一、文件压缩与解压 (tar)

在 Linux 中，打包和压缩通常使用 `tar` 命令配合不同参数完成。

| 压缩格式 | 算法 | 特点 | 创建命令 | 解压命令 |
| :--- | :--- | :--- | :--- | :--- |
| `.tar.gz` / `.tgz` | gzip | 速度快，通用性强 | `tar -zcf` | `tar -zxf` |
| `.tar.bz2` | bzip2 | 压缩率高，适合大文件 | `tar -jcf` | `tar -jxf` |

> **注意**：使用 bzip2 格式前，需先安装工具：`yum install -y bzip2`。

### 常用参数速查
- `-c`：创建压缩包 (Create)
- `-x`：解压压缩包 (eXtract)
- `-z`：使用 gzip 格式
- `-j`：使用 bzip2 格式
- `-f`：指定文件名（**必须放在最后**，后接文件名）
- `-C`：指定解压到的目标目录

**操作示例：**
```bash
# 将 test 目录打包为 test.tar.gz
tar -zcf test.tar.gz test/

# 将 test.tar.bz2 解压到 /opt 目录
tar -jxf test.tar.bz2 -C /opt/
```

![压缩示例截图1](image1.png)

![压缩示例截图2](image2.png)

---

## 二、命令解释器 (Shell) 与环境变量

Shell 是用户与 Linux 内核之间的“翻译官”，负责解释和执行输入的命令。

### 1. 内置命令 vs 外置命令
- **内置命令**：Shell 自带，执行速度快（如 `cd`, `pwd`, `exit`）。
- **外置命令**：独立的可执行程序文件（如 `ls`, `tar`, `cp`）。

**查看命令类型：**
```bash
type -a 命令名
```
*   `cd is a shell builtin` → 内置命令
*   `ls is /usr/bin/ls` → 外置命令

![type命令演示](image3.png)

### 2. 查看当前 Shell
```bash
echo $SHELL
# 输出示例：/bin/bash
```

![echo $SHELL演示](image4.png)

### 3. 脚本无法直接运行的原因
如果自己写的脚本（如 `hello.sh`）无法直接通过文件名运行，通常是因为以下三个原因：

1.  **没有执行权限**：需使用 `chmod +x hello.sh` 添加。
2.  **不在 PATH 路径中**：系统只在 PATH 环境变量包含的目录里查找命令。
3.  **未指定路径**：即使有执行权限，在当前目录下也必须使用 `./hello.sh` 运行，除非该目录已加入 PATH。

![脚本运行演示](image5.png)

### 4. 实现“输入文件名即运行”
若想实现像 `ls` 一样输入 `hello` 就能运行脚本，需将脚本移动到 PATH 包含的目录中：
```bash
# 查看 PATH 路径
echo $PATH

# 移动到 /usr/local/bin（通常已在 PATH 中）
mv hello.sh /usr/local/bin/hello
```
> `which` 命令只能查找 PATH 路径下的程序，若放在 `/root` 下则无法被找到。

![which命令演示](image6.png)

---

## 三、用户、组与账号管理

用户管理涉及 3 个核心配置文件：
- **`/etc/passwd`**：存放用户基本信息（用户名、UID、GID、家目录、Shell）。
- **`/etc/shadow`**：存放加密后的密码及密码过期策略（安全敏感文件）。
- **`/etc/group`**：存放组信息。

![passwd文件内容](image8.png)

![shadow文件内容](image9.png)

![group文件内容](image10.png)

### 1. UID 与用户类型
| UID 范围 | 用户类型 | 说明 |
| :--- | :--- | :--- |
| 0 | root (超级用户) | 拥有系统最高权限 |
| 1 - 999 | 系统用户 | 用于运行系统服务，通常不可登录 (`/sbin/nologin`) |
| ≥ 1000 | 普通用户 | 日常登录使用的账户 |

### 2. 用户管理核心命令

| 操作 | 命令 | 备注 |
| :--- | :--- | :--- |
| 创建用户 | `useradd 用户名` | 创建时不会自动设置密码，需使用 `passwd` |
| 设置/修改密码 | `passwd 用户名` | 设置后 `/etc/shadow` 中的密码位从 `!!` 变为加密字符串 |
| 锁定用户 | `usermod -L 用户名` | 密码前加 `!`，禁止登录 |
| 解锁用户 | `usermod -U 用户名` | 去除密码前的 `!` |
| 删除用户 | `userdel -r 用户名` | **加 `-r` 才会同时删除家目录和邮件池，否则数据残留** |

#### 操作示例截图
- **创建用户后，密码、UID等信息暂不存在**  
  ![useradd未设密码](image13.png)

- **未设置密码时，shadow 文件中密码位为 `!!`**  
  ![shadow密码位为!!](image14.png)

- **设置密码后，密码位变为加密字符串**  
  ![密码加密后](image15.png)

- **锁定与解锁用户、删除用户**  
  ```bash
  usermod -L 用户名    # 锁定（shadow中密码前出现 !）
  usermod -U 用户名    # 解锁
  userdel 用户名       # 仅删除账号
  userdel -r 用户名    # 删除账号及家目录
  ```
  ![锁定解锁删除演示](image16.png)

### 3. 每次操作后的验证习惯
执行用户管理命令后，建议立即执行以下命令验证结果：
```bash
echo $?                      # 返回 0 表示上一条命令成功
grep 用户名 /etc/passwd /etc/shadow /etc/group   # 查看相关文件条目
id 用户名                     # 查看 UID, GID, 组信息
```

### 4. 切换用户与权限下放

- **切换用户 (`su`)**：
  - `su 用户名`：身份切换，但环境变量不变。
  - **`su - 用户名`**：**完全切换**，包含家目录和环境变量（生产环境必须带 `-`）。
  - 使用 `exit` 切回原用户。

  ![su切换用户演示](image17.png)

- **权限下放 (`sudo`)**：
  - 用于给普通用户临时提权，避免泄露 root 密码。
  - 配置文件：`/etc/sudoers`（**必须使用 `visudo` 命令编辑，自带语法检查**）。
  
  ![visudo编辑sudoers](image18.png)

  **测试 sudo 权限**（切换到 user1 执行）：
  
  ![sudo测试1](image19.png)

  - **配置免密执行**：在配置行末尾添加 `NOPASSWD: ALL`。
    ```
    fox ALL=(ALL) NOPASSWD: ALL
    ```
  - 配置过程截图：
    ![编辑免密配置](image20.png)
    ![免密配置内容](image21.png)
    ![保存并生效](image22.png)
    ![免密执行成功](image23.png)

---

## 四、文件系统权限 (UGO 模型)

### 1. 权限查看与结构
```bash
ls -l    # 查看文件权限
ls -ld   # 查看目录本身的权限
```
权限字符串格式：`-  rw-  r--  r--`
- 第 1 位：文件类型（`-` 普通文件，`d` 目录）。
- 后 9 位：每 3 位一组，分别代表 **所有者(u)**、**所属组(g)**、**其他人(o)** 的权限。

### 2. 权限的数字表示法
| 权限 | 字母 | 数字 | 说明 |
| :--- | :--- | :--- | :--- |
| 读 | r | 4 | 查看文件内容 / 列出目录 |
| 写 | w | 2 | 修改文件 / 目录内增删文件 |
| 执行 | x | 1 | 运行程序 / 进入目录 (cd) |

#### 其他相关命令截图
- **查看当前登录用户**  
  ![w命令](image24.png)
- **登录日志文件**  
  ![last命令](image25.png)
- **清空日志（只有 root 能做）**  
  ![清空日志](image25.png)  
  *（注：此处图片名重复，实际操作中应为不同截图，请核对）*

**常见默认权限：**
- **文件**：`644` (`rw-r--r--`)
- **目录**：`755` (`rwxr-xr-x`)

### 3. 修改权限与归属

| 操作 | 命令示例 | 说明 |
| :--- | :--- | :--- |
| 字符方式修改 | `chmod u+x, g-w, o= file` | u/g/o 配合 +、-、= |
| 数字方式修改 | `chmod 750 file` | 简洁高效 |
| 递归修改 | `chmod -R 755 dir/` | 目录及内部所有文件一起改 |
| 修改所有者 | `chown user1 file` | 将文件所有者改为 user1 |
| 修改所属组 | `chgrp group1 file` | 将文件所属组改为 group1 |
| 同时修改 | `chown user1:group1 file` | 一条命令搞定 |

#### 操作演示截图
- **基础查看权限 (`ls -l` / `ls -ld`)**  
  ![ls -l演示](image26.png)

- **权限数字表示示例**  
  ![权限数字](image27.png)

- **字符方式修改权限**  
  ```
  u = 所有者   g = 组   o = 其他人
  + 添加权限   - 移除权限   = 直接赋值
  ```
  ![字符方式修改](image28.png)  
  ![去掉其他人读权限](image29.png)

- **递归修改权限**  
  ![递归修改](image30.png)

- **修改文件所有者 (chown)**  
  ![chown演示](image31.png)

- **修改所属组 (chgrp)**  
  ![chgrp演示](image32.png)

- **目录 `x` 权限的重要性**  
  - 目录 `x` 权限 = 能否 `cd` 进入  
  - 目录 `r` 权限 = 能否 `ls` 查看内容  
  去掉 `x` 后，即使所有者也无法进入目录；加回 `x` 才恢复正常访问。  
  ![目录x权限演示](image33.png)

### 4. 目录权限的特殊性
- **`r` 权限**：能否执行 `ls` 查看目录内容。
- **`x` 权限**：能否 `cd` 进入目录（**进入权限**）。
- 如果目录仅有 `r` 无 `x`，可以列出文件名，但无法查看文件属性或进入该目录。

---

## 五、特殊权限与 ACL 访问控制

### 1. 特殊权限 (SUID, SGID, Sticky)

| 特殊权限 | 数字位 | 效果 | 适用场景 |
| :--- | :--- | :--- | :--- |
| **SUID** | 4 | 执行文件时，临时拥有**文件所有者**权限 | `/usr/bin/passwd`（普通用户修改密码需写 shadow 文件） |
| **SGID** | 2 | 对**目录**设置后，目录下新建文件自动继承**目录的所属组** | 团队共享目录 |
| **Sticky Bit** | 1 | 仅对**目录**生效，目录下文件只有**所有者**或 **root** 能删除 | `/tmp` 目录（防止互删文件） |

**设置示例：**
```bash
# 设置粘滞位（常见于共享目录）
chmod 1777 /shared

# 设置 SGID 实现组继承
chmod 2770 /project
```
> 注意：如果原本没有执行权限 `x`，设置特殊权限后会显示为**大写** `S` 或 `T`（表示权限异常）。

### 2. ACL 精细权限控制
当标准的 UGO 模型无法满足“给特定某个用户授权”时，使用 ACL。

- **查看 ACL**：`getfacl 文件名`（有 ACL 时，`ls -l` 权限位末尾会显示 `+`）。
- **设置 ACL**：`setfacl -m u:用户名:权限 文件名`
- **删除 ACL**：`setfacl -x u:用户名 文件名`

**示例：**
```bash
# 给 user2 单独授予读写权限，而不修改文件所属组或开放给 Others
setfacl -m u:user2:rw /mnt/test
```

---

## 六、默认权限掩码 (umask)

`umask` 决定了新建文件或目录时的**默认权限**。

### 计算公式
- 目录默认最大权限：`777` (`rwxrwxrwx`)
- 文件默认最大权限：`666` (`rw-rw-rw-`) (文件默认不给 x 权限)
- **默认权限 = 最大权限 - umask 值**

### 不同用户的 umask 值
| 用户类型 | 默认 umask | 新建目录权限 | 新建文件权限 |
| :--- | :--- | :--- | :--- |
| root | 0022 | 755 (`777-022`) | 644 (`666-022`) |
| 普通用户 | 0002 | 775 (`777-002`) | 664 (`666-002`) |

### 临时与永久设置
```bash
# 临时设置（仅当前会话生效）
umask 077

# 永久生效（写入配置文件）
echo "umask 077" >> /etc/profile
source /etc/profile
```

---

## 七、其他常用命令与习惯

| 场景 | 命令 | 说明 |
| :--- | :--- | :--- |
| 查看当前登录用户 | `w` 或 `who` | `w` 更详细，能看到用户在运行什么命令 |
| 查看历史登录记录 | `last` | 读取 `/var/log/wtmp` 文件 |
| 清空日志文件 | `> /var/log/wtmp` | 重定向覆盖（黑客清痕迹常用手法，需 root） |
| 新建/删除组 | `groupadd` / `groupdel` | 删除组前需确保组内无用户 |
| 非交互式设密码 | `echo "密码" \| passwd --stdin 用户名` | 常用于脚本批量创建用户 |

> **运维铁律**：每次执行关键命令后，习惯性运行 `echo $?` 确认返回值为 `0`。

---

> 本次笔记整理完毕。后续若有更新，会继续完善 ovo
```



---
title: Hello World
---
Welcome to [Hexo](https://hexo.io/)! This is your very first post. Check [documentation](https://hexo.io/docs/) for more info. If you get any problems when using Hexo, you can find the answer in [troubleshooting](https://hexo.io/docs/troubleshooting.html) or you can ask me on [GitHub](https://github.com/hexojs/hexo/issues).

## Quick Start

### Create a new post

``` bash
$ hexo new "My New Post"
```

More info: [Writing](https://hexo.io/docs/writing.html)

### Run server

``` bash
$ hexo server
```

More info: [Server](https://hexo.io/docs/server.html)

### Generate static files

``` bash
$ hexo generate
```

More info: [Generating](https://hexo.io/docs/generating.html)

### Deploy to remote sites

``` bash
$ hexo deploy
```

More info: [Deployment](https://hexo.io/docs/one-command-deployment.html)
