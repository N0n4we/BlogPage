# I use NixOS by the way

一年前借新加坡的网给这台3000块钱的笔记本装了Ubuntu
七个月后，可能是期中考压力太大了，总觉得哪里不过瘾，于是花了一周装Arch~~顺便染上了Hyprland[^1]~~。然后完成了一套用于取代VSCode的Neovim配置
三个月后，期末压力太大了，就花了一周装NixOS，然后配置了Niri[^2]，在又一次某个插件Breaking Change之后放弃了Neovim，转向Helix

---

### 好了，下面说正事吧

如何在国内正常的使用Linux？

- 使用GUI
- 使用CLI

主流的内核有*C一串字母、V一串字母、M一串字母、D一小串字母*
有时还需要一个干净的DNS

#### **ArchLinux**

  1. 在安装Arch时，配置国内镜像源，建议使用ArchInstall安装，省时省事
  2. 在装好的Arch上，配置archlinuxcn仓库和镜像源，抠出[^3]需要的一串字母

#### **NixOS**

  1. NixOS配置中添加该一串字母的最后一个正常版本（稳定版仓库通常就是可用的，但是都NixOS了，还不尝尝滚动更新？[^4]）
  2. 通过国内的镜像源安装NixOS

> [!NOTE]
> NixOS的有些包要从github下载文件
> NixOS options中用到的包通常可以从二进制缓存中得到
> 可以先装一个基本可用的系统
> 从NixOS options装别的一串字母、Gnome桌面环境之类的
> 等一串字母正常工作了，再`nixos-rebuild switch`真正的NixOS配置

> [!TIP]
> 有时候，一串字母会因为大更新而崩坏
> 滚动更新会放大得到崩坏版本的可能性
> 所以第一次装的时候，可以多装几个一串字母，以防万一

---

说起来非常不幸，在我装Arch和NixOS的时候，某个重要的C一串字母客户端都因为重大版本更新烂了，浪费了我好几天时间
最终写了个配置用D一小串，配合S一串字母本地DNS，不过那都是后话了……

[^1]: Hyprland-平铺窗口管理器
[^2]: Niri-滚动平铺窗口管理器
[^3]: “抠出”一词来自[blog.nyaw.xyz/nixos-inwall-install]
[^4]: NixOS不会滚挂
