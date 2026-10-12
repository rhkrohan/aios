# SIOS look on Fedora: test loop

The SIOS desktop (theme, layout, wallpaper, fonts, splash) lives in `system_files/`
and is copied into the image by `build_files/build.sh`. Two ways to see it:

## 1. Fast, on the Mac (arm64)
Aurora is x86 only, so on Apple Silicon we test the same files on stock Fedora KDE
(the same Plasma 6 as Aurora 44).

1. Install UTM (`brew install --cask utm`).
2. Download the Fedora 44 KDE Plasma Desktop ISO for **aarch64** and install it in UTM
   (4 CPUs, 8 GB memory, 40 GB disk). Turn on SSH: `sudo systemctl enable --now sshd`.
3. From this repo: `ui/sync-vm.sh you@<vm-ip>`. Re-run after every change.

The theme switches on the spot; log out and back in to see the splash screen.
To see exactly what a brand-new user gets, create a fresh user in the VM.

## 2. Real, on x86 (the gate)
1. Push the branch; CI builds and signs the image.
2. Run the "Build disk images" workflow (anaconda-iso) and download the ISO.
3. Install it in VirtualBox on the Windows PC (or on a spare laptop), log in as a new user.

## Regenerating the wallpaper
The tunnel art is drawn in code (`ui/tunnel.mjs`, same as the preview).
`node ui/render-wallpaper.mjs` re-renders every size, light and dark.

## What's where
| File | What it does |
| --- | --- |
| `usr/share/plasma/look-and-feel/org.sios.desktop{,.dark}/` | The SIOS theme: colors, splash, and the top bar + dock layout |
| `usr/share/plasma/plasmoids/org.sios.wordmark/` | The "SIOS" name in the middle of the top bar |
| `usr/share/color-schemes/SIOS{Light,Dark}.colors` | Colors from the preview's design tokens |
| `usr/share/wallpapers/SIOS-Tunnel/` | The tunnel wallpaper, light and dark |
| `usr/share/fonts/sios/` | Instrument Sans, Jost, JetBrains Mono (OFL) |
| `usr/share/kde-settings/kde-profile/default/xdg/` | Defaults for new users: theme, fonts, splash, lock screen, About |
| `usr/lib/plasmalogin/defaults.conf` | Login screen wallpaper |
