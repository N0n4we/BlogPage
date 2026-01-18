# 又花了一天半调NixOS

前天晚上更新`sddm`，theme不加载，丑死了
于是昨天早上起来换了个display manager，我看`ly`就不错，TUI很Simple
一换给`Niri`输入法整爆了，在终端没法用
我还要用`helix`，这怎么行？
刚开始怀疑是`kitty`对输入法兼容不好，在`Hyprland`里试试，发现输入法正常
然后一直怀疑是NixOS Options维护者的问题，换Flake也试过了，手动配`Niri`也试过了，还把stable、unstable、git版都试了一通
最后从`ly`登陆shell，再从shell运行`niri`发现正常了
Gemini说`ly`直接登陆`Niri`的话**GTK_IM_MODULE**之类的不会加载，但我觉得它出幻觉了，这些变量在`kitty`里echo得出来

可能再换个display manager就正常了，或者可能等YaLTeR把`Niri`修一下就正常了，或者solution已经在某个地方但我没找到

顺便换掉`kitty`，`alacritty`居然有vi mode，复制文本再也不用摸鼠标了

暂时没办法，先从shell启动`niri`用一用，等上游更新吧

